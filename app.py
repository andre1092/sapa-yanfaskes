import streamlit as st
import pandas as pd
import duckdb
from pygwalker.api.streamlit import StreamlitRenderer

# 1. CONFIGURATION
st.set_page_config(
    page_title="SAPA YANFASKES",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Menonaktifkan default menu dan footer Streamlit
hide_style = """
<style>
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
header {visibility: hidden;}
</style>
"""
st.markdown(hide_style, unsafe_allow_html=True)

# 2. DATA ENGINE (DuckDB In-Memory Layer)
@st.cache_data(show_spinner="Sedang mengoptimalkan data menggunakan DuckDB...")
def load_data(source, is_url=False):
    try:
        if is_url:
            df = pd.read_csv(source)
        else:
            if source.name.endswith('.csv'):
                df = pd.read_csv(source)
            elif source.name.endswith(('.xls', '.xlsx')):
                df = pd.read_excel(source)
            else:
                return None
        
        con = duckdb.connect(database=':memory:')
        con.register('raw_data', df)
        optimized_df = con.execute("SELECT * FROM raw_data").fetchdf()
        con.close()
        return optimized_df
    except Exception as e:
        st.sidebar.error(f"Gagal memuat data: {e}")
        return None

# 3. UI SIDEBAR
st.sidebar.markdown("# SAPA YANFASKES")
st.sidebar.caption("Saluran Analisis Performa & Akselerasi")
st.sidebar.write("---")

input_method = st.sidebar.radio(
    "Metode Input Data:", 
    ["Google Sheets Link", "Unggah Berkas Lokal"]
)

df_active = None

if input_method == "Google Sheets Link":
    sheet_url = st.sidebar.text_input(
        "Masukkan URL Google Sheets (Akses: Anyone with link):",
        placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
    )
    if sheet_url:
        if "/edit" in sheet_url:
            export_url = sheet_url.split("/edit")[0] + "/export?format=csv"
            df_active = load_data(export_url, is_url=True)
        else:
            st.sidebar.warning("Format URL Google Sheets tidak valid. Pastikan terdapat '/edit' pada URL.")
else:
    uploaded_file = st.sidebar.file_uploader(
        "Unggah File CSV atau Excel:", 
        type=["csv", "xlsx", "xls"]
    )
    if uploaded_file is not None:
        df_active = load_data(uploaded_file, is_url=False)

# 4. VISUALIZATION CORE (Tableau Layer via PyGWalker)
if df_active is not None:
    st.sidebar.success(f"Data Berhasil Dimuat! ({df_active.shape[0]} baris)")
    
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
    ### Panduan Penggunaan Antarmuka:
    1. **Hubungkan Data**: Gunakan panel kiri untuk memasukkan tautan Google Sheets Anda atau mengunggah berkas lokal.
    2. **Eksplorasi Dimensi & Ukuran**: Kolom kategori akan masuk ke bagian *Dimensions*, dan kolom angka akan masuk ke bagian *Measures* secara otomatis.
    3. **Drag & Drop**: Tarik field ke rak **Rows** dan **Columns** untuk mulai menggambar grafik.
    4. **Simpan Konfigurasi**: Klik tombol simpan (ikon disket) di dalam antarmuka visualisasi untuk menyimpan konfigurasi grafik Anda ke dalam berkas `gw_config.json`.
    """)
