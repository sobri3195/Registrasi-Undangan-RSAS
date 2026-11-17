# Mengaktifkan backend Supabase

Website tetap berupa aset Vite statis di Vercel. Supabase opsional menambahkan autentikasi petugas, distribusi paket roster berisi hash, dan sinkronisasi jejak kehadiran setiap **15 detik** saat online. IndexedDB tetap menjadi tempat simpan pertama. Sinkronisasi otomatis awalnya **nonaktif**.

## 1. Pasang database pada proyek Anda

Buka proyek di [Supabase Dashboard](https://supabase.com/dashboard), pilih **SQL Editor → New query**, lalu jalankan seluruh [SQL pemasangan](../supabase/migrations/202611170001_attendance.sql). Berkas yang sama dapat diunduh dari aplikasi pada **Pengaturan → Unduh SQL pemasangan**.

Script membuat tabel berawalan `rsas_`, RLS dan RPC dalam satu transaksi. Tidak ada data undangan/panitia yang disertakan. Menjalankan ulang script mempertahankan data. Gunakan proyek yang dikelola panitia; publishable key tidak memiliki hak untuk menjalankan migrasi ini.

Tabel yang dibuat:

| Tabel           | Isi                                                                             |
| --------------- | ------------------------------------------------------------------------------- |
| `rsas_members`  | Akun petugas, peran dan stasiun yang disahkan administrator                     |
| `rsas_devices`  | Kepemilikan ID perangkat oleh akun yang pertama menyinkronkannya                |
| `rsas_packages` | Riwayat paket hash roster yang tidak dapat ditimpa                              |
| `rsas_records`  | Jejak check-in/koreksi asli, pembuat terautentikasi dan waktu penerimaan server |

## 2. Buat akun dan penugasan

Pada **Authentication → Users**, buat akun email/password petugas. Pastikan akun dapat login (konfirmasi email sesuai kebijakan proyek). Matikan pendaftaran bebas jika tidak diperlukan. Akun yang belum terdaftar dalam `rsas_members` tidak dapat membaca paket/kehadiran atau mengirim data, walaupun berhasil login.

Lihat UUID akun melalui Dashboard atau SQL Editor:

```sql
select id, email from auth.users order by created_at desc;
```

Tetapkan koordinator T05, mengganti placeholder UUID dengan akun nyata yang baru dibuat:

```sql
insert into public.rsas_members (event_id, user_id, role, station_id)
values ('rsas-2026-11-19', '<UUID-AKUN-KOORDINATOR>', 'coordinator', 'T05')
on conflict (event_id, user_id)
do update set role = excluded.role, station_id = excluded.station_id;
```

Untuk petugas, gunakan `role = 'operator'` dan `station_id` T01, T02, T03, T04 atau T06 sesuai penugasan. Sebaiknya sediakan akun terpisah per perangkat/petugas. Hak mengubah penugasan hanya melalui administrator Dashboard/SQL Editor; aplikasi browser tidak memiliki jalur menaikkan peran sendiri.

Satu ID perangkat terikat pada akun pertama yang mengirim data. Jika akun pemegang perangkat berganti, sinkronkan/ekspor dahulu dengan akun asal. Administrator dapat mengalihkan `rsas_devices.owner_id` setelah memverifikasi ID perangkat dan akun tujuan. Jangan mengganti kepemilikan atau menghapus data untuk menyembunyikan antrean. Sumber akun catatan yang sudah tersimpan tetap dipertahankan.

## 3. Atur Vercel

Di **Vercel → Project → Settings → Environment Variables**, isi:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key-proyek>
VITE_PUBLIC_ORIGIN=https://<domain-website-resmi>
```

Variabel `VITE_*` bersifat publik dan dibundel pada build. Gunakan `sb_publishable_…` atau legacy anon key. **Jangan memasukkan secret key, service_role key atau password database.** Publishable key bukan login petugas dan tidak melewati RLS.

Redeploy setelah mengubah variabel. Preset **Vite**, build `npm run build`, output `dist`; tidak ada Vercel Functions. Di Supabase, Site URL dapat diisi domain website resmi. Alur aplikasi ini memakai login email/password, tanpa OAuth/magic link atau callback route tambahan.

URL dan key juga bisa dimasukkan langsung melalui **Pengaturan → Supabase** pada setiap tablet. Nilai build hanya menjadi isian awal bila perangkat belum menyimpan konfigurasi. Mengubah variabel Vercel tidak mengganti pengaturan lokal yang telah disimpan. Hanya origin HTTPS `*.supabase.co` yang didukung oleh validasi dan CSP saat ini. Preview wajib menggunakan proyek/data sintetis tersendiri.

## 4. Aktifkan di enam tablet

1. Pada T05, simpan identitas operator dan origin resmi. Impor CSV melalui **Daftar undangan**, sahkan slot dan penyebut, lalu buat paket melalui **Paket & penggabungan**.
2. Pada **Pengaturan → Supabase**, simpan URL/key, tekan **Uji koneksi**, lalu login sebagai koordinator. Uji koneksi hanya membuktikan endpoint Auth merespons; penugasan dan skema diperiksa setelah login.
3. Tekan **Publikasikan paket T05**. Seluruh riwayat versi master dikirim. Draf dan token penerbitan asli tidak ikut dikirim. Versi cloud yang bentrok ditolak; gunakan satu master penerbitan.
4. Di tiap tablet petugas, isi label/nama operator, simpan konfigurasi Supabase yang sama dan login dengan akun sesuai stasiun. Centang **Aktifkan sinkronisasi otomatis** lalu simpan. Paket terbaru akan diambil; impor paket JSON manual tetap tersedia.
5. Catat tamu di T02, tekan **Sinkronkan sekarang**, lalu sinkronkan T05. Pastikan satu kehadiran terlihat, waktu sinkron tampil dan antrean perangkat kosong. Pemindahan satu tamu antarjalur tetap menghasilkan satu kehadiran unik, dengan seluruh jejak tersimpan.
6. Uji mode pesawat pada setiap tablet: check-in harus tetap tersimpan lokal; antrean baru dikonfirmasi setelah server menerima pengiriman ketika kembali online. Status sukses check-in berarti tersimpan di perangkat, bukan otomatis sudah tersimpan di server.

Alternatif langsung di halaman petugas: pada `/petugas`, login di panel **Hubungkan pemindai ke Supabase**, isi nama operator, lalu tekan **Hubungkan & muat roster Supabase**. Stasiun otomatis mengikuti akun yang ditugaskan, tanpa mengubah catatan lama. Jika perangkat berisi catatan stasiun lain, persiapan ditolak sampai diekspor/ditangani. Setelah siap, QR undangan resmi maupun QR check-in dapat dipindai dari kamera atau foto. Konfirmasi hadir memicu pengiriman cloud segera; pembaruan berkala 15 detik tetap berjalan sebagai cadangan.

Token akses/refresh login disimpan SDK pada storage browser proyek tersebut. Password tidak disimpan aplikasi. Sesi, konfigurasi cloud dan progres antrean tidak dimasukkan ke backup master/ekspor stasiun. Gunakan profil kerja dan penguncian perangkat. Bila cloud gagal, jangan hapus IndexedDB; ekspor JSON dan gunakan prosedur lokal.

## Cakupan dan rekonsiliasi

Cloud menyinkronkan **paket hash roster dan seluruh catatan yang dibuat perangkat itu sendiri**. Draf, token penerbitan, RSVP terverifikasi, penyebut dan audit administrasi master tetap dikelola lokal di T05 serta masuk backup privat. Supabase ini bukan backup lengkap penerbitan undangan. Perangkat koordinator pengganti memerlukan pemulihan backup master privat untuk melanjutkan penerbitan dan pengesahan KPI.

Catatan dari JSON perangkat lain yang diimpor di T05 tetap dapat masuk rekap lokal; perangkat asal perlu menyinkronkan catatannya sendiri agar ikut tersedia di cloud. Koreksi koordinator memerlukan target check-in yang sudah diterima server. Nama operator lokal dan identitas akun pengirim disimpan terpisah; penugasan stasiun akun harus cocok dengan konfigurasi tablet.

Sinkronisasi cloud tidak membuktikan semua tablet sudah mengirim catatan terakhir. Karena itu, ambil dan impor **ekspor final JSON semua meja** saat penutupan. Status rekap tetap **Sementara** sampai penyebut cocok dan semua meja sudah direkonsiliasi atau disahkan tidak digunakan. Penanda `Tersinkron cloud` berbeda dengan `Sudah diimpor` dari berkas final.

Paket cloud tidak menimpa token/draf master yang tertinggal atau versi berbeda. Catatan asal tidak dapat di-update/delete lewat akun aplikasi; koreksi berupa aksi baru dengan alasan. Pengiriman ulang idempoten. Batch maksimal 200 catatan diterima atomik; jika respons terputus setelah commit, batch yang sama aman dikirim ulang. Batch berikutnya yang gagal tetap di IndexedDB. Cursor pengambilan maju hanya setelah transaksi lokal selesai, dan penulisan server diserialkan per acara agar urutan cursor tidak melewatkan commit yang terlambat.

Mode lokal tetap dapat dibuka tanpa login; akun Supabase membatasi akses **cloud**, bukan data yang telah tersimpan pada perangkat. Mencabut keanggotaan menghentikan akses server, tetapi tidak menghapus salinan offline. Halaman RSVP tamu tidak membaca database Supabase atau mengubah RSVP secara otomatis.

## Menangani masalah

| Pesan/kondisi                                   | Tindakan                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Skema belum siap                                | Jalankan SQL pemasangan pada proyek yang sesuai; tunggu schema cache diperbarui.                                                    |
| Akun belum ditugaskan                           | Isi `rsas_members` menggunakan UUID akun tersebut.                                                                                  |
| Stasiun tidak cocok                             | Samakan label tablet lokal dengan penugasan akun. Input kertas oleh koordinator boleh mempertahankan stasiun asal.                  |
| Versi paket belum diterbitkan                   | T05 memublikasikan seluruh riwayat paket sebelum petugas mengirim catatan.                                                          |
| Master memiliki token/draf dan cloud lebih baru | Hentikan penerbitan dari master yang berbeda; pulihkan master resmi, jangan menimpa token.                                          |
| ID/versi bentrok                                | Simpan catatan/backup asli dan telusuri sumber. Tidak ada overwrite otomatis.                                                       |
| Antrean belum kosong                            | Periksa koneksi, login, penugasan dan versi paket. Ekspor JSON sebagai cadangan.                                                    |
| Upgrade aplikasi tertahan                       | Amankan backup, tutup tab aplikasi lain pada origin yang sama, lalu muat ulang setelah sesi selesai.                                |
| `403 Forbidden` dari jaringan environment       | Izinkan hostname proyek Supabase dalam environment settings. Draf konfigurasi tidak otomatis mengubah jaringan runtime atau Vercel. |

Pengujian lokal menjalankan SQL/RLS pada PostgreSQL PGlite dan alur HTTP/browser dengan fixture sintetis. Pengujian itu belum membuktikan migrasi dipasang atau key diterima pada proyek Supabase Anda. Uji login, publikasi paket, dua tablet, offline/retry dan penutupan pada deployment HTTPS sebenarnya sebelum memakai data produksi.
