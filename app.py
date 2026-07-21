import streamlit as st
import re
from modules.data_processor import (
    ensure_streamlit_config,
    ensure_gw_config,
    load_raw_sheets,
    merge_data_with_keys,
    load_single_data
)
from modules.auth import check_authentication, logout
from modules.theme import inject_glassmorphism_theme
from modules.dashboard import render_published_dashboard, render_developer_mode
from modules.settings import render_settings_page

# --- 1. SYSTEM CONFIGURATION ---
ensure_streamlit_config()
ensure_gw_config()

st.set_page_config(
    page_title="SAPA YANFASKES",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- 2. AUTHENTICATION GATE ---
check_authentication()

# --- 3. GLASSMORPHISM THEME & SIDEBAR ENGINE ---
inject_glassmorphism_theme()

# --- 4. SIDEBAR CONTROLS & NAVIGATION ---
st.sidebar.markdown("## 🏥 SAPA YANFASKES")
st.sidebar.caption("Saluran Analisis Performa & Akselerasi")
st.sidebar.write("---")

nav_selection = st.sidebar.radio(
    "📍 Navigasi Utama:",
    ["🏠 Home", "⚙️ Setting"],
    key="main_nav_selector"
)
st.sidebar.write("---")

df_raw = None
base_cache_key = ""
app_mode = "📊 Published Dashboard"

if nav_selection == "🏠 Home":
    app_mode = st.sidebar.radio(
        "Pilih Mode Aplikasi:",
        ["📊 Published Dashboard", "🛠️ Developer (Edit/Design)"]
    )

    st.sidebar.write("---")

    input_method = st.sidebar.radio(
        "Metode Input Data:", 
        ["Gabung Otomatis (2 Sheets)", "Unggah File Lokal Tunggal"]
    )

    if input_method == "Gabung Otomatis (2 Sheets)":
        sheet_url = st.sidebar.text_input(
            "Masukkan URL Google Sheets:",
            placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
        )
        if sheet_url:
            if 'docs.google.com/spreadsheets' not in sheet_url:
                st.sidebar.warning("URL yang dimasukkan bukan URL Google Sheets yang valid.")
            else:
                match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_url)
                if match:
                    ss_id = match.group(1)
                    df_faskes, df_antrol = load_raw_sheets(ss_id)
                    
                    if df_faskes is not None and df_antrol is not None:
                        st.sidebar.markdown("### 🛠️ Hubungan Tabel")
                        antrol_cols = list(df_antrol.columns)
                        faskes_cols = list(df_faskes.columns)
                        
                        default_antrol_idx = 0
                        for i, col in enumerate(antrol_cols):
                            if col.strip().lower() in ['kdppk', 'kode faskes', 'kodeppk', 'kode_ppk', 'kode_faskes']:
                                default_antrol_idx = i
                                break
                        
                        default_faskes_idx = 0
                        for i, col in enumerate(faskes_cols):
                            if col.strip().lower() in ['kdppk', 'kode faskes', 'kodeppk', 'kode_ppk', 'kode_faskes', 'kodeppk_master']:
                                default_faskes_idx = i
                                break

                        key_antrol = st.sidebar.selectbox(
                            "Kunci Hubung (Fakta):", options=antrol_cols, index=default_antrol_idx
                        )
                        key_faskes = st.sidebar.selectbox(
                            "Kunci Hubung (Master):", options=faskes_cols, index=default_faskes_idx
                        )
                        
                        df_raw = merge_data_with_keys(df_antrol, df_faskes, key_antrol, key_faskes)
                        base_cache_key = f"g_sheets_{ss_id}_{key_antrol}_{key_faskes}"
                else:
                    st.sidebar.warning("Format URL Google Sheets tidak dikenali. Pastikan URL mengandung '/d/' diikuti ID spreadsheet.")
    else:
        uploaded_file = st.sidebar.file_uploader(
            "Unggah File CSV atau Excel:", 
            type=["csv", "xlsx", "xls"]
        )
        if uploaded_file is not None:
            df_single = load_single_data(uploaded_file)
            if df_single is not None:
                df_raw = df_single
                base_cache_key = f"local_{uploaded_file.name}_{df_raw.shape[0]}"

# Sidebar Logout Action Button
st.sidebar.write("---")
if st.sidebar.button("🚪 Logout", use_container_width=True, key="btn_sidebar_logout_action"):
    logout()

# --- 5. MAIN CONTENT ROUTER ---
if nav_selection == "🏠 Home":
    if df_raw is not None:
        potential_filters = ['Kabupaten', 'Kepemilikan', 'Cabang', 'Kelas_RS', 'Sumber', 'Sourcedata']
        active_filters = [col for col in potential_filters if col in df_raw.columns]
        
        if not active_filters:
            for col in df_raw.columns:
                if df_raw[col].dtype == 'object' and 1 < df_raw[col].nunique() < 40:
                    active_filters.append(col)
                    if len(active_filters) >= 3:
                        break

        if app_mode == "📊 Published Dashboard":
            render_published_dashboard(df_raw, base_cache_key, active_filters)
        else:
            render_developer_mode(df_raw, base_cache_key)
    else:
        st.info("💡 Selamat datang di **SAPA YANFASKES**. Silakan muat data Anda untuk memulai analisis.")
        st.markdown("""
        ### Langkah Menampilkan Dashboard Interaktif:
        1. **Buka Menu Sidebar**: Klik tombol garistiga atau navigasi di pojok kiri atas untuk membuka panel navigasi.
        2. **Muat Data**: Masukkan link Google Sheets Anda atau unggah file lokal di menu **🏠 Home**.
        3. **Desain Grafik (Mode Developer)**: Pilih mode *Developer* di sidebar untuk mulai mendesain grafik Anda melalui seret-lepas kolom.
        4. **Simpan Hasil Desain**: Klik tombol Simpan (Disket) di dalam workspace.
        5. **Publikasikan**: Alihkan pilihan di sidebar ke `Published Dashboard` untuk melihat dashboard bersih dengan kartu KPI dinamik dan filter cepat yang berjejer rapi di badan halaman.
        """)

elif nav_selection == "⚙️ Setting":
    render_settings_page()