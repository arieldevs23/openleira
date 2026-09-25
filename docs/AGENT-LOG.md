# AGENT-LOG

Catatan koordinasi antar agent yang mengerjakan OpenLeira. Siapa pun (cloud session, CLI di VPS, manusia) yang mulai bekerja: **baca file ini dulu**, lalu tambahkan entri di bagian Log saat selesai.

## Aturan kerja

- Satu branch = satu kerjaan. Sebelum mulai, `git pull` branch yang dituju. Jangan force-push.
- Jangan sentuh folder `landing/` kecuali diminta (di-deploy sebagai file statis terpisah).
- Istilah UI (id | en): workspace | workspace, tim | team, orchestrator | orchestrator, task | task, subtask | subtask, chat | chat, sesi | sessions, file | files, canvas | canvas. Identifier kode boleh tetap lama (case, division, office).
- Locale id: huruf kecil, santai, tanpa "silakan/anda/mohon", tanpa emoji. Locale en wajib ikut.
- Theme: primary #2551BD, navy #182A58, teks #0B132B, canvas #F8F8F6, surface #FFFFFF, border #E5E6E3, muted #717784. Font system stack. Ada mode glass + animasi halus; hormati prefers-reduced-motion.
- Auth tetap lokal (username + password). Tidak ada firebase/oauth.
- `npm run build` dan `npm test` harus lolos (2 test `activityIndicatorBackground` sudah gagal dari upstream, abaikan).
- Deploy: push ke branch yang sedang ada di staging → auto-deploy ke https://staging.openleira.online dalam 1-2 menit. `main` di-deploy manual ke https://app.openleira.online.

## Status branch

| branch | isi | status |
|---|---|---|
| `main` | app + landing | produksi (app.openleira.online) |
| `feat/kantor-ai` (PR #1) | Workspace AI: orchestrator, tim, audit, bagan pipeline | di staging, review |
| `feat/auth-polish` (PR #3) | ganti password, reset via CLI, rate limit, rebrand login | siap merge |

## Berikutnya (urutan prioritas)

1. Review PR #1 di staging, terutama alur berfase: Planner fase 1 → eksekusi sesuai rencana → audit sekali di akhir → ringkasan.
2. Merge PR #3, deploy ke app.
3. Merge PR #1 setelah oke, deploy ke app.
4. Installer satu baris (`install.sh`): install node 20, clone, build, systemd service, opsional domain + caddy https. Harus jalan di Ubuntu 22.04+/Debian 12, dan mode lokal (localhost tanpa domain).
5. Onboarding pertama kali: rebrand + bahasa id (layar selamat datang, hubungkan provider, pilih proyek).
6. OpenRouter sebagai pilihan provider langsung (sekarang lewat OpenCode).
7. Multi-provider per tim di Workspace AI (misal orchestrator Claude, backend Codex).

## Log

- 2026-09-25 · CLI VPS · `main` · rebrand CloudCLI → OpenLeira, theme minimal + glass, locale id gen-z, hapus jejak upstream (github/discord/sponsor), tab chat terpisah (default sonnet), file browser, tool row compact, context-menu copy, iMessage bubble + sound, antrian pesan dengan interupsi, gzip.
- 2026-09-25 · cloud session · `feat/kantor-ai` · Workspace AI awal: DB, orkestrasi, websocket observer, halaman + bagan, canvas mode, provider connect sebelum pilih model.
- 2026-09-25 · CLI VPS · `feat/kantor-ai` · rename istilah UI ke workspace/tim/orchestrator/task; alur berfase opsi B (planner fase 1 menentukan dependensi, audit sekali di akhir, maks 2 putaran fix, bagan pipeline 4 kolom).
- 2026-09-25 · CLI VPS · `feat/auth-polish` · PR #3.
- 2026-09-25 · CLI VPS · `main` · landing: redesign showcase (mock UI, fitur zigzag, pipeline animasi), istilah workspace, section Dukung (saweria.co/leira).
