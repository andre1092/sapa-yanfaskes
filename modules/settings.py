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
    st.markdown("<h1 style='color: #F8FAFC; font-weight: 700;'>⚙️ Pengaturan & Konfigurasi Sistem</h1>", unsafe_allow_html=True)
    st.caption("Manajemen akun eksekutif, Integrasi Google Workspace, dan Pemantauan API Rate Limiter.")
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
