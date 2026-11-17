# Catatan verifikasi implementasi

Dijalankan pada 17 November 2026 dalam lingkungan cloud, memakai **data sintetis saja**. Runtime Node.js 24.22.1, npm 11.9.0, Chromium sistem 156.0.8078.79. Belum ada deployment Vercel yang diakses atau pengujian tablet fisik.

| Pemeriksaan                                                              | Hasil aktual                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npm ci --cache /tmp/rsas-npm-cache --no-audit --no-fund`                | Berhasil memasang dari lockfile                                              |
| `npm run typecheck`                                                      | Lulus                                                                        |
| `npm run lint`                                                           | Lulus tanpa error/peringatan lint                                            |
| `npm test`                                                               | **28 lulus**, 2 berkas; tidak ada skip                                       |
| `npm run build`                                                          | Lulus; `dist` berisi HTML, JS, CSS, manifest, ikon dan service worker statis |
| `node --check dist/sw.js`                                                | Lulus untuk worker yang dihasilkan build                                     |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` | **2 lulus**, tanpa skip; menjalankan build produksi melalui Vite preview     |

Build mengeluarkan pemberitahuan anotasi pure dari dependensi Zod; build tetap sukses. Tidak ada artefak Functions/API. Cache npm default tidak dapat ditulis pada mesin ini, sehingga digunakan `/tmp/rsas-npm-cache`. Unduhan browser Playwright diblokir kebijakan domain; pengujian memakai Chromium yang sudah terpasang, bukan menonaktifkan verifikasi unduhan.

## Bukti alur

- **Perusahaan:** impor tiga draf sintetis, sahkan dua slot satu PT dan satu tamu bernama, terbitkan kartu/paket. Dua slot PT mempunyai token berbeda; paket tidak menyertakan token asli. Filter kelompok mitra/perusahaan menampilkan dua slot PT.
- **Tamu:** buka tautan `/rsvp` dengan fragmen kartu di viewport ponsel, siapkan draf RSVP, verifikasi pesan siap dikirim dan unduh PNG check-in. Nomor WA publik tidak dikonfigurasi dalam pengujian sehingga jalur balas chat tersedia; pengiriman WhatsApp sungguhan tidak dijalankan. Data RSVP master tetap `unknown` setelah aksi guest dan check-in.
- **Petugas:** cocokkan QR perusahaan lalu simpan; tamu perseorangan juga dicatat melalui pencarian dengan nama undangan terisi. Simulasi penolakan kamera tetap menyediakan pencarian. Simulasi kegagalan tulis IndexedDB menampilkan Gagal tersimpan, tidak menampilkan sukses, lalu percobaan ulang berhasil.
- **Offline:** muat build/paket/operator di konteks browser tablet, tunggu cache lengkap, putuskan jaringan Playwright, reload halaman petugas, pindai citra QR dari aliran video canvas dengan decoder aplikasi, simpan, reload dan unduh JSON. Ini uji browser otomatis; bukan bukti kamera/koneksi fisik tablet.
- **Dua tablet:** T02 dan T03 mencatat slot PT yang sama, lalu slot PT kedua dan tamu umum. Gabungan menghasilkan **4 jejak asli dan 3 kehadiran unik**. Impor ulang T03 tidak menambah jejak. Backup pulih pada konteks baru dengan token/catatan tetap dan device ID tujuan berbeda.
- **Aturan penggabungan:** unit test membuktikan batch konflik/tidak valid ditolak tanpa perubahan master, acara/aksi/revisi/slot salah ditolak, revisi lama yang dikenali diterima, dan urutan waktu absolut/ID stabil. Waktu/nama meragukan ditandai; pembatalan/pemilihan efektif tidak menghapus sumber.
- **Ketahanan:** fake IndexedDB membuktikan dua pencatatan bersamaan menghasilkan satu check-in aktif, persistensi baca ulang, rollback, dan indeks unik acara/slot.
- **KPI:** 62/73 tidak mencapai 85%; 63/73 mencapai. Tambahan terpisah; draf tidak ikut operator, kartu, paket, atau KPI. Penyebut berubah lewat audit.
- **Ekspor:** CSV BOM menetralkan formula dan memuat waktu/cakupan; ekspor stasiun tidak memuat token/hash/roster.
- **Navigasi/tampilan:** deep link lokal `/rsvp`, `/petugas`, `/koordinator/undangan`, `/pengaturan` mengembalikan shell aplikasi. Screenshot desktop 1440 px dan ponsel 390 px diperiksa; tidak ada overflow halaman, tabel dapat digeser horizontal. Rewrite Vercel sebenarnya masih perlu diuji setelah deploy.

## Masih wajib sebelum produksi

1. Deploy ke origin HTTPS resmi, uji deep link Vercel sebenarnya dan konfigurasi nomor WhatsApp yang disetujui. Kirim/balas pesan nyata dengan panitia; pembukaan WhatsApp tidak berarti pesan sudah terkirim.
2. Sekretariat mengesahkan roster, identitas, kategori, dua slot tiap perusahaan bila perlu, dan penyebut; selesaikan selisih 71/73. Tetapkan operator/pengganti MC serta origin/profil browser produksi.
3. Jalankan uji Safari/iPadOS dan Chrome/Android pada inventaris sebenarnya: izin kamera, QR dari layar/kertas, fokus/pencahayaan, sentuhan portrait/landscape, reload mode pesawat, penyimpanan ekspor dan pemulihan setelah browser ditutup. Target 15 detik/tamu harus diukur di lokasi.
4. Uji transfer berkas antartablet/T05, kesamaan versi paket, jam otomatis, persistensi/kuota, T06, daya dan daftar kertas. Verifikasi backup master serta prosedur pergantian QR/paket dan pembaruan PWA seusai sesi.

Lihat [runbook](../RUNBOOK_ACARA.md) untuk jadwal 08.15, 08.30 dan 08.40 WIB. Uji otomatis tidak menggantikan penerimaan operasional enam tablet.
