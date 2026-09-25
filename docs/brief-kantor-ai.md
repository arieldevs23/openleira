# OpenLeira: fitur "Kantor AI" (AI Office)

Repo ini adalah OpenLeira, fork dari claudecodeui yang sudah di-rebrand: web UI self-hosted yang menjalankan Claude Code (dan provider lain) di server user. Stack: React + Vite + Tailwind (src/), Express + WebSocket + SQLite (server/), i18n di src/modules/i18n/locales (en + id). Theme: light, palette primary #2551BD, navy #182A58, teks #0B132B, canvas #F8F8F6, surface #FFFFFF, border #E5E6E3, muted #717784; ada mode "liquid glass" (backdrop blur) dan animasi halus via CSS. Font system stack. Bahasa UI default Indonesia (locale id: huruf kecil, casual, tanpa "silakan/anda/mohon"), en juga wajib.

Bangun fitur baru bernama **Kantor AI**: satu proyek diperlakukan seperti kantor. Di dalamnya ada divisi (ruangan). Tiap divisi punya satu agent AI yang fokus ke bidangnya. Satu agent **Koordinator** jadi jembatan komunikasi: menerima kasus utama dari user, memecah jadi sub-tugas, membagikan ke divisi, meneruskan hasil antar divisi, dan merangkum ke user. Di atas semua divisi ada dua lapisan lintas-divisi: **Skills** (skill yang dipasang dan dipakai agent) dan **Audit** (agent yang memeriksa hasil divisi sebelum dianggap selesai).

Kerjakan sampai selesai, termasuk backend, frontend, migrasi DB, i18n, dan test dasar. Buat di branch baru `feat/kantor-ai`, commit bertahap dengan pesan jelas, dan buka PR ke `main` dengan deskripsi yang menjelaskan arsitektur, cara mencoba, dan keterbatasan yang jujur. `npm run build` dan `npm test` harus lolos (2 test `activityIndicatorBackground` sudah gagal dari sebelumnya, abaikan). Jangan menyentuh folder `landing/`.

## 1. Model data (SQLite, tambahkan migrasi di server/modules/database)

- `office` : id, project_path (satu kantor per proyek), name, created_at
- `division` : id, office_id, name, slug, description, color (hex, default dari palette), sort_order, is_coordinator (bool), is_audit (bool)
- `agent` : id, division_id, name, role_prompt (system prompt / instruksi peran), model (string, misal `claude-opus-4-1`, `claude-sonnet-4-5`; pilihan diambil dari daftar model provider yang sudah ada di app), allowed_tools (json array), skills (json array of skill slug), enabled (bool)
- `case` (kasus utama) : id, office_id, title, description, status (draft | running | waiting_user | done | failed), created_by, created_at, finished_at
- `task` : id, case_id, division_id, parent_task_id (nullable), title, instruction, status (queued | running | review | done | failed | blocked), result_summary, session_id (id sesi provider yang menjalankan), created_at, updated_at
- `message_bus` : id, case_id, from_division_id, to_division_id (nullable = broadcast/user), kind (assign | result | question | audit_pass | audit_fail | note), payload (json), created_at

Sediakan repository + service layer dengan gaya yang sama seperti modul lain di server/modules.

## 2. Orchestration (server/modules/office)

- Saat kantor dibuat untuk sebuah proyek, seed 7 divisi default + koordinator + audit:
  - koordinator (is_coordinator)  
  - planner, designer ui/ux, backend, frontend, security, docs  
  - qa/audit (is_audit)  
  Nama, deskripsi, warna, role_prompt default yang bagus untuk masing-masing. Model default tiap agent: **kosong / belum dipilih**. UI harus memaksa user memilih model untuk setiap agent sebelum kasus pertama bisa dijalankan (tampilkan wizard pemilihan model sekali di awal, bisa diubah kapan saja).
- Menjalankan kasus: koordinator dijalankan lebih dulu sebagai sesi provider (pakai runner provider yang sudah ada di server/modules/providers, cwd = project_path, model = model agent koordinator). Koordinator diberi role_prompt + deskripsi kasus + daftar divisi yang tersedia, dan diminta mengeluarkan rencana dalam format terstruktur (JSON) berisi daftar sub-tugas: {division_slug, title, instruction, depends_on[]}. Parse JSON itu menjadi baris `task`.
- Eksekusi task: jalankan task yang dependensinya sudah done, maksimal N paralel (default 2, bisa diatur di settings kantor). Tiap task = satu sesi provider dengan role_prompt agent divisi + instruction + ringkasan hasil task yang menjadi dependensinya (diteruskan lewat message_bus, ini yang disebut "komunikasi antar agent"). Setelah selesai, hasil diringkas dan ditulis ke task.result_summary + message_bus (kind=result).
- Audit: setiap task yang selesai masuk status `review`, lalu agent audit dijalankan dengan hasil task itu. Keluaran audit terstruktur: {pass: bool, notes: string, fixes: [..]}. pass → done; gagal → task kembali ke queued dengan instruction ditambah catatan audit (maks 2 kali ulang, lalu status failed dan koordinator diberi tahu).
- Setelah semua task done: koordinator dijalankan sekali lagi untuk menulis ringkasan akhir ke user; case → done.
- Semua eksekusi memakai mekanisme sesi/permission yang sudah ada di app (hormati permission mode; default kantor AI = bypass permissions, tampilkan peringatan sekali).
- Setiap perubahan status task/case/message_bus di-broadcast lewat WebSocket yang sudah ada (event `office:update` dengan payload minimal). Frontend tidak boleh polling.
- User bisa: pause/resume kasus, batalkan kasus (abort sesi yang berjalan), dan kirim pesan ke koordinator di tengah jalan (masuk sebagai message_bus kind=note; koordinator menerimanya pada giliran berikutnya).

Gunakan kembali runner, session synchronizer, dan WebSocket yang sudah ada. Jangan bikin sistem sesi paralel yang baru.

## 3. Frontend (src/modules/office)

- Entry di sidebar: item "kantor" (ikon sederhana). Membuka halaman Kantor AI untuk proyek yang sedang aktif. Kalau belum ada kantor untuk proyek itu, tampilkan tombol "bikin kantor" yang menjalankan seed default.
- Tata letak: kiri = daftar kasus (buat kasus baru: judul + deskripsi; status badge kecil); tengah = **bagan tree** kantor; kanan = panel detail (kasus/task/agent yang dipilih).
- Bagan tree (inti visual). Susunan:
  ```
  [ Kasus / Proyek ]
          |
      [ Koordinator ]
     /   |   |   |   \
  [Planner][Designer][Backend][Frontend][Security][Docs]
          -------------------------------------------
                 lapisan: [ Skills ]   [ Audit ]
  ```
  - Gambar dengan SVG (garis) + node HTML biasa (div) supaya bisa pakai komponen dan CSS theme yang ada. Jangan tambah library graph berat (no cytoscape/reactflow). Layout bisa dihitung sederhana (koordinator di tengah, divisi berjajar di bawah, lapisan skills/audit sebagai baris di bawahnya).
  - Node menampilkan: nama divisi, nama agent, model (badge kecil), status live: idle / running / review / done / failed / blocked, dengan warna dari palette (running = primary biru, review = navy, done = hijau lembut, failed = merah lembut, idle = muted).
  - Animasi: node yang running punya denyut halus (opacity/ring), garis dari koordinator ke divisi yang sedang diberi tugas "mengalir" (stroke-dashoffset animasi) selama ada pesan bergerak di message_bus antara keduanya, node baru muncul dengan fade+scale 180ms. Semua hormati prefers-reduced-motion. Warna dan style ikut theme (glass surface untuk node, border #E5E6E3, radius 12px).
  - Klik node → panel kanan menampilkan agent (nama, peran, model dropdown, tools, skills) dan log/transcript task yang sedang/terakhir dijalankan di divisi itu (stream real-time dari WebSocket).
  - Klik garis atau ikon pesan → daftar message_bus antara dua divisi.
- Manajemen divisi & agent dari UI: tambah divisi, ubah nama/warna/deskripsi, hapus (kecuali koordinator dan audit tidak bisa dihapus, hanya diedit), atur agent: nama, role_prompt (textarea markdown), model (dropdown dari model yang tersedia di provider), allowed tools (multi-select), skills (multi-select dari skill yang terpasang di ~/.claude/skills dan .claude/skills proyek; reuse modul skills yang sudah ada). Perubahan tersimpan ke DB dan langsung tercermin di bagan.
- Wizard "pilih model" saat pertama kali: daftar semua agent, tiap baris dropdown model, tombol "terapkan ke semua" untuk cepat, tombol simpan. Tidak bisa menjalankan kasus jika ada agent yang modelnya kosong (tampilkan alasan).
- Panel kasus: timeline task (status, divisi, waktu), tombol pause/resume/batal, kotak "pesan ke koordinator", ringkasan akhir saat done.
- Responsif: di layar < 900px bagan bisa di-scroll horizontal, panel kanan jadi drawer.
- Semua string lewat i18n (en + id). Gaya id: huruf kecil, santai, tanpa "silakan/anda/mohon", tanpa emoji.

## 4. Kualitas

- Test: unit test untuk parser rencana koordinator (JSON valid/invalid), scheduler dependensi (task jalan hanya jika dependensi done, batas paralel), transisi status audit (pass/fail/ulang maks 2). Test frontend minimal untuk komponen bagan (render node sesuai divisi, status class).
- Tangani error: JSON dari koordinator tidak valid → coba minta ulang sekali dengan instruksi lebih ketat, lalu tandai case failed dengan pesan jelas. Sesi provider crash → task failed, koordinator diberi tahu.
- Jangan menyimpan API key baru; pakai autentikasi provider yang sudah ada.
- Dokumentasi singkat di `docs/workspace-ai.md`: konsep, alur data, cara menambah divisi, keterbatasan.

## 5. Yang tidak perlu di versi ini

- Komunikasi bebas antar divisi tanpa lewat koordinator (semua lewat koordinator/message_bus dulu).
- Multi-user / hak akses per divisi.
- Penjadwalan otomatis.

Selesaikan, pastikan build + test lolos, lalu buka PR `feat/kantor-ai` → `main` dengan ringkasan arsitektur dan screenshot/GIF kalau memungkinkan.
