# Format pertukaran data v1

Definisi yang dieksekusi adalah skema Zod pada `src/model.ts`. Event tunggal implementasi ini: `rsas-2026-11-19`. Semua JSON memakai `schema_version: 1`, `event_id`, `type`. Waktu ISO 8601 berzona; aplikasi menghasilkan UTC `Z`. UUID dipakai untuk ID perangkat/catatan/slot baru. Kode undangan stabil, maksimal 100 karakter alfanumerik, `_` atau `-`. Jangan memasukkan data nyata ke contoh/repo.

## CSV masukan

Kolom wajib: `invitation_code,name,invited_label,organization,guest_group,guest_category,roster_status`.

`roster_status` wajib `draft`; kategori `REGULER`, `VIP`, `VVIP` (kosong = REGULER). `invited_label` wajib. `name` boleh kosong untuk institusi. CSV dikutip sesuai standar, UTF-8, dengan/tanpa BOM. Maksimum teks per nilai 300 karakter, 5.000 slot, 5 MB. Kode duplikat dalam berkas atau master dilaporkan dengan nomor baris. Pengesahan selalu lokal. Template/demo tersedia di `examples/` dan lewat UI.

## `roster-package`

```json
{
  "schema_version": 1,
  "type": "roster-package",
  "event_id": "rsas-2026-11-19",
  "package_version": 1,
  "created_at": "2026-11-18T01:00:00Z",
  "slots": []
}
```

Setiap slot: `id`, `code`, `name`, `label`, `organization`, `group`, `category`, `kind` (`person|institution`), `status` (`active|cancelled|extra`), `representative`, `desk`, `rsvp: "unknown"`, `tokenHash` (SHA-256 heksadesimal 64 karakter). Token asli dilarang. Draf tidak boleh masuk paket. Hash, kode dan ID unik; hash wajib, termasuk slot dibatalkan. Paket impor harus lebih baru dan mempertahankan slot/kode yang sudah dikenal. Slot dibatalkan tetap ada untuk jejak. Master menyimpan semua versi paket; pemindai menerima versi yang didistribusikan.

## `station-log`

```json
{
  "schema_version": 1,
  "type": "station-log",
  "event_id": "rsas-2026-11-19",
  "device_id": "00000000-0000-4000-8000-000000000001",
  "station_id": "T02",
  "package_version": 1,
  "exported_at": "2026-11-19T02:00:00Z",
  "records": []
}
```

Catatan memiliki `record_id`, `event_id`, `invitation_id`, `invitation_code`, `device_id`, `station_id`, `operator`, `occurred_at`, `package_version`, `action`, `source`, `representative`, `reason`, dan opsional `target_id`.

- `action`: `checkin|void|select`. `void/select` memerlukan alasan dan ID target check-in slot sama; bukan mutasi atas catatan awal.
- `source`: `qr|manual|paper`; `paper` menyimpan waktu observasi, yang dimasukkan sebagai WIB.
- Semua catatan dalam berkas harus milik `device_id` envelope. `station_id` envelope adalah label saat ekspor; catatan tetap menyimpan label saat pencatatan bila perangkat pernah dialihkan.
- Berkas hanya mencakup seluruh log **yang dibuat perangkat tersebut**, tanpa roster, token atau hash. Maksimum 20.000 catatan/5 MB. JSON master backup adalah jenis lain dan tidak diterima sebagai ekspor stasiun.
- Versi envelope dan tiap catatan harus dikenali master. Revisi lama diterima jika ID/kode slot dapat dicocokkan. Catatan asli dipertahankan walau slot dibatalkan pada revisi baru.
- Impor satu batch memvalidasi semuanya dahulu lalu menyimpan atomik. UUID sama dan isi sama = sudah ada. UUID sama dan isi berbeda = konflik; seluruh batch ditolak. Urutan key objek tidak memengaruhi kesamaan.
- Kehadiran efektif: abaikan target yang dibatalkan, gunakan pilihan efektif terakhir yang masih valid atau timestamp absolut paling awal; untuk waktu identik gunakan urutan `record_id`. Perbedaan nama/jam di luar tanggal acara/lebih dari satu catatan menandai tinjauan. Semua sumber tetap tersedia.

## `master-backup` (privat)

Envelope berisi `exported_at` dan `state`. State memuat `schema_version`, `device_id`, `config`, `slots` (termasuk token asli), `package_version`, `packages` (riwayat), `records`, `denominator`, `audit`, `receipts`, `unusedStations`. Token asli acak 192-bit base64url hanya ada di master dan URL fragment/QR tamu.

Pemulihan memvalidasi skema, keunikan slot/versi, kecocokan token-hash dan referensi log. Hanya master kosong boleh dipulihkan. ID perangkat tujuan dan nama operator saat pemulihan dipertahankan; jejak perangkat asal tidak diubah. Pemulihan membutuhkan file backup lengkap; ekspor stasiun tidak dapat menggantikan backup penerbitan.

Audit memuat UUID, waktu, operator, aksi dan detail. Bukti pengesahan penyebut tercatat sebagai aksi `denominator` dengan nilai sebelum/sesudah dan alasan. Audit ini jejak lokal; pengguna yang menguasai perangkat/berkas dapat mengubah data. Tidak ada tanda tangan digital atau verifikasi identitas terpusat.

## Progres Supabase dan backup

DB browser v3 menambah store `cloud` untuk Project URL, publishable key, flag aktif dan progres terikat proyek/akun (cursor, ID yang sudah dikonfirmasi, waktu sinkron). Sesi login dikelola SDK secara terpisah. Store ini dan sesi tidak termasuk `state` dalam master backup atau ekspor stasiun.

Receipt gabungan mempunyai field tambahan `source: "file" | "cloud"`; backup lama tanpa field tersebut dibaca sebagai `file`. Receipt cloud tidak dianggap sebagai bukti ekspor final meja dalam pengesahan rekap. Format paket dan catatan tetap v1. SQL, batas batch dan hak akses server dijelaskan di [setup Supabase](SETUP_SUPABASE.md).

## CSV keluaran

UTF-8 BOM untuk Excel. Kolom kode, nama undangan, perwakilan aktual, instansi, kategori, status slot/RSVP/hadir, waktu WIB dan ISO, stasiun, sumber, penanda tinjauan, waktu ekspor, cakupan tablet dan status rekap. Nilai berawalan formula spreadsheet diberi petik tunggal. Catatan tambahan tetap ada dengan status `extra`, terpisah dari KPI resmi.
