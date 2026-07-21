import streamlit as st
from modules.auth import logout

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
        **Versi Aplikasi:** `v2.5.0-BI Modular`  
        **Mesin Visualisasi:** PyGWalker Streamlit Engine  
        **Proteksi Keamanan:** CORS & XSRF Protection Activated  
        **Status Koneksi:** Online & Operational
        """)
        
        st.markdown("### 🚪 Keluar dari Sistem")
        st.write("Akhiri sesi kerja Anda dan kembali ke halaman login SSO.")
        if st.button("🚪 Logout dari SAPA YANFASKES", use_container_width=True, key="btn_settings_logout"):
            logout()
