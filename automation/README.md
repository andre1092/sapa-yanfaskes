# Pembaruan data SAPA melalui browser chat

Kirim `update poli` untuk Nama Poli atau `update antrol` untuk antrean per RS/FKRTL.
Alur tetap ada pada `update-poli.md` dan `update-aan.md`, dipilih melalui
`.agents/skills/sapa-update-poli/SKILL.md`.

Pekerjaan menggunakan browser tersemat aplikasi chat dan Google Sheets terhubung.
Login dilakukan manual. Jika alat browser tidak tersedia atau BI menolak akses,
pekerjaan berhenti dengan bukti kendala. Browser SAPA, panel agen Poli/Aan,
companion, dispatcher, antrean lokal dan pengaturan akun/model sudah dihapus.
Tidak ada server lokal atau jadwal yang perlu dijalankan.

`aan_snapshot.py` adalah validator data murni untuk alur antrean RS, tanpa browser,
kredensial, jaringan atau penulisan. Jalankan tes dengan
`python3 -m unittest automation.test_aan_snapshot`.

Data spreadsheet dan dashboard tetap dipertahankan. Bukti historis serta receipt
privat bukan sumber data baru; baca tujuan native sebelum mengulang penulisan.
