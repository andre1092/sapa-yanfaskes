import streamlit as st
import pandas as pd
import duckdb
import re
from pygwalker.api.streamlit import StreamlitRenderer

# 1. CONFIGURATION
st.set_page_config(
    page_title="SAPA YANFASKES",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Sembunyikan default Streamlit menu & footer untuk tampilan professional
hide_style = """
<style>
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
header {visibility: hidden;}
</style>
"""
st.markdown(hide_style, unsafe_allow_html=True)

# 2. DATA ENGINE (DuckDB & Custom Join Layer)
@st.cache_data(show_spinner="Mengunduh lembar kerja dari Google Sheets...")
def load_raw_sheets(spreadsheet_id):
    try:
        # Mengunduh kedua sheet secara independen
        url_faskes = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_FASKES"
        url_antrol = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_LAP_ANTROL_FKRTL"
        
        df_faskes = pd.read_csv(url_faskes)
        df_antrol = pd.read_csv(url_antrol)
        return df_faskes, df_antrol
    except Exception as e:
        st.sidebar.error(f"Gagal mengunduh spreadsheet: {e}")
        return None, None

@st.cache_data(show_spinner="Menggabungkan data dengan DuckDB...")
def merge_data_with_keys(df_antrol, df_faskes, key_antrol, key_faskes):
    try:
        # Lakukan LEFT JOIN berdasarkan kunci pilihan user
        merged_df = pd.merge(
            df_antrol, 
            df_faskes, 
            left_on=key_antrol, 
            right_on=key_faskes, 
            how="left", 
            suffixes=("", "_master")
        )
        
        # Hapus kolom duplikat jika nama kolom kunci tidak sama persis secara literal
        if key_faskes != key_antrol and key_faskes in merged_df.columns:
            merged_df = merged_df.drop(columns=[key_faskes])
            
        # Optimasi performa query tabel gabungan via DuckDB
        con = duckdb.connect(database=':memory:')
        con.register('merged_table', merged_df)
        optimized_df = con.execute("SELECT * FROM merged_table").fetchdf()
        con.close()
        return optimized_df
    except Exception as e:
        st.sidebar.error(f"Gagal melakukan penggabungan: {e}")
        return None

@st.cache_data(show_spinner="Sedang memproses file tunggal...")
def load_single_data(source):
    try:
        if source.name.endswith('.csv'):
            df = pd.read_csv(source)
        elif source.name.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(source)
        else:
            return None
        
        con = duckdb.connect(database=':memory:')
        con.register('single_table', df)
        optimized_df = con.execute("SELECT * FROM single_table").fetchdf()
        con.close()
        return optimized_df
    except Exception as e:
        st.sidebar.error(f"Gagal membaca file: {e}")
        return None

# 3. UI SIDEBAR
st.sidebar.markdown("# SAPA YANFASKES")
st.sidebar.caption("Saluran Analisis Performa & Akselerasi")
st.sidebar.write("---")

input_method = st.sidebar.radio(
    "Metode Input Data:", 
    ["Gabung Otomatis (2 Sheets)", "Unggah File Lokal Tunggal"]
)

df_active = None

if input_method == "Gabung Otomatis (2 Sheets)":
    sheet_url = st.sidebar.text_input(
        "Masukkan URL Google Sheets:",
        placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
    )
    if sheet_url:
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_url)
        if match:
            ss_id = match.group(1)
            # Muat lembar kerja mentah terlebih dahulu
            df_faskes, df_antrol = load_raw_sheets(ss_id)
            
            if df_faskes is not None and df_antrol is not None:
                st.sidebar.markdown("### 🛠️ Pengaturan Hubungan Tabel")
                
                # Coba tebak index kolom default untuk kenyamanan user
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

                # Tampilkan Dropdown untuk memilih kolom kunci
                key_antrol = st.sidebar.selectbox(
                    "Kunci Hubung DB_LAP_ANTROL_FKRTL (Fakta):",
                    options=antrol_cols,
                    index=default_antrol_idx
                )
                
                key_faskes = st.sidebar.selectbox(
                    "Kunci Hubung DB_FASKES (Master):",
                    options=faskes_cols,
                    index=default_faskes_idx
                )
                
                # Eksekusi penggabungan berdasarkan pilihan user
                df_active = merge_data_with_keys(df_antrol, df_faskes, key_antrol, key_faskes)
        else:
            st.sidebar.warning("Format URL Google Sheets tidak dikenali.")
else:
    uploaded_file = st.sidebar.file_uploader(
        "Unggah File CSV atau Excel:", 
        type=["csv", "xlsx", "xls"]
    )
    if uploaded_file is not None:
        df_active = load_single_data(uploaded_file)

# 4. VISUALIZATION CORE (Tableau Layer via PyGWalker)
if df_active is not None:
    st.sidebar.success(f"Data Siap! ({df_active.shape[0]} baris, {df_active.shape[1]} kolom)")
    
    renderer = StreamlitRenderer(
        df_active, 
        spec_path="gw_config.json", 
        spec_io_mode="rw",
        appearance="dark"
    )
    renderer.explorer()
else:
    st.info("💡 Selamat datang di SAPA YANFASKES. Silakan muat data Anda untuk memulai analisis.")
    st.markdown("""
    ### Panduan Penggabungan Manual 2 Sheets:
    1. **Masukkan Tautan**: Tempelkan URL Google Sheets Anda di panel kiri.
    2. **Tentukan Hubungan Tabel**: Sistem akan memuat nama kolom dari kedua lembar kerja.
    3. **Pilih Kunci Hubung**: 
       - Pilih kolom kunci dari **Tabel Laporan (Fakta)** (misal: `Kdppk`).
       - Pilih kolom kunci yang berpasangan dari **Tabel Master** (misal: `Kode Faskes` atau `KODEPPK`).
    4. **Analisis Data**: Setelah kolom dipilih, sistem akan menggabungkan data Anda secara instan dan memuat workspace analisis visual.
    """)