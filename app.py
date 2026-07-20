import streamlit as st
import pandas as pd
import duckdb
import re
import os
from pygwalker.api.streamlit import StreamlitRenderer

# --- 1. CONFIGURATION & FILE WATCHER FIX ---
def ensure_streamlit_config():
    config_dir = ".streamlit"
    config_file = os.path.join(config_dir, "config.toml")
    if not os.path.exists(config_dir):
        os.makedirs(config_dir)
        
    config_content = """[server]
fileWatcherType = "none"
"""
    if not os.path.exists(config_file):
        with open(config_file, "w") as f:
            f.write(config_content)
    else:
        with open(config_file, "r") as f:
            content = f.read()
        if 'fileWatcherType = "none"' not in content:
            with open(config_file, "a") as f:
                f.write("\nfileWatcherType = \"none\"\n")

ensure_streamlit_config()

st.set_page_config(
    page_title="SAPA YANFASKES",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Suntikan CSS untuk membuang margin bawaan Streamlit
st.markdown("""
<style>
    .block-container {
        padding-top: 1rem !important;
        padding-bottom: 0rem !important;
        padding-left: 1.5rem !important;
        padding-right: 1.5rem !important;
        max-width: 100% !important;
    }
    iframe {
        height: 850px !important;
        border-radius: 8px;
    }
</style>
""", unsafe_allow_html=True)

hide_style = """
<style>
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
header {visibility: hidden;}
</style>
"""
st.markdown(hide_style, unsafe_allow_html=True)

# --- 2. DATA ENGINE (DuckDB & Custom Join Layer) ---
@st.cache_data(show_spinner="Mengunduh lembar kerja dari Google Sheets...")
def load_raw_sheets(spreadsheet_id):
    try:
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
        merged_df = pd.merge(
            df_antrol, 
            df_faskes, 
            left_on=key_antrol, 
            right_on=key_faskes, 
            how="left", 
            suffixes=("", "_master")
        )
        
        if key_faskes != key_antrol and key_faskes in merged_df.columns:
            merged_df = merged_df.drop(columns=[key_faskes])
            
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

# --- 3. OPTIMIZED CACHED RENDERER RESOURCE ---
# Menggunakan awalan nama argumen '_df' (leading underscore) agar Streamlit 
# mengabaikan proses komputasi hashing tabel data demi performa tanpa lag.
@st.cache_resource
def get_pyg_renderer(_df, cache_key: str) -> StreamlitRenderer:
    return StreamlitRenderer(
        _df, 
        spec_path="gw_config.json", 
        spec_io_mode="rw",
        appearance="dark"
    )

# --- 4. UI SIDEBAR ---
st.sidebar.markdown("# SAPA YANFASKES")
st.sidebar.caption("Saluran Analisis Performa & Akselerasi")
st.sidebar.write("---")

input_method = st.sidebar.radio(
    "Metode Input Data:", 
    ["Gabung Otomatis (2 Sheets)", "Unggah File Lokal Tunggal"]
)

df_active = None
active_cache_key = ""

if input_method == "Gabung Otomatis (2 Sheets)":
    sheet_url = st.sidebar.text_input(
        "Masukkan URL Google Sheets:",
        placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
    )
    if sheet_url:
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_url)
        if match:
            ss_id = match.group(1)
            df_faskes, df_antrol = load_raw_sheets(ss_id)
            
            if df_faskes is not None and df_antrol is not None:
                st.sidebar.markdown("### 🛠️ Pengaturan Hubungan Tabel")
                
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
                    "Kunci Hubung DB_LAP_ANTROL_FKRTL (Fakta):",
                    options=antrol_cols,
                    index=default_antrol_idx
                )
                
                key_faskes = st.sidebar.selectbox(
                    "Kunci Hubung DB_FASKES (Master):",
                    options=faskes_cols,
                    index=default_faskes_idx
                )
                
                df_active = merge_data_with_keys(df_antrol, df_faskes, key_antrol, key_faskes)
                active_cache_key = f"g_sheets_{ss_id}_{key_antrol}_{key_faskes}"
        else:
            st.sidebar.warning("Format URL Google Sheets tidak dikenali.")
else:
    uploaded_file = st.sidebar.file_uploader(
        "Unggah File CSV atau Excel:", 
        type=["csv", "xlsx", "xls"]
    )
    if uploaded_file is not None:
        df_active = load_single_data(uploaded_file)
        active_cache_key = f"local_{uploaded_file.name}_{df_active.shape[0]}"

# --- 5. VISUALIZATION CORE ---
if df_active is not None:
    st.sidebar.success(f"Data Siap! ({df_active.shape[0]} baris)")
    
    # Memanggil renderer teroptimasi
    renderer = get_pyg_renderer(df_active, active_cache_key)
    renderer.explorer()
else:
    st.info("💡 Selamat datang di SAPA YANFASKES. Silakan muat data Anda untuk memulai analisis.")
    st.markdown("""
    ### Panduan Eksplorasi Visual:
    1. **Muat Data Anda** menggunakan menu penggabungan di panel kiri.
    2. **Tipe Visualisasi Lengkap**: Setelah data muncul, ganti menu **`Mark Type`** di workspace dari *Auto/Bar* menjadi:
       - **`Table` / `Pivot Table`** untuk membuat tabel silang (*cross-tab*).
       - **`Arc`** untuk membuat Diagram Lingkaran (*Pie Chart*) atau Donut Chart.
       - **`Area`**, **`Scatter`**, atau **`Treemap`** untuk analisis tren dan distribusi.
    3. **Multi-Sheet**: Klik tombol **`+`** di bagian atas workspace untuk menambah lembar kerja analisis baru tanpa menumpuk pekerjaan Anda sebelumnya.
    """)