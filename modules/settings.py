import streamlit as st
from modules.auth import logout

def get_system_status():
    """Return system information for settings overview."""
    return {
        "version": "v3.0.0 (High-Performance Engine)",
        "data_engine": "Polars Lazy API (Multi-threaded Rust)",
        "ui_framework": "Streamlit + Taipy Hybrid UI",
        "visualization_engine": "Plotly SVG/WebGL Client Pre-configured",
        "excel_engine": "Polars fastexcel / calamine",
        "status": "Operational & High-Speed"
    }

def render_settings_page():
    """Render Settings & System Configuration Page."""
    st.markdown("<h1 style='color: #F8FAFC; font-weight: 700;'>⚙️ Pengaturan & Konfigurasi Sistem</h1>", unsafe_allow_html=True)
    st.caption("Manajemen akun eksekutif, status keamanan, dan pembersihan cache data.")
    st.write("---")

    col_set1, col_set2 = st.columns(2)

    with col_set1:
        st.markdown("### 👤 Profil Pengguna (User Account)")
        st.info("""
        **Pengguna Aktif:** `admin`  
        **Peran:** Administrator Utama SAPA Yanfaskes  
        **Status Sesi:** Terautentikasi (SSO BPJS Style)
        """)
        
        st.markdown("### 🧹 Manajemen Cache & Memori")
        st.write("Bersihkan memori cache jika data terbaru tidak muncul atau setelah memperbarui file Google Sheets.")
        
        if st.button("🔄 Bersihkan Cache Data Sekarang", use_container_width=True):
            st.cache_data.clear()
            st.cache_resource.clear()
            st.success("✅ Cache data & resource berhasil dibersihkan sepenuhnya!")

    with col_set2:
        st.markdown("### 🛡️ Informasi Sistem & Keamanan")
        st.success("""
        **Versi Aplikasi:** `v3.0.0-BI High-Performance`  
        **Mesin Data:** Polars Lazy API (Rust Multi-threaded)  
        **Mesin Visualisasi:** Plotly SVG/WebGL Client Engine  
        **Status Koneksi:** Online & Operational
        """)
        
        st.markdown("### 🚪 Keluar dari Sistem")
        st.write("Akhiri sesi kerja Anda dan kembali ke halaman login SSO.")
        if st.button("🚪 Logout dari SAPA YANFASKES", use_container_width=True, key="btn_settings_logout"):
            logout()
