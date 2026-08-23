# Ringkasan Lengkap — Kerja yang Ditambah ke Projek ePTW

## Fasa 1 — Pemeriksaan (tanpa ubah kod)
- Periksa keseluruhan repo: struktur `src/app`, `src/components`, `src/lib`, API routes, klien Supabase, RLS, enum, aliran kerja permit, jadual kontraktor/keselamatan.
- Jurang dijumpai: dashboard statik, tiada carian, tiada Cancel, bug `approved_and_issued`, tiada JHA/LOTO/gas, tiada lampiran/PDF, pautan nav 404, tiada migrasi dalam repo.

## Fasa 2–4 — Kitaran hayat permit & audit
- `approve-and-issue` kini rekod `approved` + `issued` (bukan `approved_and_issued` yang tiada dalam enum), serta pintu semakan kawalan keselamatan wajib.
- Tambah route + butang Cancel (draft/pending/rejected/approved/issued -> `cancelled`, sebab wajib).
- Complete/Close kini simpan `completed_by/at`, `closed_by/at` dan papar dalam halaman detail.
- Semua ralat audit yang ditelan dibetulkan — kegagalan audit kini pulangkan ralat bermakna tanpa bocorkan code/details/hint.

## Fasa 5 — Kawalan keselamatan
- Fungsi DB idempotent `sync_permit_safety_controls` + trigger + backfill draft.
- Route create/update panggil sync; route verify tambah semakan syarikat + peranan lebih luas.

## Fasa 6–8 — JHA / LOTO / Gas Testing
- Jadual baru (`jhas`, `loto_isolation_points`, `gas_tests`) dengan RLS.
- 6 API route (cipta + sahkan setiap satu) + UI pada halaman permit.
- Pintu kelulusan: permit yang perlukan JHA/gas/LOTO tidak boleh diluluskan sebelum disahkan.

## Fasa 9 — Kontraktor
- Halaman daftar kontraktor (`/register/contractor`), halaman pengurusan (`/contractors`), kebenaran per-syarikat via RPC `set_contractor_authorization`.

## Fasa 10 — Lampiran
- Jadual `permit_attachments` + bucket storage peribadi `permit-attachments` (20MB, PDF/gambar/dokumen), muat naik/muat turun dengan signed URL, RLS terasing mengikut syarikat.

## Fasa 11 — Cetakan PDF
- Halaman `/permits/[id]/print` dengan QR code, sedia dicetak ke PDF.

## Fasa 12–13 — Dashboard & carian
- Dashboard dengan kiraan status sebenar + permit terbaru.
- Penapis server-side di `/permits` (teks, status, jenis, kawasan, kontraktor, requester, tarikh).

## Fasa 14 — Pengurusan pengguna
- Safety Manager boleh jemput pengguna, tukar peranan (safety_coordinator/internal_staff), nyahaktifkan akaun.

## Fasa 15 — Konfigurasi syarikat
- Halaman `/areas`, `/equipment`, `/settings` (jenis permit + katalog kawalan keselamatan + pemetaan wajib per jenis).

## Fasa 16 — Notifikasi
- Jadual `notifications` + loceng dengan badge; setiap aksi kitaran hayat hantar notifikasi (submitted -> safety staff; lain-lain -> requester); email SMTP pilihan (nodemailer).

## Fasa 17 / 20 — RLS & migrasi
- Dokumen `docs/RLS_AUDIT.md` + satu migrasi idempotent `supabase/migrations/20260101_eptw_mvp.sql` (937 baris): jadual baru, fungsi, constraint, polisi RLS untuk jadual baru + penambahan terpelihara (guarded) untuk jadual sedia ada.

## Fasa 21–22 — UI/UX & ujian
- Buang pautan mati; proxy auth diluaskan ke semua route dilindungi; metadata dikemas kini.
- Sidebar jadi drawer — tersembunyi, muncul bila klik butang hamburger (3 baris) di header.
- Disahkan: `tsc` 0 ralat, `lint` 0 ralat, `next build --webpack` berjaya, smoke test dev server.

## Kerja langsung pada Supabase
- Migrasi diterapkan & disahkan — semua jadual, lajur, fungsi, constraint, bucket wujud.
- Kata laluan 8 akaun ujian direset ke nilai ujian yang diketahui (login disahkan HTTP 200).
- Pemetaan kawalan syarikat 3 diisi (jenis 9–13 tiada pemetaan sebelum ini).
- Permit 18 (PTW-2026-0020) diselaraskan (mendapat kawalan JHA; status kekal active/active; sejarah asal dikekalkan).
- Akaun baharu: `safetycoord1@test.com` (Safety Coordinator, syarikat 1).

## Model Peranan 5 (Final) & Kontraktor PTW
- **5 peranan perniagaan**: `platform_admin`, `safety_manager`, `safety_coordinator`, `internal_staff`, `contractor_admin`. Peranan lama (requester/supervisor/permit_issuer/safety/admin/work_supervisor) digantikan dan tidak dipaparkan di UI.
- **Self-approval**: Safety Manager & Safety Coordinator boleh cipta, hantar dan **lulus sendiri** PTW mereka (tidak perlu pelulus lain). Internal Staff & Contractor Admin **tidak boleh** meluluskan.
- **Kontraktor PTW**: borang memerlukan Worker Name, Worker ID, dan **"{Nama Syarikat}'s Staff Reference"** (satu medan nama sahaja, label dinamik mengikut syarikat pelanggan).
- **Pintu keselamatan**: self-approval tidak memintas keperluan JHA/LOTO/gas/kawalan yang belum disahkan.
- Semua migrasi peranan + polisi RLS terkini direkod dalam `supabase/migrations/20260101_eptw_mvp.sql` dan diterapkan ke pangkalan data langsung.
- Disahkan: 71 semakan QA langsung lulus; `tsc` 0 ralat, `lint` 0 ralat, `next build --webpack` berjaya; PTW-2026-0020 kekal `active`/`active`.

## Git
- Komit pada `main` (telah di-push ke GitHub `mhazeeq99-web/eptw`):
  `df26237` (5-role model), `400fc92` (release candidate), `1643555` (hardening+QA),
  `5119f85` (audit+gap closure), `3b51c2f` (sidebar drawer), `3d05f3b` (fix constraint), `da12648` (MVP penuh).
