# Auth

OpenLeira pakai auth lokal: satu username + password, disimpan sebagai hash bcrypt di `auth.db`, session pakai JWT. Tidak ada provider eksternal.

## Akun pertama

Saat `auth.db` belum punya user, UI menampilkan layar setup. Akun yang dibuat di situ jadi admin server ini, dan setelahnya registrasi ditutup.

- username: 3-32 karakter, huruf, angka, atau underscore
- password: minimal 8 karakter

## Ganti password

Settings > Akun. Isi password sekarang, password baru, dan ulangi. Session yang sedang aktif tidak ikut logout.

API: `POST /api/auth/change-password` dengan header `Authorization: Bearer <token>` dan body `{ "currentPassword": "...", "newPassword": "..." }`.

## Reset password dari terminal (lupa password)

Butuh akses shell ke mesin yang menjalankan server, karena perintah ini menulis langsung ke `auth.db`. Jalankan dari root repo setelah `npm run build`:

```bash
# generate password acak 16 karakter, dicetak sekali di terminal
npm run reset-password -- <username>

# atau tentukan sendiri
npm run reset-password -- <username> --password 'password-baru'

# kalau database bukan di lokasi default (~/.cloudcli/auth.db)
npm run reset-password -- <username> --database-path /path/ke/auth.db
```

Kalau paket terpasang global (`npm i -g`), perintah yang sama tersedia sebagai binary:

```bash
openleira reset-password <username> [--password <baru>]
```

Server tidak perlu di-restart. Hindari `--password` di mesin bersama karena password ikut masuk shell history; lebih aman biarkan digenerate lalu ganti lewat Settings.

## Keamanan

- Rate limit: login dan change-password masing-masing maksimal 10 percobaan per 15 menit per IP (in-memory, reset saat server restart). Di balik reverse proxy di host yang sama (Caddy/nginx), IP diambil dari entri terakhir `X-Forwarded-For`; header itu diabaikan kalau request tidak datang dari loopback.
- JWT secret: pakai `JWT_SECRET` dari env kalau diset. Kalau tidak, secret acak 64 byte digenerate sekali saat pertama jalan dan disimpan di tabel `app_config` dalam `auth.db` (direktori data, bukan repo). Token berlaku 7 hari dan diperpanjang otomatis.
