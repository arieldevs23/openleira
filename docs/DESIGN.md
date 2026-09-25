# OpenLeira Design System — Gothic Theme (Aplikasi)

Spesifikasi tema visual untuk aplikasi OpenLeira (repo ini, folder `src/`). Dokumen ini adalah sumber kebenaran untuk warna, tipografi, ornamen, dan motion.

> **Aturan paling penting: gothic ada di KULIT, bukan di STRUKTUR.**
> Landing page (`landing/`) memakai komposisi bebas dan asimetris. **Aplikasi TIDAK.**
> Di aplikasi, layout tetap konvensional, rapi, dan mudah dipindai: sidebar kiri, konten tengah, panel kanan, toolbar atas, grid dan list yang lurus dan konsisten.
> Yang berubah hanya warna, tipografi, tekstur halus, dan gerak. Jangan pernah memindahkan, memiringkan, menumpuk, atau membuat asimetris elemen fungsional demi estetika.

---

## 1. Prinsip

1. **Terbaca dulu, suasana kemudian.** Aplikasi ini dipakai berjam-jam. Kontras teks, target klik, dan keterbacaan tidak boleh dikorbankan demi nuansa gothic.
2. **Satu tema, dua mode.** Gelap sebagai default, terang sebagai alternatif. Bukan dua bahasa desain yang berbeda.
3. **Ornamen hanya di ruang kosong.** Latar halaman kosong, panel kosong, layar login, empty state, splash. Tidak pernah di belakang teks padat, tabel, transkrip, atau kode.
4. **Monokrom plus satu aksen.** Warna dipakai untuk status, bukan untuk dekorasi.
5. **Gerak menjelaskan perubahan.** Durasi pendek, satu easing, tidak pernah menunda interaksi.
6. **Struktur tidak berubah.** Semua perubahan tema harus bisa diterapkan lewat token CSS dan kelas utilitas, tanpa menyusun ulang tata letak komponen.

---

## 2. Token warna

Gunakan CSS custom properties. Mode gelap di `:root`, mode terang di `:root[data-theme="light"]`. Jangan menulis nilai hex langsung di komponen.

### Mode gelap (default)

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--bg` | `#0A0A0B` | latar aplikasi paling bawah |
| `--surface` | `#141416` | sidebar, panel, kartu, modal |
| `--surface-2` | `#1C1C1F` | elemen bertumpuk di atas surface: input, baris hover, blok kode |
| `--surface-3` | `#232327` | baris terpilih, dropdown di atas modal |
| `--text` | `#F2F2F0` | teks utama |
| `--text-dim` | `#C4C4C8` | teks sekunder yang masih penting |
| `--muted` | `#8A8A90` | metadata, timestamp, placeholder, label |
| `--border` | `#2A2A2E` | garis pemisah, border kartu dan input |
| `--border-strong` | `#3A3A40` | border elemen fokus atau aktif |
| `--accent` | `#C9CCD4` | aksen perak: status aktif, ikon aktif, garis terpilih |
| `--accent-strong` | `#FFFFFF` | teks di atas tombol primer, highlight tertinggi |
| `--accent-dim` | `rgba(201,204,212,0.12)` | latar tombol ghost saat hover, latar chip aktif |
| `--glow` | `rgba(201,204,212,0.16)` | halo lembut di belakang mawar dan elemen fokus besar |

### Mode terang

| Token | Nilai |
|---|---|
| `--bg` | `#F2F2F0` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#E9E9E6` |
| `--surface-3` | `#DEDEDA` |
| `--text` | `#0A0A0B` |
| `--text-dim` | `#3A3A40` |
| `--muted` | `#6B6B72` |
| `--border` | `#D8D8D4` |
| `--border-strong` | `#BDBDB8` |
| `--accent` | `#2A2A2E` |
| `--accent-strong` | `#0A0A0B` |
| `--accent-dim` | `rgba(42,42,46,0.08)` |
| `--glow` | `rgba(255,255,255,0.9)` |

### Warna status (sama di kedua mode, disesuaikan opasitasnya)

| Token | Gelap | Terang | Arti |
|---|---|---|---|
| `--ok` | `#7FB08A` | `#3E7A50` | selesai, lolos audit, tersimpan |
| `--run` | `#C9CCD4` | `#2A2A2E` | sedang berjalan (pakai aksen, bukan warna baru) |
| `--warn` | `#C9A96A` | `#8A6A20` | menunggu, perlu perhatian, mendekati limit |
| `--err` | `#C07C7C` | `#8E3B3B` | gagal, error, ditolak |
| `--info` | `#8FA3C4` | `#3F5A85` | catatan netral, tooltip informasi |

Aturan: status **tidak boleh** dibedakan hanya oleh warna. Selalu sertakan bentuk atau teks: titik penuh untuk selesai, cincin berdenyut untuk berjalan, titik kosong untuk idle, segitiga kecil untuk peringatan.

---

## 3. Tipografi

Font self-host, file `.woff2` sudah tersedia di `landing/fonts/`. Salin ke aset aplikasi, jangan memuat dari CDN mana pun.

| Token | Stack | Peran |
|---|---|---|
| `--font-display` | `"Cinzel", Georgia, serif` | **hanya**: layar login/setup, judul splash, judul empty state besar, nomor bab dekoratif |
| `--font-serif` | `"Playfair Display", Georgia, serif` | wordmark OpenLeira, judul modal besar, judul halaman utama (Workspace, Pengaturan) |
| `--font-sans` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | **semua UI**: nav, sidebar, tombol, label, body, chat, form, tabel |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | kode, terminal, path file, perintah, token |

**Batas tegas:** Cinzel dan Playfair tidak pernah dipakai untuk teks yang dibaca dalam jumlah banyak, label tombol, item daftar, atau isi chat. Salah satu cara paling cepat merusak aplikasi ini adalah memakai serif untuk teks fungsional.

### Skala

| Peran | Ukuran / line-height | Weight | Font |
|---|---|---|---|
| Judul halaman | 22px / 1.25 | 600 | serif |
| Judul section, modal | 17px / 1.3 | 600 | sans |
| Judul kartu | 15px / 1.35 | 600 | sans |
| Body, chat | 14px / 1.55 | 400 | sans |
| UI kecil, label, nav | 13px / 1.4 | 500 | sans |
| Meta, timestamp, badge | 11.5px / 1.35 | 500 | sans |
| Label bab dekoratif | 11px, tracking 0.14em, uppercase | 600 | display |
| Kode, terminal | 12.5px / 1.5 | 400 | mono |

Tracking: judul serif `-0.01em`, body `0`, label uppercase `0.08em` sampai `0.14em`.

---

## 4. Bentuk, jarak, elevasi

- **Radius:** `--radius-s: 4px` (badge, chip, input kecil), `--radius: 6px` (tombol, input, kartu), `--radius-l: 10px` (modal, panel mengambang, node canvas). Tidak ada pill penuh kecuali indikator status bulat.
- **Border:** 1px `--border`. Gothic di sini berarti **garis tipis dan tegas**, bukan bayangan tebal.
- **Spasi:** kelipatan 4px. Padding kartu 12px sampai 16px, padding panel 16px, jarak antar grup 20px sampai 24px. Aplikasi ini padat secara informasi, jangan lapang seperti landing.
- **Elevasi:** hindari bayangan besar. Modal dan dropdown boleh `0 8px 24px rgba(0,0,0,0.45)` di mode gelap dan `0 8px 24px rgba(10,10,11,0.12)` di mode terang. Kartu biasa cukup border, tanpa bayangan.
- **Tinggi baris interaktif:** minimum 32px di desktop, 44px di sentuh.

---

## 5. Ornamen gothic (dibatasi ketat)

Semua ornamen adalah **SVG inline**, `aria-hidden="true"`, `pointer-events: none`, opasitas dikendalikan oleh `--orn` (0.05 di gelap, 0.06 di terang).

**Boleh dipakai di:**
- Latar layar login dan setup: jendela mawar katedral besar, berputar 120 detik per putaran.
- Empty state (belum ada proyek, belum ada workspace, belum ada sesi): satu lengkung ogival tipis atau siluet mawar kecil di belakang teks.
- Splash dan layar loading awal.
- Latar paling bawah aplikasi (`--bg`): tekstur titik SVG yang sangat samar, statis.
- Header panel besar: satu garis ogival tipis sebagai pemisah, bukan garis lurus biasa.

**Dilarang di:**
- Belakang transkrip chat, daftar file, tabel, editor kode, log, atau teks padat mana pun.
- Di dalam kartu kecil, baris daftar, toolbar, dropdown, tooltip.
- Di belakang elemen yang bisa di-scroll secara mandiri.

**Mawar sebagai mark:** dipakai di layar login, favicon, splash, ikon PWA, dan sudut sidebar dalam ukuran kecil (maksimal 20px). Tidak dipakai sebagai latar besar di area kerja. File tersedia sebagai `rose.webp` dan set PNG 32 sampai 512.

---

## 6. Motion

Satu easing untuk semua: `--ease: cubic-bezier(0.22, 1, 0.36, 1)`.

| Interaksi | Durasi | Properti |
|---|---|---|
| Hover, fokus, perubahan warna | 150ms | `background-color`, `border-color`, `color` |
| Tombol ditekan | 90ms | `transform: scale(0.98)` |
| Dropdown, tooltip, popover | 140ms | opacity + `translateY(-4px)` |
| Modal, drawer | 200ms | opacity + `scale(0.98 → 1)` |
| Panel dilipat atau dibuka | 220ms | `width` atau `transform` |
| Bubble chat baru | 200ms | opacity + `translateY(8px)` |
| Node canvas muncul | 180ms | opacity + `scale(0.96 → 1)` |
| Status berjalan | 2.5s loop | cincin berdenyut, `opacity` saja |
| Garis alur aktif di canvas | 1.2s loop | `stroke-dashoffset` |

**Yang tidak dibawa dari landing ke aplikasi:**
- Reveal saat scroll per elemen. Konten aplikasi harus langsung tampil penuh.
- Motion blur saat menggulir.
- Parallax.
- Ornamen yang bergerak di area kerja.

`prefers-reduced-motion: reduce` mematikan semua loop, denyut, dan transisi transform; sisakan perubahan opacity instan.

---

## 7. Aturan per area aplikasi

### Sidebar
Latar `--surface`, border kanan 1px `--border`. Wordmark kecil di atas: "Open" `--text` + "Leira" `--accent`, font serif, 15px. Item: tinggi 32px, radius 6px, teks 13px sans 500. Aktif: latar `--surface-2`, teks `--text`, **tanpa bar aksen di sisi kiri**, tanpa teks berwarna. Hover: latar `--accent-dim`. Aksi item (rename, hapus) hanya lewat klik kanan atau tekan lama, tidak ada tombol yang muncul saat hover.

### Chat
Bubble pengguna: latar `--accent` di mode gelap dengan teks `--bg`, atau latar `--accent` di mode terang dengan teks `--accent-strong` yang kontras; rata kanan; radius 10px dengan sudut kanan bawah 4px. Bubble agent: latar `--surface-2`, border 1px `--border`, teks `--text`, rata kiri, radius 10px dengan sudut kiri bawah 4px. Jarak antar bubble: 4px jika pengirim sama, 12px jika berganti. Blok kode di dalam bubble memakai `--surface` di mode gelap agar tetap terbaca, jangan mewarisi latar bubble.

### Baris tool call
Satu baris, tinggi sekitar 28px, mono 11px, warna `--muted`, tanpa border tebal dan tanpa blok gelap besar. Klik untuk membuka detail.

### Canvas Workspace
Latar `--surface` dengan pola titik SVG `--border` pada opasitas rendah. Node agent: latar `--surface-2`, border 1px `--border`, radius 10px. Node terpilih: border `--accent`. Node berjalan: cincin `--accent` berdenyut. Penghubung: kurva bezier `--border`, jalur aktif `--accent` dengan aliran `stroke-dashoffset`. Node skill lebih kecil, dihubungkan dengan garis putus-putus. Posisi node ditentukan oleh tata letak otomatis dan posisi simpanan pengguna, bukan oleh estetika.

### Form dan input
Latar `--surface-2`, border 1px `--border`, radius 6px, tinggi 32px, teks 13px. Fokus: border `--border-strong` plus ring `0 0 0 2px var(--accent-dim)`. Pesan error memakai `--err` dan teks penjelas, tidak hanya warna border.

### Tombol
- Primer: latar `--accent`, teks `--bg` di mode gelap dan `#FFFFFF` di mode terang, weight 600.
- Sekunder: transparan, border 1px `--border`, teks `--text`.
- Ghost: transparan tanpa border, teks `--muted`, hover latar `--accent-dim`.
- Destruktif: teks `--err`, border `--err` pada varian sekunder. Tidak ada tombol merah penuh kecuali konfirmasi hapus di dalam modal.

### Empty state
Di sinilah gothic paling boleh terasa: ornamen samar di belakang, judul boleh memakai font display, satu kalimat penjelas `--muted`, satu aksi utama.

---

## 8. Aksesibilitas

- Kontras teks utama terhadap latarnya minimal 4.5:1; teks besar dan elemen grafis minimal 3:1. Verifikasi setiap pasangan token sebelum dipakai.
- Fokus terlihat di semua elemen interaktif: ring 2px `--accent` dengan offset 2px. Jangan pernah `outline: none` tanpa pengganti.
- Target sentuh minimal 44px di layar sentuh.
- Status tidak pernah hanya dibedakan oleh warna.
- Semua ornamen `aria-hidden`, semua ikon fungsional punya label.

---

## 9. Penerapan

1. Definisikan semua token di satu tempat (`src/index.css`), mode terang sebagai override `:root[data-theme="light"]`.
2. Hubungkan token ke konfigurasi Tailwind yang sudah ada supaya kelas `bg-surface`, `text-muted`, `border-border` memakai nilai ini. Jangan menambah palet baru di config.
3. Salin font `.woff2` ke aset aplikasi dan deklarasikan `@font-face` lokal dengan `font-display: swap`.
4. Ganti komponen dari nilai warna langsung ke token. Cari hex yang tertinggal dan ganti.
5. Simpan pilihan mode di preferensi pengguna yang sudah ada, dengan skrip anti-kedip yang membaca preferensi sebelum render pertama.
6. Setelah selesai: periksa kontras di kedua mode, jalankan dengan `prefers-reduced-motion`, dan pastikan tidak ada ornamen yang muncul di area kerja padat.

---

## 10. Daftar periksa sebelum menganggap selesai

- [ ] Tidak ada hex warna yang ditulis langsung di komponen.
- [ ] Cinzel dan Playfair tidak dipakai di teks fungsional mana pun.
- [ ] Sidebar, toolbar, daftar, dan tabel tetap lurus dan konsisten. Tidak ada elemen fungsional yang dibuat asimetris.
- [ ] Ornamen hanya muncul di login, setup, empty state, splash, dan latar paling bawah.
- [ ] Tidak ada reveal saat scroll, motion blur, atau parallax di dalam aplikasi.
- [ ] Kedua mode lolos kontras AA.
- [ ] `prefers-reduced-motion` mematikan seluruh loop dan transform.
- [ ] Status selalu punya penanda bentuk atau teks, bukan warna saja.
- [ ] `npm run build` dan `npm test` lolos.
