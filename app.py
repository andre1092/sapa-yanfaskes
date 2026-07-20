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

# 2. DATA ENGINE (DuckDB & Intelligent Join Layer)
@st.cache_data(show_spinner="Menyelaraskan & Menggabungkan Lembar Kerja...")
def load_and_merge_sheets(spreadsheet_id):
    try:
        # Mengunduh kedua sheet secara spesifik menggunakan parameter gviz ekspor
        url_faskes = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_FASKES"
        url_antrol = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_LAP_ANTROL_FKRTL"
        
        df_faskes = pd.read_csv(url_faskes)
        df_antrol = pd.read_csv(url_antrol)
        
        # Normalisasi nama kolom untuk pencarian kunci (menghilangkan spasi, huruf kecil, dan garis bawah)
        cols_faskes = {col.strip().lower().replace("_", "").replace(" ", ""): col for col in df_faskes.columns}
        cols_antrol = {col.strip().lower().replace("_", "").replace(" ", ""): col for col in df_antrol.columns}
        
        # Temukan kecocokan kolom kunci penghubung secara otomatis
        common_keys = set(cols_faskes.keys()).intersection(set(cols_antrol.keys()))
        
        if common_keys:
            # Gunakan kunci pertama yang cocok (misalnya 'kodefaskes' atau 'kodeppk')
            matched_key = list(common_keys)[0]
            key_faskes = cols_faskes[matched_key]
            key_antrol = cols_antrol[matched_key]
            
            # Melakukan LEFT JOIN menggunakan Pandas (mengamankan baris laporan agar tidak hilang)
            merged_df = pd.merge(
                df_antrol, 
                df_faskes, 
                left_on=key_antrol, 
                right_on=key_faskes, 
                how="left", 
                suffixes=("", "_master")
            )
            
            # Hapus duplikasi kolom kunci jika nama literalnya sedikit berbeda
            if key_faskes != key_antrol:
                merged_df = merged_df.drop(columns=[key_faskes])
            
            status_msg = f"Berhasil menggabungkan otomatis berdasarkan kolom kunci: '{key_antrol}'"
        else:
            # Fallback jika tidak ada kolom kunci yang cocok
            merged_df = df_antrol
            status_msg = "Peringatan: Tidak ditemukan kolom kunci yang cocok. Menampilkan data DB_LAP_ANTROL_FKRTL saja."
            
        # Masukkan data hasil gabungan ke DuckDB in-memory untuk performa analitik tinggi
        con = duckdb.connect(database=':memory:')
        con.register('merged_table', merged_df)
        optimized_df = con.execute("SELECT * FROM merged_table").fetchdf()
        con.close()
        
        return optimized_df, status_msg
        
    except Exception as e:
        st.sidebar.error(f"Gagal memproses spreadsheet: {e}")
        return None, None

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
info_msg = ""

if input_method == "Gabung Otomatis (2 Sheets)":
    sheet_url = st.sidebar.text_input(
        "Masukkan URL Google Sheets:",
        placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
    )
    if sheet_url:
        # Ekstraksi ID Spreadsheet secara aman menggunakan Regex
        match = re.search(r"/d/([a-zA-Z0-9-_]+)", sheet_url)
        if match:
            ss_id = match.group(1)
            df_active, info_msg = load_and_merge_sheets(ss_id)
        else:
            st.sidebar.warning("Format URL Google Sheets tidak dikenali.")
else:
    uploaded_file = st.sidebar.file_uploader(
        "Unggah File CSV atau Excel:", 
        type=["csv", "xlsx", "xls"]
    )
    if uploaded_file is not None:
        df_active = load_single_data(uploaded_file)
        info_msg = f"Berhasil memuat file lokal: {uploaded_file.name}"

# 4. VISUALIZATION CORE (Tableau Layer via PyGWalker)
if df_active is not None:
    st.sidebar.success(f"Data Siap! ({df_active.shape[0]} baris, {df_active.shape[1]} kolom)")
    if info_msg:
        st.sidebar.info(info_msg)
    
    # Render Tableau drag-and-drop workspace
    renderer = StreamlitRenderer(
        df_active, 
        spec_path="gw_config.json", 
        spec_io_mode="rw",
        appearance="dark"
    )
    renderer.explorer()
else:
    # Tampilan Panduan Pengguna saat aplikasi pertama kali dimuat
    st.info("💡 Selamat datang di SAPA YANFASKES. Silakan muat data Anda untuk memulai analisis.")
    st.markdown("""
    ### Panduan Penggabungan Otomatis 2 Sheets:
    1. **Persiapkan Hak Akses**: Pastikan Google Sheets Anda telah diatur ke **"Anyone with the link can view"**.
    2. **Tempelkan Tautan**: Masukkan URL Google Sheets Anda di panel sebelah kiri.
    3. **Deteksi Otomatis**: Sistem akan mengunduh tab **`DB_FASKES`** dan **`DB_LAP_ANTROL_FKRTL`** secara mandiri, lalu mencari kolom pengenal yang sama (seperti *Kode Faskes*) untuk digabungkan secara *Left Join*.
    4. **Mulai Desain Dashboard**: Tarik dimensi dari tabel gabungan ke area grafik untuk mulai menganalisis kinerja antrean berdasarkan data profil faskes lengkap Anda.
    """)