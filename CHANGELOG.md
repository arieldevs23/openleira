# Changelog

Semua perubahan penting OpenLeira dicatat di sini. Riwayat sebelum OpenLeira ada di proyek asalnya, CloudCLI UI (https://github.com/siteboon/claudecodeui).

## Reaver4 (belum dirilis)

### Ditambahkan
- **Workspace tim AI**: koordinator membagi kerjaan ke tim agent, tiap tim jalan barengan tanpa tabrakan, QA ngecek tiap hasil, lalu koordinator nulis ringkasan.
- **13 jenis workspace**: Coding, Konten & Penjualan, Laporan & Keuangan, Administrasi & Pemberkasan, Riset & Analisis, Materi & Pelatihan, Layanan Pelanggan, HR & Rekrutmen, Draf Dokumen Legal, Toko Online, Terjemahan, Proyek & Acara, dan Kustom (tim dan cara QA ngecek disusun sendiri).
- **Tampilan Simpel** (bawaan): hubungkan AI, taruh bahan, tulis kerjaan, ambil hasil. Model buat tiap anggota tim dipilih otomatis.
- **Tampilan Lengkap**: kanvas tim ala draw.io, alur kerja (panah), skill per agent, alat gambar, dan pemakaian token.
- **Upload bahan dan preview file hasil**: Excel/CSV jadi tabel, Word jadi paragraf dan tabel, PDF dan gambar tampil langsung.
- **Installer Windows** (`OpenLeira-Setup-<versi>.exe`) dengan server di dalamnya, dibangun lewat GitHub Actions.
- Tema gothic dan logo mawar hitam.

### Diubah
- Semua nama CloudCLI diganti jadi OpenLeira: aplikasi, perintah (`openleira`), paket, aplikasi desktop, dan dokumentasi.
- Folder data pindah dari `~/.cloudcli` ke `~/.openleira` (dipindah otomatis sekali).
- Fitur "cloud" bawaan aplikasi desktop disembunyikan karena OpenLeira belum punya layanan cloud.
