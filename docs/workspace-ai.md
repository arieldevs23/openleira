# Workspace AI

Workspace adalah tim agent AI yang bekerja di **satu folder aplikasi**. Tiap tim diisi satu agent yang fokus ke bidangnya. **Orchestrator** menerima task dari kamu, memecahnya jadi subtask, membagikannya ke tim sesuai **flow** yang kamu gambar, meneruskan hasil antar tim, lalu menulis ringkasan akhir. Dua lapisan lintas-tim: **Skills** (skill yang dipasang ke agent) dan **Audit** (agent yang memeriksa hasil tiap tim sebelum dianggap selesai). Satu server bisa punya banyak workspace, satu per aplikasi.

![Workspace: sidebar workspace, canvas dengan flow, panel hasil](images/kantor-ai/workspace-canvas-flow.png)

## Konsep

| Istilah | Arti |
| --- | --- |
| Workspace | Satu per folder aplikasi (`offices.project_path`). Bisa banyak per server; dipilih di sidebar mode canvas. Di kode dan API namanya masih `office`. |
| Flow | Panah antar tim (`office_flow_edges`) yang kamu gambar di canvas: kerjaan tim tujuan menunggu kerjaan tim asal. |
| Tim | Kelompok kerja di workspace (di kode: `division`). Default: orchestrator, Planner, Desain UI/UX, Backend, Frontend, Security, Docs, dan QA/Audit. |
| Agent | Tepat satu per tim: nama, peran (`role_prompt`), provider + model, tools yang boleh, skills, aktif/tidak. |
| Task | Permintaan utama kamu (judul + deskripsi; di kode: `case`). Status: `draft`, `running`, `waiting_user`, `done`, `failed`. |
| Subtask | Pecahan task dari orchestrator untuk satu tim (di kode: `task`). Status: `queued`, `running`, `review`, `done`, `failed`, `blocked`. |
| Message bus | Semua komunikasi (`assign`, `result`, `question`, `audit_pass`, `audit_fail`, `note`). Tim tidak pernah bicara langsung satu sama lain. |

Tabel di database: `offices`, `office_divisions` (termasuk posisi node `pos_x`/`pos_y`), `office_agents`, `office_cases`, `office_tasks` (termasuk `changed_files`), `office_messages`, `office_flow_edges`. Kolom yang ditambahkan setelah rilis pertama dibuat lewat migrasi `ALTER TABLE` saat server start. Diberi awalan `office_` karena `case` adalah kata kunci SQL.

## Alur data

```
kamu ──task──▶ orchestrator (giliran rencana, output JSON)
                   │
                   ▼  subtask (division_slug, title, instruction, depends_on)
            ┌──────┴──────────────────────────┐
            ▼                                 ▼
   tim A (sesi provider)         tim B (menunggu A selesai)
            │ result (## Ringkasan)           ▲
            ▼                                 │ ringkasan A diteruskan lewat message bus
          audit ──pass──▶ done ───────────────┘
            │
            └─fail──▶ queued lagi + catatan audit (maks 2 kali ulang, lalu failed)
                          │
                          └─▶ orchestrator diberi tahu (giliran check-in)
semua subtask selesai ──▶ orchestrator menulis ringkasan akhir ──▶ task done / failed
```

1. **Rencana.** Orchestrator dijalankan sebagai sesi provider biasa (`cwd = project_path`, model = model orchestrator) dengan perannya, task-nya, dan daftar tim. Dia harus menjawab JSON: `{ summary, tasks: [{ id, division_slug, title, instruction, depends_on }], question }`. Kalau JSON-nya tidak valid, orchestrator diminta sekali lagi dengan instruksi yang lebih ketat; kalau tetap gagal, task jadi `failed` dengan pesan yang jelas. Kalau task-nya terlalu kabur, orchestrator boleh mengembalikan satu `question` — task menunggu jawabanmu.
2. **Eksekusi.** Subtask jalan hanya kalau semua dependensinya `done`, maksimal `max_parallel` sesi (subtask + audit) sekaligus per task (default 2, bisa diatur di pengaturan workspace). Tiap subtask = satu sesi provider dengan peran agent tim + instruksi + ringkasan hasil subtask dependensinya.
3. **Audit.** Tiap subtask yang selesai masuk `review`, lalu agent audit menjawab `{ pass, notes, fixes }`. Lolos → `done`. Gagal → `queued` lagi dengan catatan audit ditempel ke instruksi, dan sesi tim yang sama dilanjutkan dengan umpan balik audit. Setelah 2 kali ulang, subtask `failed`, subtask yang bergantung padanya `blocked`, dan orchestrator diberi tahu. Jawaban audit yang tidak bisa dibaca dihitung gagal (fail closed).
4. **Check-in orchestrator.** Pesanmu ke orchestrator dan laporan subtask yang gagal disimpan sebagai `note` yang belum dibaca. Begitu orchestrator bebas, dia dapat giliran check-in: boleh membalas, menambah subtask, atau mengganti subtask yang gagal (`replaces`) — subtask yang tadinya `blocked` lalu menunggu penggantinya.
5. **Ringkasan akhir.** Setelah semua subtask selesai, orchestrator menulis laporan markdown. Task `done` kalau semua subtask selesai (atau subtask yang gagal sudah digantikan subtask yang selesai), selain itu `failed`.

Orchestrator memakai **satu sesi yang sama** untuk semua gilirannya, jadi dia ingat rencananya sendiri.

Setiap task baru dimulai dengan sesi orchestrator yang baru. Supaya dia tetap nyambung, prompt rencananya menyebutkan nama dan folder workspace, plus **5 task terakhir yang sudah selesai atau gagal**: judul, status, ringkasan hasil, dan file yang diubah. Permintaan pendek seperti "tambahin fitur" dianggap lanjutan dari kerjaan itu, dan orchestrator diminta tidak menanyakan proyek mana kalau riwayatnya sudah jelas.

### Sesi, permission, dan realtime

- Setiap giliran agent adalah **sesi app biasa**: dibuat lewat `sessionsService.createAppSession` dan dijalankan lewat `runDetachedChatTurn` (runner provider, pemetaan id sesi, notifikasi, dan permission yang sama dengan chat). Sesi muncul di sidebar proyek dan bisa dibuka di chat (tombol **buka di chat**).
- Default mode permission workspace adalah `bypassPermissions`; sebelum task pertama jalan muncul peringatan sekali. Mode `acceptEdits` dan `default` bisa dipilih di pengaturan workspace — permintaan izin tool lalu muncul di sesi chat yang bersangkutan.
- Setiap perubahan workspace/tim/agent/task/subtask/pesan dikirim lewat WebSocket chat yang sudah ada sebagai frame `office:update` berisi baris yang berubah. Transcript sesi yang berjalan mengalir sebagai frame `office:log`. Halaman workspace tidak pernah polling; setelah reconnect dia mengambil snapshot sekali.
- Saat server start, task yang tadinya `running` diparkir jadi `waiting_user` (alasan `interrupted`) dan subtask yang sedang jalan kembali ke `queued`. Klik **lanjut** untuk meneruskan; subtask melanjutkan sesinya sendiri.

## Mode normal dan mode canvas

Pojok kanan atas header sekarang berisi saklar **normal / canvas** (dulu tempat tab chat, shell, file).

- **Mode normal:** sidebar berisi tab **chat** (obrolan bebas), **proyek**, **jalan**, dan **arsip**. Tab chat, shell, file (plus browser/tasks/plugin kalau aktif) ada di **rail ikon vertikal** di kiri konten; di HP jadi baris di bawah header.
- **Mode canvas:** sidebar proyek disembunyikan dan diganti sidebar workspace sendiri, jadi dua dunia itu tidak bercampur. Tata letaknya: sidebar workspace di kiri, canvas di tengah, panel hasil di kanan. Di bawah 900px, sidebar dan panel kanan jadi drawer.

![Mode normal: rail tab di kiri, saklar mode di kanan atas](images/kantor-ai/workspace-normal-mode.png)

### Proyek cuma di-prompt lewat canvas

Supaya agent di workspace ga bentrok sama chat manual di folder yang sama, semua proyek cuma bisa dikasih perintah lewat canvas.

- **Klik proyek = buka canvas-nya.** Baris proyek di sidebar ga lagi punya daftar sesi atau tombol "sesi baru". Proyek yang belum punya workspace langsung ditawari bikin workspace.
- **Chat bebas tetap ada** di tab **chat** (workspace bawaan `obrolan`). Itu satu-satunya tempat kotak chat biasa.
- **Sesi lama proyek disembunyiin**, bukan dihapus: tab "percakapan" hilang, arsip cuma nampilin chat obrolan. Sesi agent masih bisa dibuka dari canvas (tombol "buka sesi") buat dibaca; kotak ketiknya diganti tulisan "prompt lewat canvas" plus tombol **buka canvas**.
- **Shell dan file tetap ada** di mode normal buat proyek yang lagi kebuka di canvas (ganti workspace di canvas, proyek di mode normal ikut ganti). Terminal di proyek selalu shell biasa, bukan CLI agent. Selama ada task yang `running` di proyek itu, simpan/buat/rename/hapus/upload file ditolak (`423 PROJECT_BUSY`) dan terminal ngasih peringatan.
- **Dijaga di server juga:** `chat.send` / `chat.edit-send` dan `POST /api/providers/sessions` ditolak dengan `PROJECT_CANVAS_ONLY` kalau foldernya bukan workspace obrolan (termasuk `cwd` yang dikirim klien). Runner canvas tetap jalan karena lewat `runDetachedChatTurn`, bukan jalur chat. Folder obrolan dibaca dari `VITE_OBROLAN_DIR`, atau `<VITE_HOME_DIR>/obrolan`, default `/home/hermes/obrolan`, sama kayak frontend.

### Task cepat

Klik kanan tim kerja → **kasih task cepat**: isi judul (dan detail kalau perlu), langsung jalan di tim itu. Ga ada rencana orchestrator, audit, atau ringkasan; hasilnya jawaban tim itu sendiri. Cocok buat kerjaan kecil. Cuma provider tim itu yang harus sudah login. Task cepat ditandai label **cepat** di daftar task dan ga punya kotak pesan ke orchestrator.

### Sidebar workspace

Tiga grup yang bisa dilipat (diingat per browser):

- **Workspace:** semua workspace dengan path foldernya dan jumlah task yang sedang jalan. Klik kanan untuk buka, pengaturan, atau hapus (folder dan isinya tidak ikut terhapus). Tombol **tambah workspace** ada di sini.
- **Task:** task workspace yang dipilih, plus **task baru**.
- **Agent:** tiap agent bisa dibuka (panah) untuk melihat model dan **peran markdown**-nya; klik namanya untuk membuka panel agent.

Sidebar kiri dan panel kanan bisa **disembunyikan ke samping** (tombol panel di pojoknya) supaya canvas lebih luas; yang tersisa hanya rail tipis dengan tombol untuk membukanya lagi. Pilihan ini diingat per browser. Mengklik node saat panel kanan tersembunyi membukanya lagi.

## Menambah workspace

Workspace selalu terikat ke folder, jadi foldernya dipilih dulu:

1. **Folder baru:** ketik path folder baru (atau cari folder induknya). Folder dibuat dan didaftarkan sebagai proyek lewat alur pembuatan proyek yang sudah ada, lalu workspace dibuat dengan tim default. Folder yang sudah berisi file ditolak di pilihan ini.
2. **Aplikasi yang udah ada:** tunjuk foldernya. Kalau belum jadi proyek, didaftarkan. Lalu pilih:
   - **Analisis pakai AI.** Pilih model (hanya dari provider yang terhubung). Satu agent membaca repo **read-only** (di Claude hanya `Read`, `Glob`, `Grep`; mode permission `default`) dan menjawab JSON `{ summary, divisions: [...] }`. Kamu review usulannya: ganti nama tim/agent, edit deskripsi dan peran, hapus, atau tambah. Orchestrator dan audit selalu ditambahkan otomatis, dan ringkasan aplikasi ditempel ke peran orchestrator. Sesi analisis muncul di daftar sesi proyek.

     **Progres dan background.** Selama analisis jalan, modal menampilkan tahapnya (mulai → baca kode → nyusun usulan → selesai), waktu berjalan, jumlah langkah, dan daftar live file yang dibaca serta pencarian yang dilakukan agent (40 langkah terakhir). Modal boleh ditutup (**jalan di background**): analisisnya jalan di server, bukan di browser. Analisis yang masih jalan, sudah selesai, atau berhenti muncul di grup **workspace** di sidebar dengan tahap dan jumlah langkahnya. Klik untuk membuka lagi modalnya di posisi terakhir (progres, review, atau coba lagi). Analisis yang masih jalan bisa **dibatalin** (sesinya dihentikan). Yang sudah selesai bisa dibuang dengan tombol ×. Semua update lewat frame WebSocket `office:analysis` (tanpa polling). Hasilnya disimpan di memori server selama satu jam, dan hilang dari daftar begitu foldernya sudah punya workspace.
   - **Pakai tim default** tanpa analisis.

Path harus berada di dalam `WORKSPACES_ROOT` server, sama seperti pembuatan proyek biasa.

![Tambah workspace](images/kantor-ai/workspace-add.png)

## Setup provider dan model

Wizard setup terbuka sekali per workspace selama setup belum lengkap, dengan dua langkah:

- **Hubungkan provider.** Daftar Claude, Codex, Cursor, dan OpenCode beserta status login-nya. Tombol **hubungkan** membuka terminal di server tempat app jalan (misalnya VPS) dan menjalankan perintah login CLI provider itu, sama seperti di onboarding dan Settings > Agents. Login tersimpan di CLI provider di server; workspace tidak menyimpan API key.
- **Pilih model.** Pilih model per agent atau pakai **terapkan ke semua**. Yang muncul hanya model dari provider yang sudah terhubung. Model yang tersimpan di provider yang kemudian logout tetap terlihat dengan tanda "belum terhubung".

Task tidak bisa dijalankan selama ada agent aktif tanpa model atau yang provider-nya belum login; server juga menolak `start`/`resume` dengan kode `OFFICE_PROVIDERS_NOT_CONNECTED`.

## Canvas

- **Zoom dan geser:** scroll/pinch/tombol + − (keyboard `+` `-` `0`), tarik latar kosong untuk menggeser.
- **Pindah posisi:** tahan dan seret node agent. Posisi agent dan node skill disimpan di server. Klik kanan node → **balikin posisi**, atau klik kanan canvas → **rapiin otomatis**.
- **Gambar flow:** arahkan kursor ke node, tarik titik di bawahnya ke agent lain. Atau klik kanan node → **hubungkan ke…**, lalu klik agent tujuan (cocok untuk layar sentuh). Panah yang akan membuat putaran ditolak.
- **Klik kanan (atau tahan di layar sentuh)** jadi tempat utama aksi, supaya toolbar tidak penuh teks:
  - node: buka agent, model, peran (markdown), tools, skills (masing-masing langsung membuka bagian itu di panel kanan), hubungkan ke…, pesan sama orchestrator, aktifin/matiin, balikin posisi, hapus tim;
  - panah: detail, hapus panah;
  - canvas kosong: **tambah agent di sini** (agent custom dengan nama, peran, dan warna sendiri, muncul di titik yang diklik), **tambah skill di sini**, **tempel skill**, **kirim pesan ke orchestrator**, rapiin otomatis, pas layar;
  - node skill: buka skill, hubungkan ke agent…, salin, balikin posisi, hapus dari bagan;
  - garis skill: lepas skill dari agent.
- Tiap node menampilkan model, status live, dan **token** yang dipakai tim itu di task yang dipilih.

![Menu klik kanan](images/kantor-ai/workspace-context-menu.png)

### Skill di bagan

Skill tidak lagi diatur di sidebar atau panel agent, tapi di bagan:

- Klik kanan canvas kosong → **tambah skill di sini**, lalu pilih salah satu skill yang ter-install (atau ketik namanya). Skill jadi node ungu di titik itu.
- **Agent punya skill kalau terhubung ke node skill itu.** Tarik titik di bawah agent ke node skill, atau titik di atas node skill ke agent, atau klik kanan → hubungkan. Garis ungu putus-putus menunjukkan hubungannya; klik kanan garisnya untuk melepas.
- **Ctrl+C / Ctrl+V:** pilih node skill, salin, lalu tempel. Salinannya muncul di posisi kursor, supaya garisnya tidak perlu melintasi seluruh bagan. Salinan node dengan nama sama tetap skill yang sama. Skill yang disalin bisa ditempel juga di workspace lain.
- Server menyimpan node skill (`office_skill_nodes`) dan hubungannya (`office_skill_links`), lalu menulis ulang daftar skill agent dari hubungan itu, jadi orkestrator tetap memakai `agent.skills`. Skill yang sudah dipasang ke agent sebelum fitur ini otomatis ditaruh di bagan dan dihubungkan.
- Panel agent menampilkan skill yang terhubung (hanya baca). Klik node skill untuk melihat deskripsinya, agent mana saja yang punya, melepasnya, menyalin, atau menghapus node. Node skill yang tidak ter-install ditandai.

### Pertanyaan orchestrator dan pesan

- Kalau orchestrator bertanya (task `waiting_user`, alasan `question`), pertanyaannya muncul sebagai **gelembung di sebelah node orchestrator**, lengkap dengan kotak jawab. Jawaban dikirim sebagai pesan ke orchestrator, dan itu yang melanjutkan task-nya. Gelembung bisa dikecilkan jadi chip supaya tidak menutupi node.
- Kotak **pesan ke orchestrator** menempel di bawah panel kanan dan tetap terlihat walau panelnya di-scroll atau sedang menampilkan agent/skill. Klik kanan → **kirim pesan ke orchestrator** membuka panel dan langsung menaruh kursor di kotak itu.

### Kalau ada yang gagal

- **Limit provider (kuota abis).** Kalau agent cuma bales pesan limit (misalnya Claude: `You've hit your session limit · resets 6pm (UTC)`), task-nya ga dihitung gagal. Task diparkir dengan status **nunggu (limit provider)**, pesannya ditampilin, dan jatah audit ga kepake. Kerjaan yang kepotong balik ke tempatnya: subtask balik ke antrian, audit diulang, langkah orchestrator diulang. Tunggu reset, terus klik **lanjut**. Deteksinya cuma buat jawaban pendek (maks. 400 karakter), jadi laporan agent yang kebetulan ngebahas "rate limit" ga ikut kena.
- **Task yang udah `gagal`** punya tombol **ulangi yang gagal**. Subtask yang gagal atau ke-block balik ke antrian dengan jatah audit baru, dan sesinya tetap sama jadi agent nerusin dari situ. Subtask yang udah selesai ga diulang. Terus orchestrator bikin ringkasan baru. Kalau yang gagal rencananya (belum ada subtask), orchestrator bikin rencana ulang.

### Flow sebagai aturan

Flow adalah aturan, bukan pengganti orchestrator. Orchestrator tetap merencanakan subtask, dan prompt-nya menyebutkan flow. Setelah subtask dibuat, server menambahkan dependensi sesuai flow:

- Subtask sebuah tim menunggu **semua subtask hidup** di tim yang tepat sebelumnya. Tim yang tidak dapat kerjaan di task itu dilewati (`planner → backend → docs` tetap membuat docs menunggu planner kalau backend tidak dapat subtask).
- Cabang yang terpisah (misalnya `planner → backend` dan `planner → frontend`) jalan **paralel**.
- Subtask yang sudah diganti (`replaces`) tidak dihitung; penggantinya yang dihitung.
- Kalau dependensi dari rencana orchestrator bertentangan dengan flow sampai membuat subtask saling tunggu, dependensi rencana itu dibuang: flow yang menang.
- Flow kosong berarti urutan sepenuhnya ditentukan orchestrator, seperti sebelumnya. Orchestrator dan audit tidak termasuk flow.

Flow diterapkan setiap kali subtask ditambahkan (rencana awal dan check-in). Mengubah flow di tengah task berlaku untuk subtask yang ditambahkan setelahnya.

## Panel kanan: hasil, file, token

Untuk task yang dipilih ada tiga tab:

- **Hasil:** kontrol task, timeline subtask, chat dengan orchestrator, dan ringkasan akhir (sama seperti sebelumnya).
- **File:** **"hasilnya disimpan di"** path folder workspace (bisa disalin), lalu pohon folder seperti file explorer berisi file yang ditulis/diedit tiap subtask (dicatat dari tool call `Write`/`Edit`/patch agent; titik warna menunjukkan tim mana). Klik file untuk pratinjau isinya. File di luar folder workspace ditampilkan terpisah.
- **Token:** total token task (input, output, cache), batang per tim, dan rincian per sesi. Angka diambil dari transcript provider sendiri: sesi Claude dijumlahkan per pesan API, Codex dan OpenCode memakai total berjalan yang mereka laporkan, Cursor tidak melaporkan token. Angka diperbarui saat ada perubahan subtask/task (frame WebSocket), bukan polling.

Klik node atau agent di sidebar membuka panel agent. Setiap bagiannya bisa dilipat: agent (nama, tim, warna, aktif), model, peran (pratinjau markdown atau edit), tools, skills, serta kerjaan dan transcript.

![Tab file](images/kantor-ai/workspace-files.png)

## API

Semua di bawah `/api/office` (butuh login):

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/?projectId=` | Snapshot workspace sebuah folder (atau `null`), termasuk `flow` |
| GET | `/workspaces` | Semua workspace dengan proyek dan jumlah task |
| POST | `/` | Buat workspace `{ projectId, locale, divisions?, appSummary? }` |
| DELETE | `/:officeId` | Hapus workspace (folder tidak disentuh) |
| POST | `/folders` | Siapkan folder `{ path, mode: 'new' \| 'existing' }` |
| POST / GET | `/analyses`, `/analyses/:id` | Mulai / baca analisis aplikasi `{ projectId, provider, model, locale }` |
| GET | `/analyses` | Analisis yang masih jalan atau menunggu review |
| POST / DELETE | `/analyses/:id/cancel`, `/analyses/:id` | Batalkan analisis yang jalan / buang analisis yang selesai |
| POST / DELETE | `/:officeId/flow` | Tambah / hapus panah `{ fromDivisionId, toDivisionId }` |
| GET | `/:officeId/cases/:caseId/usage` | Pemakaian token task |
| POST / PATCH / DELETE | `/:officeId/skills[/:nodeId]` | Tambah node skill `{ skillName, position }`, pindah `{ position }`, hapus |
| POST / DELETE | `/:officeId/skills/:nodeId/links[/:divisionId]` | Hubungkan / lepas skill dari tim `{ divisionId }` |
| PATCH | `/:officeId` | `name`, `maxParallel`, `permissionMode`, `permissionWarningAcknowledged` |
| POST/PATCH/DELETE | `/:officeId/divisions[/:divisionId]` | Kelola tim (termasuk `agentName`, `rolePrompt`, `position`) |
| PATCH | `/:officeId/agents/:agentId` | Edit agent (`model: null` menghapus model) |
| PUT | `/:officeId/agents/models` | Wizard: `{ assignments: [{ agentId, provider, model }] }` |
| POST/GET/PATCH/DELETE | `/:officeId/cases[/:caseId]` | Kelola task (`quickDivisionId` di POST bikin task cepat untuk satu tim) |
| POST | `/:officeId/cases/:caseId/{start,pause,resume,retry,cancel}` | Kontrol task (`start`/`resume` ditolak 409 `OFFICE_PROVIDERS_NOT_CONNECTED` kalau provider agent aktif belum login) |
| POST | `/:officeId/cases/:caseId/notes` | Pesan ke orchestrator `{ text }` |

Kode backend ada di `server/modules/office` (orchestrator, parser rencana, scheduler, prompt, runner), repository di `server/modules/database/repositories/office*.db.ts`, frontend di `src/modules/office`.

## Keterbatasan

- **Satu working tree bersama.** Semua tim bekerja di folder proyek yang sama. Subtask paralel yang menyentuh file yang sama bisa bentrok; belum ada worktree per tim. Turunkan `max_parallel` ke 1 kalau itu jadi masalah.
- **Bypass permission ditolak kalau server jalan sebagai root.** Claude Code menolak `--dangerously-skip-permissions` untuk root/sudo, jadi di mode default task langsung gagal dengan pesan itu. Jalankan server sebagai user biasa, atau pakai mode `acceptEdits`.
- **Mode permission yang lebih ketat tidak ditampilkan di halaman workspace.** Permintaan izin tool muncul di sesi chat yang bersangkutan; sampai disetujui, subtask terlihat masih `running`.
- **Jeda tidak menghentikan sesi yang sedang jalan.** Jeda hanya menahan subtask baru; sesi yang sedang jalan dibiarkan selesai dan hasilnya dicatat. Untuk menghentikan paksa, pakai **batal**.
- **Tidak ada auto-resume setelah restart.** Task diparkir sebagai `interrupted` dan perlu diklik **lanjut**.
- **Batas tools hanya untuk Claude.** Untuk Claude, tools di luar daftar dilepas dari toolbox (`disallowedTools`). Codex, Cursor, dan OpenCode hanya dikendalikan mode permission.
- **Skills diambil dari skill Claude** (`~/.claude/skills` dan `.claude/skills` proyek). Agent dengan provider lain hanya diberi tahu nama skill di prompt-nya.
- **Ringkasan hasil diambil dari jawaban agent.** Agent diminta menutup jawabannya dengan bagian `## Ringkasan`; kalau lupa, dipakai ekor jawabannya (maks. 4000 karakter). Tidak ada panggilan LLM terpisah untuk meringkas.
- **Orchestrator hanya bisa menambah atau mengganti subtask,** belum bisa membatalkan subtask yang sudah direncanakan.
- **Tiap subtask dan audit adalah sesi sendiri** (dinamai `<nama workspace> · tim · T1 judul`). Sesi-sesi ini ga muncul di sidebar, tapi tetap ada di database dan bisa dibuka dari canvas.
- **API eksternal `POST /api/agent` (pakai API key) belum dikunci ke canvas.** Itu jalur integrasi, jadi dibiarkan; kalau mau ditutup juga, tinggal pasang guard yang sama.
- **Kunci file cuma di app ini.** Editor lain atau shell yang ngedit file langsung ga ketahan; terminal cuma ngasih peringatan.
- **Biaya token.** Tiap subtask minimal dua giliran (kerja + audit), ditambah giliran orchestrator (rencana, check-in, ringkasan).
- **Pembacaan file yang diubah bergantung pada tool call.** File yang diubah lewat `Bash` (misalnya `sed -i` atau generator) tidak tercatat di tab file.
- **Token Cursor tidak tersedia**, dan token sesi yang transcript-nya sudah dihapus dihitung nol.
- **Analisis aplikasi hanya di memori server**; kalau server restart sebelum usulannya dipakai, analisis perlu diulang.
- **Frame `office:log` dan `office:analysis` dikirim ke semua klien yang terhubung.** Cocok untuk pemakaian self-hosted satu user; belum ada langganan per workspace.
- **Sesuai brief, belum ada:** komunikasi langsung antar tim (semua lewat orchestrator), multi-user / hak akses per tim, dan penjadwalan otomatis.

## Screenshot

| Mode canvas di HP | Task nyata yang selesai (UI versi sebelumnya) |
| --- | --- |
| ![Mobile](images/kantor-ai/workspace-mobile.png) | ![Task nyata](images/kantor-ai/kantor-ai-real-run.png) |

Task "checkout + pembayaran" di screenshot canvas memakai data sintetis untuk menunjukkan semua status sekaligus; task di screenshot kanan dijalankan sungguhan dengan Claude sebelum tampilan workspace diubah.
