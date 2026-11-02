# Integrasi NASA FIRMS – Dashboard Karhutla TMK

Paket ini menyiapkan layer batas PBPH TMK, pengambilan hotspot NASA FIRMS, filter spasial polygon, penyimpanan riwayat rolling 7 hari, dan dashboard Leaflet.

## Isi paket
- `data/pbph.geojson`: batas keseluruhan PBPH TMK dari file yang diberikan.
- `scripts/fetch_firms.py`: mengambil data 4 sumber NRT dan menyaring titik yang berpotongan dengan polygon PBPH.
- `.github/workflows/hotspot.yml`: menjalankan pengambilan data setiap 3 jam.
- `index.html`, `style.css`, `app.js`: dashboard peta, KPI, grafik, filter, tabel, dan unduh CSV.
- `data/hotspot.geojson`, `data/hotspot.csv`, `data/hotspot_history.csv`: dibuat oleh workflow pertama kali berjalan.

## Langkah pemasangan ke repository
1. Salin/unggah isi folder paket ke root repository `Dashboard-karhutla-TMK`.
2. Pertahankan file dashboard lama bila ada; bila `index.html` sudah ada, integrasikan elemen dari versi ini atau backup dahulu sebelum mengganti.
3. Daftarkan NASA FIRMS MAP_KEY sebagai GitHub Actions secret bernama `FIRMS_MAP_KEY`:
   Settings → Secrets and variables → Actions → New repository secret.
4. Pastikan GitHub Actions diaktifkan dan workflow memiliki izin tulis ke repository:
   Settings → Actions → General → Workflow permissions → Read and write permissions.
5. Jalankan workflow `NASA FIRMS Hotspot Monitoring TMK` secara manual melalui tab Actions (`Run workflow`).
6. Aktifkan GitHub Pages melalui Settings → Pages → Deploy from a branch → `main` → `/ (root)` (sesuaikan nama branch bila berbeda).
7. Buka URL GitHub Pages repository.

## Jadwal
Cron `7 */3 * * *` berarti menit ke-7 setiap 3 jam berdasarkan UTC. Untuk WITA, jam target kira-kira 07:07, 10:07, 13:07, 16:07, 19:07, 22:07, 01:07, dan 04:07. GitHub Actions dapat terlambat beberapa menit saat antrean padat.

## Catatan operasional
- Data NRT NASA FIRMS adalah indikasi anomali termal, bukan konfirmasi kebakaran.
- Data yang ditampilkan adalah rolling 7 hari. Workflow harus berhasil dan commit ke repository agar riwayat terus terakumulasi.
- API NASA menggunakan area bounding box terlebih dahulu; script kemudian melakukan filter titik terhadap polygon PBPH TMK.
- `confidence` VIIRS umumnya berupa `l/n/h`; MODIS dapat memakai kategori berbeda. Interpretasi disesuaikan sumber data.
- Pastikan penggunaan data mengikuti ketentuan NASA FIRMS dan jangan mempublikasikan MAP_KEY.
- Script sengaja tidak memasukkan MODIS standard processing karena monitoring operasional memprioritaskan sumber NRT.
