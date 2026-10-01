#!/usr/bin/env bash
# OpenLeira installer for Linux, macOS and WSL2.
#   curl -fsSL https://openleira.online/install.sh | bash
# Clones (or updates) OpenLeira into ~/openleira, installs dependencies,
# builds it and starts the server on port 3001.
# Settings: OPENLEIRA_DIR (install folder), OPENLEIRA_NO_START=1 (build only).
set -euo pipefail

REPO_URL="https://github.com/arieldevs23/openleira.git"
INSTALL_DIR="${OPENLEIRA_DIR:-$HOME/openleira}"

say() { printf '\033[1m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[31mGagal:\033[0m %s\n' "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git belum terpasang. Pasang dulu (contoh: sudo apt install git)."
command -v node >/dev/null 2>&1 || fail "Node.js belum terpasang. Butuh Node 22 atau lebih baru: https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "npm belum terpasang. Biasanya ikut Node.js: https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $(node -v) terlalu lama. Butuh Node 22 atau lebih baru."

if [ -d "$INSTALL_DIR/.git" ]; then
  say "Memperbarui OpenLeira di $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  [ -e "$INSTALL_DIR" ] && fail "$INSTALL_DIR sudah ada dan bukan folder OpenLeira. Atur OPENLEIRA_DIR ke folder lain."
  say "Mengunduh OpenLeira ke $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
say "Memasang dependensi (beberapa menit)"
HUSKY=0 npm ci
say "Membangun aplikasi"
npm run build

if [ "${OPENLEIRA_NO_START:-}" = "1" ]; then
  say "Selesai. Jalankan dengan: cd $INSTALL_DIR && npm run server"
  exit 0
fi

say "OpenLeira jalan di http://localhost:3001 (Ctrl+C untuk berhenti)"
say "Lain kali jalankan lagi dengan: cd $INSTALL_DIR && npm run server"
exec npm run server
