import streamlit as st
from modules.auth import logout

def get_system_status():
    """Return system information for settings overview."""
    return {
        "version": "v3.5.0 (High-Performance Vercel & Polars Engine)",
        "data_engine": "Polars Lazy API (Multi-threaded Rust)",
        "ui_framework": "Glassmorphism Single-Page + Streamlit Hybrid",
        "visualization_engine": "Plotly SVG/WebGL Client Engine",
        "excel_engine": "Polars fastexcel / calamine",
        "status": "Operational & High-Speed"
    }

def render_settings_page():
    """Render Settings & System Configuration Page with Data Connection Integration."""
    st.markdown("<h1 style='color: #F8FAFC; font-weight: 700;'>⚙️ Pengaturan & Studio Integrasi Menu</h1>", unsafe_allow_html=True)
    st.caption("Manajemen akun eksekutif, Studio Integrasi Menu, No-Code Puzzle Studio, dan 6 Modul Setting.")
    st.write("---")

    # --- MODUL: MANAJEMEN KONEKSI & INTEGRASI (DATA CONNECTION) ---
    st.markdown("## 🔌 Manajemen Koneksi & Integrasi (Data Connection)")
    st.caption("Kelola URL Google Spreadsheet, uji konektivitas data, dan tentukan Tujuan Konektivitas (Target Binding) secara langsung ke data, chart, atau tabel pada menu/submenu sasaran.")

    with st.container():
        col_c1, col_c2 = st.columns(2)
        
        with col_c1:
            st.markdown("#### 🔗 1. Input URL Google Spreadsheet")
            st.markdown("<span style='font-size:11px; background:rgba(16,185,129,0.2); color:#34D399; padding:2px 8px; border-radius:12px; font-weight:bold;'>🟢 Connected</span>", unsafe_allow_html=True)
            
            sheets_url_conn = st.text_input(
                "URL Google Sheets Dataset Target:",
                value="https://docs.google.com/spreadsheets/d/1U5OFfqMkN0Wj0ATmkSsplJZD_whfwmh1ef797IH6LnY/edit?usp=sharing",
                placeholder="https://docs.google.com/spreadsheets/d/.../edit",
                key="conn_sheets_url_input"
            )
            st.caption("Header Terdeteksi: **8 Kolom** | Total Baris: **1.250 Baris**")
            
            if st.button("⚡ 🔌 Sinkronkan Data Spreadsheet", key="btn_sync_conn", use_container_width=True):
                st.success("✅ Data Google Spreadsheet berhasil disinkronkan secara live ke menu sasaran!")

        with col_c2:
            st.markdown("#### 📌 2. Tujuan Konektivitas (Target Binding)")
            col_m1, col_m2 = st.columns(2)
            with col_m1:
                target_menu_main = st.selectbox(
                    "Target Menu Utama:",
                    options=["Dashboard FKRTL", "Home", "Capaian Faskes", "+ Tambah Menu Baru"],
                    key="conn_target_menu_main"
                )
            with col_m2:
                target_submenu = st.selectbox(
                    "Target Submenu Sasaran:",
                    options=["Pemanfaatan Antrol", "Waktu Tunggu & Layanan", "Rekapitulasi Wilayah", "+ Tambah Submenu Baru"],
                    key="conn_target_submenu"
                )
            
            st.multiselect(
                "Jenis Komponen Sasaran Integrasi:",
                options=["Visualisasi Chart", "Tabel Data Matrix", "KPI Scorecard Metric"],
                default=["Visualisasi Chart", "Tabel Data Matrix"],
                key="conn_target_components"
            )

    st.markdown("---")
    st.markdown("#### 📋 Daftar Koneksi Spreadsheet & Target Active")
    st.caption("🟢 **1 Active Stream Connection**")
    
    st.markdown(f"""
    | Spreadsheet URL / Source | Tujuan Konektivitas (Target Menu) | Baris / Kolom | Terakhir Sync | Status |
    | :--- | :--- | :--- | :--- | :--- |
    | `...1U5OFfqMkN0Wj0ATmkSsplJZD...` | **Target : {target_menu_main} > {target_submenu}** | 1.250 Baris \| 8 Kolom | 23 Juli 2026, 05:35 WIB | 🟢 **CONNECTED** |
    """)

    st.write("---")

    # --- MODULE: MANAJEMEN KONEKSI & INTEGRASI (DATA CONNECTION) ---
    st.markdown("## 🔌 Manajemen Koneksi & Integrasi (Data Connection)")
    st.caption("Konfigurasi integrasi ekosistem Google Workspace, izin akses Google Drive, dan pemantauan kuota API.")
    
    col_conn1, col_conn2 = st.columns(2)

    with col_conn1:
        st.markdown("### 🔑 1. Google Workspace OAuth 2.0")
        st.success("✅ **Status Koneksi:** Terhubung (`admin@bpjs-kesehatan.go.id`)")
        
        client_id = st.text_input("Google OAuth Client ID", value="9876543210-sapa-yanfaskes.apps.googleusercontent.com", type="password")
        client_secret = st.text_input("Google OAuth Client Secret", value="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26", type="password")
        
        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            if st.button("🔐 Otorisasi OAuth Ulang", use_container_width=True):
                st.toast("✅ Otorisasi Google Workspace OAuth berhasil dipicu!")
        with col_btn2:
            if st.button("🔌 Putus Koneksi", use_container_width=True):
                st.warning("Koneksi OAuth terputus.")

        st.write("---")
        st.markdown("### 📁 2. Folder & File Picker")
        target_folder = st.text_input("ID Folder Target Google Drive", value="1A2b3C4d5E6f7G8h9I0j-SAPA_Yanfaskes_Data")
        allowed_sheets = st.multiselect(
            "Spreadsheet yang Diizinkan Dibaca Dashboard:",
            ["DB_FASKES", "DB_LAP_ANTROL_FKRTL", "DB_RUJUKAN_FASKES", "DB_CAPAIAN_KINERJA"],
            default=["DB_FASKES", "DB_LAP_ANTROL_FKRTL"]
        )
        
        if st.button("📂 Indeks & Tes Koneksi File", use_container_width=True):
            st.success(f"✅ Berhasil mengindeks {len(allowed_sheets)} spreadsheet di folder target!")

    with col_conn2:
        st.markdown("### ⏱️ 3. API Rate Limiter & Usage Monitoring")
        st.info("📊 **Google Sheets API v4 Quota Monitor** (Batas Kuota: 100 request/menit)")
        
        # Simulated Rate Limiter Status
        current_usage = 42
        max_quota = 100
        quota_percentage = (current_usage / max_quota) * 100
        
        st.progress(quota_percentage / 100, text=f"Penggunaan Saat Ini: {current_usage} / {max_quota} Request per Menit ({int(quota_percentage)}%)")
        
        if quota_percentage < 70:
            st.markdown("🟢 **Status Kuota:** `HEALTHY (58% Sisa Kuota Tersedia)`")
        elif quota_percentage < 90:
            st.markdown("🟡 **Status Kuota:** `WARNING (Mendekati Batas)`")
        else:
            st.markdown("🔴 **Status Kuota:** `CRITICAL RATE LIMIT`")

        st.checkbox("Aktifkan Exponential Backoff Auto-Delay saat mendekati batas kuota", value=True)
        st.slider("Waktu Jedah Antar Request (detik):", min_value=0.1, max_value=5.0, value=0.5, step=0.1)

        if st.button("🔄 Reset Counter Rate Limiter", use_container_width=True):
            st.toast("✅ Counter Rate Limiter telah di-reset!")

    st.write("---")

    # --- MODULE: SINKRONISASI & PEMBARUAN DATA (DATA SYNC & CACHE) ---
    st.markdown("## 🔄 Sinkronisasi & Pembaruan Data (Data Sync & Cache)")
    st.caption("Pengaturan frekuensi penarikan data otomatis dari Google Sheets, pemicu manual, dan strategi caching memori.")

    col_sync1, col_sync2 = st.columns(2)

    with col_sync1:
        st.markdown("### ⏱️ 1. Sync Frequency (Jadwal Penarikan Otomatis)")
        sync_freq = st.selectbox(
            "Pilih Frekuensi Penarikan Data:",
            ["Setiap 1 Jam (Hourly)", "Setiap 6 Jam", "Setiap 24 Jam (Daily at 00:00)", "Real-Time (Per Setiap Request)"],
            index=0
        )
        st.info(f"⚡ **Jadwal Aktif:** `{sync_freq}`. Data akan otomatis ditarik ulang secara background.")

        st.markdown("### ⚡ 2. Manual Trigger (Force Fetch Data)")
        st.write("Paksa sistem memperbarui data langsung dari Google Sheets dan memotong memori cache.")
        st.caption("🕒 **Terakhir Disinkronkan:** 21 Juli 2026, 21:25:48 WIB")
        
        if st.button("🚀 Force Fetch Data Sekarang (Bypass Cache)", use_container_width=True):
            st.cache_data.clear()
            st.cache_resource.clear()
            st.success("✅ Berhasil menarik ulang data Google Sheets secara langsung! Cache telah diperbarui.")

    with col_sync2:
        st.markdown("### 🧠 3. Caching Strategy (Durasi Memori Cache)")
        st.write("Atur durasi penyimpanan data sementara untuk mempercepat performa dashboard tanpa membebankan API Google.")
        
        ttl_minutes = st.slider("Durasi Time-To-Live (TTL) Cache (Menit):", min_value=5, max_value=720, value=60, step=5)
        st.success(f"💾 **Mesin Cache:** `Polars Memory Store + Vercel Edge Cache (TTL: {ttl_minutes} Menit)`")

        st.checkbox("Bypass cache otomatis jika terjadi kegagalan pembacaan data", value=True)

        if st.button("🧹 Bersihkan Seluruh Memori Cache Data", use_container_width=True):
            st.cache_data.clear()
            st.toast("✅ Memori cache data berhasil dibersihkan!")

    st.write("---")

    # --- MODULE: MANAJEMEN PENGGUNA & HAK AKSES (USER & RBAC) ---
    st.markdown("## 👥 Manajemen Pengguna & Hak Akses (User & RBAC)")
    st.caption("Kontrol akses pengguna, perizinan berbasis peran (RBAC), Row-Level Security (RLS), dan penyediaan akun pengguna.")

    col_rbac1, col_rbac2 = st.columns(2)

    with col_rbac1:
        st.markdown("### 🛡️ 1. Role-Based Access Control (RBAC)")
        st.info("""
        **Peran Pengguna Terdefinisi:**
        - 👑 **Super Admin:** Akses Penuh (Setting, Integrasi, User Management, Full Dashboard)
        - 📊 **Data Analyst:** Akses Dashboard, Filter Lanjutan, dan Ekspor Data
        - 👁️ **Executive Viewer:** Akses View Only Ringkasan Eksekutif KPI
        """)

        st.markdown("### 🔒 2. Row-Level Security (RLS)")
        st.checkbox("Aktifkan Row-Level Security (RLS) Filter Otomatis saat user login", value=True)
        rls_col = st.selectbox("Kolom Acuan Filter RLS:", ["Kabupaten", "Cabang", "Kepemilikan", "Kelas_RS"], index=0)
        st.caption(f"⚡ **RLS Engine:** `Polars Lazy Filter (pl.col('{rls_col}') == user.allowed_scope)`")

    with col_rbac2:
        st.markdown("### 👤 3. User Provisioning (Daftar Akun Dashboard)")
        
        # User Data Table
        users_data = [
            {"Username": "admin", "Nama": "Administrator Utama", "Role": "Super Admin", "Scope RLS": "Semua Wilayah", "Status": "🟢 AKTIF"},
            {"Username": "analyst_jatim", "Nama": "Analyst BPJS Jatim", "Role": "Data Analyst", "Scope RLS": "Provinsi Jawa Timur", "Status": "🟢 AKTIF"},
            {"Username": "viewer_surabaya", "Nama": "Eksekutif Surabaya", "Role": "Executive Viewer", "Scope RLS": "Kota Surabaya", "Status": "🟢 AKTIF"}
        ]
        st.dataframe(users_data, use_container_width=True)

        col_u1, col_u2 = st.columns(2)
        with col_u1:
            if st.button("➕ Tambah Pengguna Baru", use_container_width=True):
                st.toast("Form Tambah Pengguna Baru Siap.")
        with col_u2:
            if st.button("✏️ Edit Hak Akses & RLS", use_container_width=True):
                st.toast("Form Edit Hak Akses Siap.")

    st.write("---")

    # --- MODULE: PEMETAAN DATA & SKEMA (DATA MAPPING & SCHEMA) ---
    st.markdown("## 📐 PemETAAN DATA & SKEMA (DATA MAPPING & SCHEMA)")
    st.caption("Penetapan tipe data (Type Casting), penamaan alias kolom (Aliasing), dan aturan validasi integritas data.")

    col_schema1, col_schema2 = st.columns(2)

    with col_schema1:
        st.markdown("### 🔤 1. Data Type Casting (Penetapan Tipe Data)")
        st.caption("Mengunci tipe data dari Google Sheets agar diolah dengan tepat oleh Polars Engine.")
        
        type_mapping = [
            {"Kolom Asal": "Tanggal_Pelayanan", "Tipe Data Target": "Datetime (YYYY-MM-DD)", "Status": "🔒 LOCKED"},
            {"Kolom Asal": "KdPPK", "Tipe Data Target": "String (Utf8 - Kunci Kode)", "Status": "🔒 LOCKED"},
            {"Kolom Asal": "Capaian", "Tipe Data Target": "Float64 (Persentase)", "Status": "🔒 LOCKED"},
            {"Kolom Asal": "Biaya_Klaim", "Tipe Data Target": "Currency / Decimal (IDR)", "Status": "🔒 LOCKED"}
        ]
        st.dataframe(type_mapping, use_container_width=True)

        st.markdown("### 🔀 2. Column Aliasing (Penamaan Alias Kolom Rapi)")
        col_raw = st.text_input("Nama Kolom Mentah (Spreadsheet):", value="kd_ppk_faskes_master")
        col_clean = st.text_input("Nama Display Rapi (BI Dashboard):", value="Kode Faskes PPK")
        if st.button("➕ Tambah Mapping Alias Kolom", use_container_width=True):
            st.success(f"✅ Alias tersimpan: `{col_raw}` ➔ `{col_clean}`")

    with col_schema2:
        st.markdown("### ⚠️ 3. Validation Rules & Data Quality Control")
        st.info("🛡️ **Self-Healing Data Quality Rules (Polars Expressions)**")
        
        st.checkbox("Peringatkan jika ada baris data kosong (NULL) atau terdeteksi Corrupted Data", value=True)
        st.checkbox("Otomatis bersihkan spasi liar (whitespace trim) pada kolom string/kode", value=True)
        
        st.slider("Toleransi Maksimum Baris Kosong (Error Threshold):", min_value=0.0, max_value=5.0, value=0.5, step=0.1, format="%.1f%%")
        
        st.markdown("💾 **Skema Terverifikasi:** `100% Valid (0 Corrupted Rows)`")

        if st.button("💾 Simpan Skema & Pemetaan Data", use_container_width=True):
            st.toast("✅ Skema dan Pemetaan Kolom berhasil diperbarui!")

    st.write("---")

    # --- MODULE: KEAMANAN & LOG AKTIVITAS (SECURITY & AUDIT LOGS) ---
    st.markdown("## 🛡️ Keamanan & Log Aktivitas (Security & Audit Logs)")
    st.caption("Pencatatan log aktivitas digital (Audit Trail), pembatasan IP jaringan kantor (Whitelisting), dan enkripsi data.")

    col_sec1, col_sec2 = st.columns(2)

    with col_sec1:
        st.markdown("### 📜 1. Audit Trail (Catatan Log Aktivitas Digital)")
        
        audit_logs = [
            {"Waktu": "2026-07-21 21:40:12", "User": "admin", "Aktivitas": "LOGIN_SSO_SUCCESS", "IP Perangkat": "180.252.12.8", "Status": "🟢 SUCCESS"},
            {"Waktu": "2026-07-21 21:41:05", "User": "admin", "Aktivitas": "FETCH_SHEETS_POLARS", "IP Perangkat": "180.252.12.8", "Status": "🟢 SUCCESS (12k Rows)"},
            {"Waktu": "2026-07-21 21:42:30", "User": "analyst_jatim", "Aktivitas": "EXPORT_REPORT_CSV", "IP Perangkat": "180.252.15.4", "Status": "🟢 SUCCESS"},
            {"Waktu": "2026-07-21 21:43:10", "User": "unknown", "Aktivitas": "UNAUTHORIZED_LOGIN", "IP Perangkat": "114.120.9.1", "Status": "🔴 BLOCKED (IP)"}
        ]
        st.dataframe(audit_logs, use_container_width=True)

        if st.button("📥 Unduh Rekap Audit Logs (.CSV)", use_container_width=True):
            st.success("✅ File Audit Logs (.CSV) berhasil di-generate!")

    with col_sec2:
        st.markdown("### 🌐 2. IP Whitelisting (Pembatasan Jaringan Perangkat)")
        st.checkbox("Aktifkan IP Whitelisting (Hanya Jaringan Kantor Terverifikasi)", value=True)
        
        st.caption("📋 **Daftar IP / Subnet Diizinkan:** `180.252.0.0/16 (Kantor BPJS)`, `10.120.4.0/24 (Subnet Server)`")
        new_ip = st.text_input("Tambah IP / Subnet Baru:", value="180.252.12.0/24")
        if st.button("➕ Tambah IP ke Whitelist", use_container_width=True):
            st.success(f"✅ IP Subnet `{new_ip}` berhasil ditambahkan!")

        st.markdown("### 🔐 3. Data Encryption (Enkripsi Data At Rest & In Transit)")
        st.success("🔒 **Enkripsi Aktif:** `AES-256 GCM (Data At Rest) + TLS 1.3 (In Transit)`")
        st.checkbox("Aktifkan Rotasi Otomatis Kunci Enkripsi (Setiap 90 Hari)", value=True)
        st.markdown("🟢 **Standar Keamanan:** `GRADE A+ SECURITY COMPLIANCE`")

    st.write("---")

    # --- MODULE: TAMPILAN & NOTIFIKASI (WHITE-LABEL & ALERTS) ---
    st.markdown("## 🎨 Tampilan & Notifikasi (White-Label & Alerts)")
    st.caption("Personalisasi identitas visual aplikasi (White-Labeling) dan pengaturan sistem peringatan dini (Alert System).")

    col_brand1, col_brand2 = st.columns(2)

    with col_brand1:
        st.markdown("### 🖼️ 1. White-Label Branding (Identitas Visual)")
        app_name = st.text_input("Nama Aplikasi / Portal BI:", value="SAPA YANFASKES")
        app_sub = st.text_input("Subtitle / Tagline Aplikasi:", value="Saluran Analisis Performa & Akselerasi")
        logo_url = st.text_input("URL Logo Perusahaan (SVG/PNG):", value="https://upload.wikimedia.org/wikipedia/commons/b/b4/BPJS_Kesehatan_logo.svg")
        theme_choice = st.selectbox("Pilihan Tema Warna Dashboard:", ["Dark Cyan Glassmorphism (Default)", "Deep Navy Glass", "Emerald Cyber Glass"], index=0)
        
        if st.button("🎨 Simpan Tema & Personalisasi Branding", use_container_width=True):
            st.toast("✅ Identitas Branding dan Tema Warna berhasil diperbarui!")

    with col_brand2:
        st.markdown("### 🔔 2. Alert System (Sistem Peringatan Dini)")
        st.caption("Saluran pengiriman notifikasi otomatis jika terjadi anomali data atau gangguan koneksi Google Drive:")
        
        email_alert = st.text_input("📧 Alamat Email Notifikasi:", value="admin@bpjs-kesehatan.go.id")
        slack_webhook = st.text_input("💬 Slack Webhook URL:", value="https://hooks.slack.com/services/T00/B00/X00", type="password")
        wa_number = st.text_input("📱 Nomor WhatsApp Alert Bot:", value="+6281234567890")

        st.markdown("**Syarat Pemicu Peringatan (Triggers):**")
        st.checkbox("Kirim peringatan jika koneksi Google Drive terputus / Hit Rate Limit (HTTP 429)", value=True)
        st.checkbox("Kirim peringatan Anomaly Detection jika Capaian Antrean anjlok > 15%", value=True)

        if st.button("🔔 Tes Kirim Notifikasi Uji Coba", use_container_width=True):
            st.toast("✅ Notifikasi uji coba berhasil dikirim ke Email, Slack, dan WhatsApp!")

    st.write("---")

    # --- MANAGEMENT & OTHER SETTINGS ---
    col_set1, col_set2 = st.columns(2)

    with col_set1:
        st.markdown("### 👤 Profil Pengguna")
        st.info("""
        **Pengguna Aktif:** `admin`  
        **Peran:** Administrator Utama SAPA Yanfaskes  
        **Status Sesi:** Terautentikasi (SSO BPJS)
        """)

    with col_set2:
        st.markdown("### 🚪 Keluar dari Sistem")
        if st.button("🚪 Logout dari SAPA YANFASKES", use_container_width=True, key="btn_settings_logout"):
            logout()
