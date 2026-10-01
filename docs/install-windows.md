# Pasang OpenLeira di Windows

Panduan ini buat Windows 10 atau 11 (64-bit). Nggak perlu ngerti coding.

## 1. Download

Ambil file **`OpenLeira-Setup-<versi>.exe`**:

- dari tombol **Download untuk Windows** di https://openleira.online, atau langsung https://github.com/arieldevs23/openleira/releases/latest/download/OpenLeira-Setup.exe (selalu versi terbaru), atau
- dari halaman **Releases** repo ini (semua versi), atau
- dari tab **Actions** → *Windows installer* → run terakhir yang hijau → bagian **Artifacts** → `OpenLeira-Windows-Setup` (file zip, isinya `.exe`).

## 2. Pasang

1. Klik dua kali `OpenLeira-Setup-<versi>.exe`.
2. Kalau muncul layar biru **"Windows protected your PC"**: klik **More info** → **Run anyway**. Ini muncul karena installer-nya belum ditandatangani sertifikat berbayar, bukan karena ada virus.
3. Ikuti wizard: pilih folder instal (boleh dibiarkan bawaan) → **Install**.
4. Selesai. Ada ikon **OpenLeira** di desktop dan Start Menu.

## 3. Pertama kali buka

1. Buka **OpenLeira**. Server-nya jalan otomatis di komputer lo sendiri (nggak perlu download apa-apa lagi).
2. Bikin akun login lokal (username + password). Akun ini cuma ada di komputer lo.
3. Pilih **Tim AI** di kanan atas, lalu **tambah workspace** → pilih jenis kerjaan → pilih folder.
4. Di tampilan **Simpel**, ikuti langkah 1: **hubungkan AI**. Pilih akun AI yang lo punya (Claude, Codex, Cursor, atau OpenCode), jendela login kebuka, ikuti tulisan di layar.
5. Tulis kerjaan, klik **kerjain**, ambil hasilnya.

## Kebutuhan

- Windows 10/11 64-bit, RAM 8 GB atau lebih.
- Akun salah satu AI: Claude (Anthropic), ChatGPT/Codex (OpenAI), Cursor, atau OpenCode.
- Internet, karena AI-nya jalan di server penyedia AI.
- Disarankan pasang **Git for Windows** (https://git-scm.com/download/win) kalau mau pakai workspace Coding atau fitur GitHub.

## Kalau ada masalah

- **Aplikasi nggak kebuka / layar loading terus**: tutup OpenLeira dari tray, buka lagi. Kalau masih, buka menu bantuan di aplikasi dan lihat log server-nya.
- **Antivirus memblokir**: tambahkan folder instal OpenLeira ke pengecualian. Installer belum ditandatangani, jadi beberapa antivirus curiga.
- **Copot pemasangan**: *Settings → Apps → OpenLeira → Uninstall*. Data lo (database dan pengaturan) ada di `%APPDATA%\OpenLeira` dan `%USERPROFILE%\.openleira`; hapus manual kalau mau bersih total.

## Buat developer: bikin installer sendiri

Installer harus dibangun di Windows, karena server dan modul native-nya (database, terminal) dikompilasi buat Windows:

```powershell
npm ci
npm run build
node scripts/release/build-server-bundle.js
$env:OPENLEIRA_EMBED_SERVER_BUNDLE = (Get-ChildItem release/local-server/*.tar.gz)[0].FullName
node scripts/release/prepare-desktop-app.js
npx electron-builder --projectDir .desktop-build/desktop-app --win nsis --x64 --publish never
```

Hasilnya di `release/desktop/OpenLeira-Setup-<versi>.exe`. GitHub Actions (`.github/workflows/desktop-windows.yml`) ngelakuin hal yang sama otomatis: jalan manual dari tab Actions, tiap push tag `v*` (installer-nya ditempel ke Release), dan tiap ada perubahan di `electron/` atau `scripts/release/`.
