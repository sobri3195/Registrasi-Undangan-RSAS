# Mengaktifkan pemindai QR dan Supabase

Jika halaman petugas menunjukkan **Paket belum dimuat** dan **Nama operator belum diisi**, pemindai belum memiliki data untuk mencocokkan QR. Membuka halaman atau memasukkan publishable key saja belum menyiapkan database dan roster. Jangan menghapus data browser untuk memperbaikinya.

## 1. Pastikan deployment memakai kode terbaru

Gabungkan PR ini ke `main`, lalu di Vercel periksa deployment Production sudah **Ready** pada commit yang sesuai. Konfigurasi proyek harus memakai preset Vite, `npm ci`, build `npm run build`, output `dist`.

Isi **Config** berikut di Environment Variables Production:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_PUBLIC_ORIGIN=https://<domain-aplikasi-resmi>
```

Redeploy setelah perubahan variabel. Jangan menggunakan secret/service_role key di browser. Jika nilai build belum terisi, URL dan publishable key masih dapat diisi melalui panel pemindai di aplikasi.

Versi ini menampilkan panel **Hubungkan pemindai ke Supabase** di halaman petugas dan label **Versi aplikasi** di bagian bawah. Jika masih tampil tulisan lama “Tanpa backend”, kemungkinan deployment lama atau shell PWA lama masih dipakai. Verifikasi deployment dahulu, lalu amankan ekspor/backup sebelum aktivasi versi baru.

Pada versi lama, buka Pengaturan dan gunakan tombol **Aktifkan setelah sesi selesai** bila tersedia. Menutup semua tab aplikasi pada origin yang sama lalu membukanya kembali juga memungkinkan worker yang sudah menunggu untuk aktif. Pada versi baru, tombol **Periksa versi terbaru** dan aktivasi manual tersedia di bagian bawah semua halaman petugas/koordinator. Proses ini tidak menghapus IndexedDB. Pembaruan tetap tidak dipaksakan saat registrasi berjalan.

## 2. Pasang backend satu kali sebagai pemilik proyek

Buka Supabase Dashboard → proyek → **SQL Editor → New query**. Jalankan seluruh [SQL pemasangan](../supabase/migrations/202611170001_attendance.sql). Panel pemindai juga menyediakan **Buka SQL Editor proyek** serta **SQL pemasangan** untuk mengunduh script yang sama.

Lalu buat akun email/password pada **Authentication → Users**. Tetapkan UUID akun koordinator ke peran `coordinator`, stasiun `T05`, serta akun penerima tamu ke peran `operator` dengan T01/T02/T03/T04/T06. Contoh perintah penugasan tersedia di [setup Supabase](SETUP_SUPABASE.md#2-buat-akun-dan-penugasan). Jangan meminta atau membagikan password petugas melalui chat/repo.

Login tanpa penugasan tidak dapat membaca roster. Jika SQL belum dipasang, aplikasi memberi pesan untuk menjalankan SQL dan tidak membuat roster/akun/kehadiran palsu. Publishable key tidak memiliki hak menjalankan migrasi atau menaikkan peran.

## 3. T05 menyiapkan roster resmi dan kartu

1. Di T05, simpan identitas koordinator dan origin HTTPS resmi.
2. Impor roster CSV pada **Koordinator → Daftar undangan → Impor CSV**. Periksa 71 entri rujukan terhadap target TOR 73; nama/kategori/slot tambahan perlu disahkan sekretariat.
3. Sahkan setiap slot yang benar. Draf tidak dapat dipakai memindai dan tidak menghasilkan token/kartu.
4. Buat paket pada **Paket & penggabungan → Buat & unduh paket baru**.
5. Login Supabase sebagai koordinator, lalu **Publikasikan paket T05**. Jika daftar/token berubah, buat versi baru dan publikasikan kembali.
6. Bagikan kartu privat per slot. Dua perwakilan perusahaan membutuhkan dua slot dan dua QR.

## 4. Petugas login dan memindai dari halaman yang sama

1. Buka `/petugas`, gunakan panel **Hubungkan pemindai ke Supabase**.
2. Simpan URL/key bila diminta, lalu **Login pemindai** dengan akun yang sudah ditugaskan.
3. Isi **Nama operator pemindai**, tekan **Hubungkan & muat roster Supabase**. Stasiun mengikuti akun. Tunggu **Pemindai siap digunakan** dan versi paket terlihat. Bila roster kosong, T05 belum memublikasikan paket aktif.
4. Tekan **Pindai QR** untuk kamera belakang, atau **Pindai foto QR** untuk gambar PNG/JPEG/WebP dari perangkat (maksimal 10 MB). Proses gambar berlangsung lokal.
5. QR check-in `RSAS-CI1:…` dan URL `/rsvp#…` dari domain resmi diterima. QR URL harus mempunyai acara/versi yang benar; hash token dan kode harus cocok dengan slot aktif. URL asing tidak dikunjungi. Sesuaikan origin resmi bila undangan diterbitkan pada domain berbeda.
6. Cocokkan orang yang datang, isi nama perwakilan bila perlu, lalu **Catat hadir**. Teks sukses baru muncul setelah transaksi lokal selesai. Pengiriman Supabase dimulai setelahnya; periksa antrean serta waktu sinkron untuk memastikan server sudah menerima.

Pemindai mengambil roster terkini saat online sebelum pencocokan. Jika cloud gagal, aplikasi memperlihatkan peringatan dan masih dapat menggunakan paket lokal yang sudah dimuat; perubahan pembatalan/token terbaru hanya berlaku setelah paket berhasil diterima. Tanpa internet, foto/kamera/pencarian tetap dapat bekerja pada paket lokal. Jangan menganggap antrean kosong sebelum server mengonfirmasinya.

## 5. Uji sebelum memakai data produksi

Gunakan data sintetis: dua slot perusahaan dengan QR berbeda, satu QR yang dipindai ulang, satu token diganti, dan satu QR domain asing. Uji kamera layar/kertas dan foto pada tablet fisik. Masuk mode pesawat, reload, simpan satu kehadiran, lalu kembali online dan pastikan catatan sampai ke T05 tanpa duplikasi. Ekspor final JSON tiap meja dan backup master tetap wajib.

Pengujian otomatis pada PR menggunakan PostgreSQL lokal dan fixture HTTP Supabase. Itu tidak membuktikan SQL/akun pada proyek asli sudah tersedia atau deployment Vercel sudah diperbarui. Akses langsung dari environment pengembangan ke domain produksi dapat dibatasi kebijakan jaringan; pengujian akhir dilakukan dari deployment HTTPS sebenarnya.
