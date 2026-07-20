import streamlit as st
import pandas as pd
import duckdb
import re
import os
from datetime import datetime
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

# --- 2. SELF-HEALING DATA CLEANING & DATE PARSING LAYER ---
def clean_dataframe_dtypes(df):
    for col in df.columns:
        # 1. Konversi Kolom Tanggal/Waktu secara Eksplisit (Sangat Penting untuk Hirarki Tableau)
        if col.strip().lower() in ['timestamp', 'tanggal', 'date', 'waktu']:
            try:
                df[col] = pd.to_datetime(df[col], errors='coerce')
                continue
            except:
                pass
                
        if df[col].dtype == 'object':
            sample = df[col].dropna().astype(str).str.strip()
            if sample.empty:
                continue
            
            # Cek jika kolom kualitatif berisi tanggal berpola (misal: YYYY-MM-DD atau M/D/YYYY)
            if sample.str.contains(r'\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4}').any():
                try:
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                    continue
                except:
                    pass
            
            # 2. Deteksi Persentase (misal: "85%")
            if sample.str.contains('%').any():
                temp = df[col].astype(str).str.replace('%', '', regex=False).str.replace(',', '.', regex=False).str.strip()
                converted = pd.to_numeric(temp, errors='coerce') / 100.0
                df[col] = converted
                continue
            
            # 3. Deteksi Angka Format Desimal Indonesia (misal: "0,85")
            temp_numeric = df[col].astype(str).str.strip()
            if temp_numeric.str.contains(r'\d+,\d+').any():
                temp_numeric = temp_numeric.str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
            else:
                temp_numeric = temp_numeric.str.replace(',', '.', regex=False)
                
            converted = pd.to_numeric(temp_numeric, errors='coerce')
            
            original_non_na = int(pd.notna(df[col]).sum())
            converted_non_na = int(pd.notna(converted).sum())
            
            if original_non_na > 0 and (converted_non_na / original_non_na) >= 0.5:
                df[col] = converted
                
    return df

# --- 3. DATA ENGINE (DuckDB & Custom Join Layer) ---
@st.cache_data(show_spinner="Mengunduh data...")
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

@st.cache_data(show_spinner="Menggabungkan data...")
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
            
        merged_df = clean_dataframe_dtypes(merged_df)
            
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
            
        df = clean_dataframe_dtypes(df)
        
        con = duckdb.connect(database=':memory:')
        con.register('single_table', df)
        optimized_df = con.execute("SELECT * FROM single_table").fetchdf()
        con.close()
        return optimized_df
    except Exception as e:
        st.sidebar.error(f"Gagal membaca file: {e}")
        return None

# --- 4. OPTIMIZED CACHED RENDERER RESOURCE ---
@st.cache_resource
def get_pyg_renderer(_df, cache_key: str) -> StreamlitRenderer:
    return StreamlitRenderer(
        _df, 
        spec_path="gw_config.json", 
        spec_io_mode="rw",
        appearance="dark"
    )

# --- 5. UI SIDEBAR (KONTROL UTAMA & MODE) ---
st.sidebar.markdown("# SAPA YANFASKES")
st.sidebar.caption("Saluran Analioris Performa & Akselerasi")
st.sidebar.write("---")

app_mode = st.sidebar.radio(
    "Pilih Mode Aplikasi:",
    ["📊 Published Dashboard", "🛠️ Developer (Edit/Design)"]
)

st.sidebar.write("---")

input_method = st.sidebar.radio(
    "Metode Input Data:", 
    ["Gabung Otomatis (2 Sheets)", "Unggah File Lokal Tunggal"]
)

df_raw = None
base_cache_key = ""

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
            st.sidebar.warning("Format URL Google Sheets tidak dikenali.")
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

# --- 6. RENDER KANVAS DASHBOARD ---
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
        st.markdown("<h1 style='text-align: center; color: white;'>Pemanfaatan Sistem Antrean Online FKRTL</h1>", unsafe_allow_html=True)
        st.write("---")
        
        dashboard_col1, dashboard_col2 = st.columns([1, 4])
        
        with dashboard_col1:
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            st.markdown(f"<span style='color: #E25858; font-style: italic; font-size: 13px;'>Last Update: {current_time}</span>", unsafe_allow_html=True)
            st.write("")
            
            filtered_df = df_raw.copy()
            filter_states = {}
            
            # A. TABLEAU-STYLE DATE FILTER BUILDER (Tanpa menggunakan aksesor .dt agar bebas eror Pyrefly)
            datetime_cols = df_raw.select_dtypes(include=['datetime64[ns]']).columns.tolist()
            if datetime_cols:
                date_col = datetime_cols[0]
                
                st.markdown(f"#### 📅 Date Filter Configuration")
                date_filter_type = st.selectbox(
                    f"How do you want to filter on '{date_col}'?",
                    ["Month / Year", "Range of Dates", "Years", "Individual Dates"],
                    key=f"date_filter_type_{date_col}"
                )
                
                if date_filter_type == "Month / Year":
                    # Ekstraksi urutan kronologis yang aman secara tipe data statis
                    sorted_unique_dates = sorted(df_raw[date_col].dropna().unique())
                    options = []
                    for d in sorted_unique_dates:
                        fmt_val = pd.Timestamp(d).strftime('%b %Y')
                        if fmt_val not in options:
                            options.append(fmt_val)
                    
                    selected_my = st.multiselect(
                        f"Month, Year of {date_col}",
                        options=options,
                        default=[],
                        key=f"selected_my_{date_col}"
                    )
                    if selected_my:
                        # Filter baris demi baris menggunakan Timestamp conversion murni
                        is_my_matched = [
                            pd.Timestamp(x).strftime('%b %Y') in selected_my if pd.notna(x) else False 
                            for x in filtered_df[date_col]
                        ]
                        filtered_df = filtered_df[is_my_matched]
                        filter_states[f"{date_col}_MY"] = selected_my
                        
                elif date_filter_type == "Range of Dates":
                    # Konversi ke pd.Timestamp secara eksplisit agar dikenali linter
                    min_ts = pd.Timestamp(df_raw[date_col].dropna().min())
                    max_ts = pd.Timestamp(df_raw[date_col].dropna().max())
                    min_date = min_ts.date()
                    max_date = max_ts.date()
                    
                    selected_range = st.slider(
                        f"Range of Dates",
                        min_value=min_date,
                        max_value=max_date,
                        value=(min_date, max_date),
                        format="YYYY-MM-DD",
                        key=f"selected_range_{date_col}"
                    )
                    # Filter rentang tanggal secara aman menggunakan list comprehension murni
                    in_range = [
                        selected_range[0] <= pd.Timestamp(x).date() <= selected_range[1] if pd.notna(x) else False 
                        for x in filtered_df[date_col]
                    ]
                    filtered_df = filtered_df[in_range]
                    filter_states[f"{date_col}_range"] = [selected_range[0].strftime("%Y-%m-%d"), selected_range[1].strftime("%Y-%m-%d")]
                    
                elif date_filter_type == "Years":
                    # Ekstraksi tahun secara aman tanpa menggunakan .dt.year
                    years_set = {pd.Timestamp(x).year for x in df_raw[date_col] if pd.notna(x)}
                    options = sorted(list(years_set))
                    
                    selected_years = st.multiselect(
                        f"Years of {date_col}",
                        options=options,
                        default=[],
                        key=f"selected_years_{date_col}"
                    )
                    if selected_years:
                        # Saring tahun secara aman
                        is_year_matched = [
                            pd.Timestamp(x).year in selected_years if pd.notna(x) else False 
                            for x in filtered_df[date_col]
                        ]
                        filtered_df = filtered_df[is_year_matched]
                        filter_states[f"{date_col}_years"] = selected_years
                        
                elif date_filter_type == "Individual Dates":
                    # Ekstraksi tanggal spesifik murni
                    dates_set = {pd.Timestamp(x).strftime("%Y-%m-%d") for x in df_raw[date_col] if pd.notna(x)}
                    options = sorted(list(dates_set))
                    
                    selected_dates = st.multiselect(
                        f"Individual Dates of {date_col}",
                        options=options,
                        default=[],
                        key=f"selected_dates_{date_col}"
                    )
                    if selected_dates:
                        # Saring tanggal murni secara eksplisit
                        is_date_matched = [
                            pd.Timestamp(x).strftime("%Y-%m-%d") in selected_dates if pd.notna(x) else False 
                            for x in filtered_df[date_col]
                        ]
                        filtered_df = filtered_df[is_date_matched]
                        filter_states[f"{date_col}_dates"] = selected_dates
            
            st.write("---")
            
            # B. STANDARD CATEGORICAL FILTERS (Kategori non-tanggal)
            for col in active_filters:
                unique_vals = sorted(df_raw[col].dropna().unique().tolist())
                selected = st.multiselect(
                    f"{col}",
                    options=unique_vals,
                    default=[],
                    key=f"dashboard_filter_{col}"
                )
                if selected:
                    filtered_df = filtered_df[filtered_df[col].isin(selected)]
                    filter_states[col] = selected
            
            st.write("---")
            
            # C. DYNAMIC KPI CARD
            if 'Capaian' in filtered_df.columns:
                avg_capaian = float(filtered_df['Capaian'].mean() * 100)
                if pd.isna(avg_capaian):
                    kpi_display = "0.00%"
                else:
                    kpi_display = f"{avg_capaian:.2f}%"
            else:
                kpi_display = "N/A"
                
            st.markdown(f"""
            <div style="background-color: #4B79A1; padding: 20px; border-radius: 4px; text-align: center; color: white; border: 1px solid #555; box-shadow: 2px 2px 10px rgba(0,0,0,0.5);">
                <div style="font-size: 18px; font-weight: bold;">Pemanfaatan</div>
                <div style="font-size: 11px; font-style: italic; opacity: 0.8; margin-bottom: 12px;">Periode Juli 2026</div>
                <div style="font-size: 38px; font-weight: 800; letter-spacing: 0.5px;">{kpi_display}</div>
            </div>
            """, unsafe_allow_html=True)

        with dashboard_col2:
            filter_suffix = "_".join([f"{k}:{v}" for k, v in filter_states.items()]) if filter_states else "unfiltered"
            active_cache_key = f"{base_cache_key}_dashboard_{filter_suffix}"
            
            renderer = get_pyg_renderer(filtered_df, active_cache_key)
            renderer.viewer()
            
    else:
        st.sidebar.warning(
            "💡 **Mode Developer Hack:** Silakan buat lembar kerja (Sheet) baru, drag-and-drop kolom, "
            "dan pastikan untuk mengklik ikon **Simpan (Disket)** sebelum beralih ke Mode Published Dashboard."
        )
        
        active_cache_key = f"{base_cache_key}_developer_mode"
        renderer = get_pyg_renderer(df_raw, active_cache_key)
        renderer.explorer()

else:
    st.info("💡 Selamat datang di SAPA YANFASKES. Silakan muat data Anda untuk memulai analisis.")
    st.markdown("""
    ### Langkah Menampilkan Dashboard Interaktif:
    1. **Muat Data**: Masukkan link Google Sheets Anda di panel sebelah kiri.
    2. **Desain Grafik (Mode Developer)**: Pilih mode *Developer* di sidebar untuk mulai mendesain grafik Anda melalui seret-lepas kolom.
    3. **Simpan Hasil Desain**: Klik tombol Simpan (Disket) di dalam workspace.
    4. **Publikasikan**: Alihkan pilihan di sidebar ke **`Published Dashboard`** untuk melihat dashboard bersih dengan kartu KPI dinamis dan filter cepat yang berjejer rapi di badan halaman.
    """)