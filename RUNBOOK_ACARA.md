# Runbook registrasi RSAS · 19 November 2026

Semua waktu di bawah **WIB (Asia/Jakarta)**. Cakupan hanya undangan acara; data pasien, pemeriksaan bakti sosial, dan rekam medis di luar aplikasi.

## H-1 · 18 November

- Sekretariat mengesahkan orang/label undangan, perwakilan, kategori VIP/VVIP, slot tiap perusahaan, jumlah resmi dan penyebut. TOR: 73 undangan, 71 entri rujukan, target ≥85% (minimal 63 dari 73). Jangan menutupi selisih dengan draf/tambahan. Impor daftar resmi secara lokal di T05; periksa pratinjau lalu sahkan tiap slot. Perubahan penyebut wajib beralasan dan tercatat audit.
- Tetapkan panitia penerima tamu, operator dan pengganti koordinator saat MC bertugas. Masukkan nama secara lokal; daftar nama TOR tidak didistribusikan lewat kode publik.
- Tetapkan domain HTTPS produksi dan nomor WA yang disetujui untuk publikasi (opsional). Verifikasi rute `/rsvp`, `/petugas`, `/koordinator` langsung pada deployment. Gunakan satu origin/profil browser/mode instalasi yang sama sepanjang persiapan dan acara.
- Buat satu kartu/tautan per slot. Dua perwakilan PT = dua slot dan dua QR. Minta tamu menyimpan QR check-in PNG sebelum berangkat. Pengganti satu orang tetap memakai ID slot yang sama; petugas mencatat nama yang datang.
- Buat paket berversi dari T05, transfer ke T01–T04 dan T06, cocokan versinya. T05 menyimpan token asli; tablet lain hanya menerima hash dan metadata minimum. Simpan backup master privat.
- Jika memakai Supabase, jalankan [setup backend](docs/SETUP_SUPABASE.md) sebelum H-1: migrasi, akun/peran per stasiun, konfigurasi tablet dan publikasi riwayat paket T05. Uji sinkronisasi dua tablet serta antrean offline. Siapkan pengalihan kepemilikan akun perangkat saat koordinator berganti; jangan baru mengaktifkan backend pada jam registrasi.
- Uji pada **keenam tablet fisik**: cache aplikasi produksi saat online, impor paket, isi operator, minta storage persisten, cek kapasitas dan izin kamera HTTPS. Masuk mode pesawat lalu buka ulang halaman petugas, pindai QR layar **dan** kertas, simpan catatan dan unduh ekspor JSON. Pastikan berkas ada di penyimpanan perangkat. Safari/iPadOS dan Chrome/Android sesuai inventaris wajib diuji.
- Uji satu slot di dua tablet dan dua slot berbeda untuk satu PT. Transfer ekspor lewat AirDrop/Quick Share/media fisik/kanal internal yang telah diuji. Impor di T05, impor ulang, pastikan unik dan jejak kedua meja tersedia. Pisahkan profil uji sintetis dari profil produksi; jangan menghapus data operasional yang belum dicadangkan.
- Siapkan label fisik T01–T06, dudukan/pengisi daya, sambungan daya, dan daftar hadir kertas bernomor. Tentukan posisi meja bersama protokol agar drop-off, coffee break dan pintu pemotongan pita tetap bebas.

## Pembagian meja

| Tablet | Fungsi                                                                                  |
| ------ | --------------------------------------------------------------------------------------- |
| T01    | VIP/VVIP, bersama protokol dekat drop-off                                               |
| T02    | Reguler A di lobi                                                                       |
| T03    | Reguler B/mitra perusahaan; pilih filter perusahaan                                     |
| T04    | Bantuan, tanpa QR, nama ambigu/perwakilan                                               |
| T05    | Master, verifikasi RSVP dari WA, penggabungan dan rekap                                 |
| T06    | Cadangan sudah memiliki cache/paket; catatan tetap beridentitas T06 saat mengambil alih |

Jika personel kurang: satu jalur reguler, satu VIP, satu bantuan. Aktifkan reguler kedua setelah ada operator. Dua jalur dengan uji 15 detik/tamu berkapasitas teoretis 8 orang/menit; uji di lokasi. Jam tablet otomatis wajib cocok.

## Hari H

- **08.15**: nyalakan perangkat dan pengisi daya. Periksa operator, label, versi paket, jam otomatis/WIB, cache offline, kapasitas, QR cetak, dan jalur transfer. Arahkan layar rekap ke panitia.
- **08.30**: uji silang dengan slot uji pada profil uji; cek kamera/reload/ekspor/transfer. Jangan mencampurkan transaksi uji dengan roster produksi. Koordinator memastikan semua tablet produksi memakai paket sama.
- **08.40–09.00**: buka registrasi. Pindai QR check-in → cocokkan orang/instansi → isi nama perwakilan → Catat hadir → tunggu **Hadir tercatat di tablet ini**. RSVP bukan prasyarat check-in. Draf tidak boleh digunakan. Tamu ekstra hanya atas keputusan koordinator dan masuk slot tambahan di luar KPI; buat/distribusikan paket baru bila daftar berubah.
- Saat jeda memungkinkan, ekspor catatan tiap meja dan kirim ke T05. T05 melihat waktu berkas/waktu impor, menggabungkan dan menyimpan backup. Tanpa cloud, angka berubah setelah impor; dengan Supabase aktif dan login, kehadiran diperbarui setiap 15 detik saat online. Periksa antrean/waktu sinkron tiap perangkat. RSVP dari WA tetap dicatat pada master setelah diperiksa panitia.
- **Menjelang 09.01**: bila koordinator merangkap MC, serahkan T05 kepada pengganti yang ditetapkan dan perbarui nama operator sebelum transaksi baru.

## Gangguan dan penutupan

- Kamera ditolak/gagal: tutup kamera lalu gunakan Pindai foto QR atau cari kode/nama/instansi. QR check-in dan QR undangan dari domain resmi sama-sama diterima; QR asing ditolak. Untuk Supabase, siapkan login/operator dan muat roster melalui panel pemindai di halaman petugas sebelum jam registrasi.
- Gagal tersimpan/ruang habis: jangan menganggap hadir sudah tercatat. Coba ulang, ekspor yang masih dapat dibaca; jika perlu pindah T06. Jangan hapus storage/profil/origin. Kertas mencatat kode, nama aktual, waktu kedatangan WIB, stasiun, operator. Rekonsiliasi melalui input kertas T05; ubah stasiun/operator sesuai asal sebelum input dan kembalikan sesudahnya.
- Penutupan: minta **ekspor final setiap perangkat yang digunakan**, termasuk T05 dan T06 bila aktif. Cocokkan label fisik, waktu ekspor, dan jumlah. Jangan menandai meja yang dipakai sebagai tidak digunakan hanya untuk menghilangkan Sementara.
- Impor ulang aman. Konflik ID membatalkan batch; pertahankan berkas asli dan telusuri sumber. Dua tablet/slot sama dihitung sekali, tetapi semua catatan disimpan. Periksa nama berbeda, jam di luar tanggal acara, dan alternatif waktu. Koreksi melalui pilih efektif/batalkan dengan alasan. Untuk waktu salah, batalkan catatan salah lalu masukkan observasi kertas yang benar.
- Pastikan jumlah aktif sama dengan penyebut resmi, semua meja sudah direkonsiliasi atau disahkan tidak dipakai. Ekspor CSV UTF-8 dan backup master privat, catat waktu/cakupan, lalu serahkan lewat kanal internal. Simpan daftar kertas dan berkas asal sesuai kebijakan panitia.
- Aktifkan versi aplikasi baru **hanya sesudah sesi selesai dan backup diamankan**. Tentukan masa retensi/penghapusan bersama panitia; aplikasi tidak melakukan penghapusan otomatis.
