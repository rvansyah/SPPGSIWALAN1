# SPPG SIWALAN 1 — Portal Manajemen MBG

Aplikasi web statis untuk stok bahan baku, transaksi, dan Penerima Manfaat.

## Fitur Import Penerima Excel

Menu **Penerima Manfaat** memiliki:

1. **Template Excel** untuk mengunduh format aplikasi.
2. **Import Excel** untuk `.xlsx`, `.xls`, dan `.csv`.
3. Pratinjau sebelum penyimpanan.
4. Deteksi duplikat berdasarkan NIK/ID atau kombinasi Nama + Sekolah.
5. Pilihan sekolah default, porsi default, tanggal penyaluran, dan filter penerima aktif.
6. Data hasil import disimpan ke state aplikasi dan disinkronkan ke Supabase setelah login.

### Format aplikasi

- Nama lengkap
- NIK / ID penerima
- Sekolah / kelompok
- Kelas / kelompok umur
- Jenis porsi
- Tanggal penyaluran
- Keterangan

### Format Excel sekolah yang juga didukung

Aplikasi juga membaca variasi kolom seperti:

- NISN/NIK
- Nama Penerima
- Tanggal Lahir
- Jenis Kelamin ID
- Nama Orang Tua
- Posisi
- Status Menerima

Jika sekolah tidak ada sebagai kolom Excel, aplikasi menggunakan **nama file** atau nilai **Sekolah / kelompok default** pada dialog import.

## Menjalankan

Aplikasi ini adalah static web app. Untuk penggunaan normal, hosting dengan HTTPS diperlukan terutama untuk PWA dan autentikasi Supabase.

1. Isi `supabase-config.js` dengan URL dan publishable/anon key proyek Supabase.
2. Jalankan `supabase/schema.sql` satu kali di Supabase SQL Editor.
3. Upload seluruh isi folder ini ke hosting static seperti GitHub Pages, Netlify, Vercel, atau server web biasa.
4. Buka aplikasi, buat admin pertama, lalu login.

> Jangan memasukkan `service_role` key ke browser. Gunakan publishable/anon key saja.

## Google Sheets
Paket ini menyertakan `GOOGLE_APPS_SCRIPT.gs` dan `PANDUAN-GOOGLE-SHEETS.txt` untuk menghubungkan aplikasi ke spreadsheet Google yang diberikan pengguna. ID spreadsheet sudah dikunci ke spreadsheet tersebut.
