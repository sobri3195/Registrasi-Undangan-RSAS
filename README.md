# Registrasi Undangan RSAS

Aplikasi statis Vite + React + TypeScript untuk registrasi undangan **19 November 2026**. RSVP melalui WhatsApp yang dikirim sendiri oleh tamu; kehadiran fisik tersimpan di IndexedDB setiap tablet dan digabungkan melalui JSON di T05. Tidak ada backend, API aplikasi, autentikasi terpusat, atau sinkronisasi otomatis.

## Menjalankan

Gunakan Node.js 22.12+ (diuji dengan Node 24) dan npm. Gunakan checkout yang sudah tersedia; setiap tugas cloud terisolasi, tidak perlu membuat worktree.

```sh
npm ci
npm run dev
```

Jika cache npm bawaan tidak dapat ditulis, gunakan `npm ci --cache /tmp/rsas-npm-cache`. Buka `/koordinator`, `/petugas`, atau `/pengaturan`. `/rsvp` memerlukan fragmen dari kartu undangan. Tidak ada data operasional yang dimuat otomatis. Tombol demo pada daftar undangan mempratinjau **tiga slot sintetis**, termasuk dua slot untuk perusahaan yang sama.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Build menghasilkan **hanya aset statis di `dist`**. PWA diaktifkan pada build produksi, bukan server dev. Untuk pengujian browser:

```sh
npx playwright install chromium
npm run test:e2e
# Bila Chromium sistem sudah tersedia:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

## Deploy di Vercel

Impor repositori dan pilih preset **Vite**, install `npm ci`, build `npm run build`, output `dist`. `vercel.json` memuat rewrite SPA dan header keamanan; tidak ada Functions. Halaman guest tidak melakukan permintaan data roster. Semua library, decoder, CSS, dan ikon dipaketkan lokal.

Salin `.env.example` ke `.env.local` bila perlu. Konfigurasi publik build:

| Variabel               | Kegunaan                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PUBLIC_ORIGIN`   | Origin HTTPS resmi untuk tautan RSVP, tanpa path; bisa diatur lokal di Pengaturan master.                                                                                             |
| `VITE_WHATSAPP_NUMBER` | Opsional, angka internasional 8–15 digit tanpa `+`, dimulai 1–9. Hanya tautan `https://wa.me/` yang digunakan. Bila kosong/tidak valid, tamu dapat menyalin balasan ke chat undangan. |

Variabel `VITE_*` bersifat publik. Jangan mengisinya dengan rahasia atau data roster. Preview harus menggunakan data sintetis dan origin terpisah dari produksi. Tidak ada deployment/Preview publik yang diverifikasi dalam implementasi ini; URL deployment hanya boleh dibagikan setelah diuji pada layanan sebenarnya.

## Alur utama

1. **T05 → Pengaturan**: tetapkan operator, T05, dan origin HTTPS resmi. Aktifkan jam otomatis.
2. **Daftar undangan**: impor CSV UTF-8 dengan pratinjau/nomor baris. Semua impor berstatus draf. Edit tiap slot, pilih orang bernama atau jabatan/instansi, tentukan kategori, lalu sahkan. Satu orang mengisi satu slot; perusahaan dengan dua perwakilan mendapat dua slot dan dua kartu.
3. Sahkan penyebut resmi dengan alasan di Ringkasan. Target TOR 73, rujukan 71, dan jumlah slot aktif ditampilkan terpisah. Data rujukan internal dan nama panitia dari TOR **tidak disertakan** di kode, demo, atau fixture.
4. Unduh kartu QR/tautan dari slot aktif. QR undangan menuju `/rsvp#v=1&e=…&c=…&t=…`. Token tidak berada pada query/path. Kartu dapat dicetak; jangan mencetak daftar master. Tamu memilih RSVP, mengirim sendiri, lalu menyimpan QR check-in `RSAS-CI1:<event_id>:<token>`.
5. Panitia memeriksa balasan WhatsApp dan mengisi RSVP/nama perwakilan terverifikasi pada editor slot. Halaman guest tidak bisa memperbarui data master. Jawaban RSVP tidak memengaruhi kehadiran fisik.
6. **Paket & penggabungan**: buat paket baru, transfer melalui jalur internal ke T01–T04/T06. Paket memuat hash SHA-256 token, bukan token asli. Setiap perangkat mengisi operator dan label fisiknya.
7. Petugas memindai QR, mencocokkan orang/instansi, lalu menekan **Catat hadir**. Sukses ditampilkan setelah transaksi IndexedDB selesai. Tamu tanpa QR/RSVP tetap bisa memakai pencarian manual. Input perwakilan wajib untuk undangan instansi.
8. Ekspor JSON berkala dari setiap tablet, lalu pratinjau dan gabungkan di T05. T05 yang juga check-in perlu mengekspor dan mengimpor berkasnya sendiri agar cakupan penutupan tercatat. Tamu sama di dua stasiun tetap dihitung satu kali.
9. Tinjau jam/nama berbeda atau catatan ganda. Pilih catatan efektif atau batalkan catatan dengan alasan. Semua aksi asli dipertahankan. Koreksi jam dapat dilakukan dengan membatalkan catatan salah lalu memasukkan waktu observasi dari kertas.
10. Rekonsiliasi setiap tablet yang digunakan, tandai tablet yang benar-benar tidak dipakai, lalu ekspor CSV dan backup master privat.

## Offline dan ketahanan data

IndexedDB berskema versi menyimpan keadaan lokal secara atomik. DB v2 menambahkan indeks unik gabungan acara/slot untuk kehadiran lokal aktif. ID perangkat stabil per origin/profil browser; catatan mempunyai UUID. Penghapusan data browser/instalasi atau perpindahan origin dapat menghilangkan akses ke data. Jangan menggunakan mode privat.

Service worker mencache **hanya aset publik aplikasi**, termasuk decoder dan shell SPA. Nama cache berasal dari hash konten build. Roster, token, RSVP, hasil ekspor dan transaksi tidak dicache sebagai respons HTTP. Status **Siap offline** memerlukan cache lengkap, versi paket yang dimuat, dan nama operator. Itu status kesiapan teknis, bukan bukti uji fisik.

Di Pengaturan, minta penyimpanan persisten; browser dapat menolaknya. Ekspor tetap wajib. Versi PWA baru tidak diaktifkan otomatis saat sesi berjalan. Setelah semua backup selesai, gunakan tombol aktivasi versi menunggu. Browser masih dapat menghapus storage karena kebijakan/kuota; kamera atau IndexedDB gagal berarti gunakan pencarian, tablet cadangan, atau daftar hadir kertas sesuai runbook.

Paket baru harus mempertahankan ID/kode lama; batalkan slot dengan status `cancelled`, jangan menghapusnya. Perubahan daftar/token baru berlaku di tablet setelah impor paket baru. Distribusikan versi sama sebelum membuka registrasi. Riwayat paket lama disimpan agar ekspor dari revisi yang dikenali tetap dapat digabungkan.

## Data dan keamanan operasional

- Mode lokal adalah pembagian alur, **bukan pengamanan akses**. Gunakan perangkat panitia yang dikunci, profil kerja, dan kanal transfer internal yang disetujui.
- Token acak 192-bit dibuat melalui Web Crypto. Token undangan adalah kemampuan untuk mencocokkan slot, bukan bukti identitas orang. Petugas wajib mencocokkan orang yang datang.
- Tidak ada nomor kontak panitia, nama panitia, daftar undangan TOR, atau data pasien di aplikasi. Impor data operasional hanya lokal; folder `operational-data/` diabaikan Git dan tidak berada di `public/`.
- Ekspor stasiun tidak memuat roster/token/hash. Backup master memuat token asli dan data operasional sehingga harus dibatasi. Pemulihan dilakukan pada master kosong; ID perangkat tujuan tetap dipertahankan. Jangan menimpa data perangkat yang belum diamankan.
- Berkas maksimum 5 MB; maksimum 5.000 slot dan 20.000 catatan per ekspor stasiun. Validasi event, skema, versi paket, jenis aksi, ID slot/kode, asal perangkat, target koreksi dan konflik ID berlangsung sebelum transaksi.
- Semua impor satu batch atomik. ID sama/data sama dikenali; ID sama/data berbeda membatalkan batch, mempertahankan catatan tersimpan. Berkas asli perlu diperiksa panitia, bukan diedit untuk menghilangkan konflik.
- CSV UTF-8 BOM menetralkan awalan formula spreadsheet, menyertakan waktu ekspor/cakupan tablet. Semua tampilan tanggal menggunakan Asia/Jakarta. Timestamp berkas ISO dengan zona/UTC berasal dari jam tablet.
- KPI: kehadiran resmi unik ÷ penyebut yang disahkan. Tamu tambahan dan draf tidak masuk KPI. Ambang diuji tanpa pembulatan: 62/73 = 84,93%, 63/73 = 86,30%. Label Sementara tetap ada sampai penyebut cocok dan semua meja direkonsiliasi/disahkan tidak digunakan.

Lihat [format JSON](docs/FORMAT_DATA.md), [runbook acara](RUNBOOK_ACARA.md), dan [catatan verifikasi](docs/VALIDASI.md).
