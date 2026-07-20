import streamlit as st
import pandas as pd
import re
import os
import html as html_module
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
            # Pastikan ada section [server] sebelum menambahkan key
            if '[server]' not in content:
                with open(config_file, "a") as f:
                    f.write("\n[server]\n")
            with open(config_file, "a") as f:
                f.write('fileWatcherType = "none"\n')

def ensure_gw_config():
    """[F-02] Buat gw_config.json jika belum ada agar PyGWalker tidak error."""
    config_path = "gw_config.json"
    if not os.path.exists(config_path):
        with open(config_path, "w") as f:
            f.write("")

ensure_streamlit_config()
ensure_gw_config()

st.set_page_config(
    page_title="SAPA YANFASKES",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- 1.5 AUTHENTICATION / LOGIN LAYER (BPJS SSO Style) ---
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False

if not st.session_state.logged_in:
    # Sembunyikan sidebar & header Streamlit saat login
    st.markdown("""
    <style>
        [data-testid="stSidebar"] {
            display: none !important;
        }
        [data-testid="collapsedControl"] {
            display: none !important;
        }
        .login-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 30px;
            background-color: #ffffff;
            border-radius: 8px;
            max-width: 450px;
            margin: auto;
        }
        /* Style input form agar mirip dengan gambar referensi */
        .stTextInput > div > div > input {
            background-color: #FFFDF0 !important; /* Kuning gading muda */
            border: 1px solid #D1D5DB !important;
            color: #1F2937 !important;
        }
        .stTextInput > div > div > input:focus {
            border-color: #02628a !important;
            box-shadow: 0 0 0 1px #02628a !important;
        }
        /* Tombol Sign In BPJS Style */
        div.stButton > button {
            background-color: #02628a !important;
            color: white !important;
            width: 100% !important;
            border-radius: 4px !important;
            border: none !important;
            padding: 10px 0 !important;
            font-size: 16px !important;
            font-weight: 600 !important;
        }
        div.stButton > button:hover {
            background-color: #014c6c !important;
            color: white !important;
        }
    </style>
    """, unsafe_allow_html=True)

    # Pusatkan container login
    col_left, col_center, col_right = st.columns([1, 1.3, 1])
    
    with col_center:
        st.write("")
        st.write("")
        # Render Logo BPJS Kesehatan resmi SVG
        logo_url = "https://upload.wikimedia.org/wikipedia/commons/b/b4/BPJS_Kesehatan_logo.svg"
        st.image(logo_url, width=280)
        st.write("")
        
        # Form input
        username_val = st.text_input("Username", key="login_username", placeholder="")
        password_val = st.text_input("Password", type="password", key="login_password", placeholder="")
        
        # State validasi error
        error_msg = ""
        show_password_error = False
        
        # Cek jika form dikirim
        sign_in_clicked = st.button("Sign In")
        
        if sign_in_clicked:
            if not username_val:
                error_msg = "Username harus diisi"
            elif not password_val:
                show_password_error = True
            elif username_val == "admin" and password_val == "123456":
                st.session_state.logged_in = True
                st.rerun()
            else:
                error_msg = "Username atau password salah"
        
        # Tampilkan error password jika dipicu
        if show_password_error:
            st.markdown("<p style='color: #EF4444; font-size: 13px; margin-top: -10px; margin-bottom: 10px;'>🚫 Enter your password</p>", unsafe_allow_html=True)
            
        # Tampilkan error umum jika ada
        elif error_msg:
            st.markdown(f"<p style='color: #EF4444; font-size: 13px; margin-top: -10px; margin-bottom: 10px;'>🚫 {error_msg}</p>", unsafe_allow_html=True)
            
    st.stop()

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
        col_lower = col.strip().lower()
        # 1. Konversi Kolom Tanggal/Waktu secara Eksplisit (Sangat Penting untuk Hirarki Tableau)
        if col_lower in ['timestamp', 'tanggal', 'date', 'waktu']:
            try:
                df[col] = pd.to_datetime(df[col], errors='coerce')
                # Buat sub-kolom Tableau untuk kolom tanggal utama
                df[f"{col} (Tahun)"] = df[col].dt.year.dropna().astype(int).astype(str)
                df[f"{col} (Kuartal)"] = df[col].dt.to_period('Q').dropna().astype(str)
                bulan_map = {1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
                             7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember'}
                df[f"{col} (Bulan)"] = df[col].dt.month.map(bulan_map)
                df[f"{col} (Bulan Tahun)"] = df[col].dt.strftime('%b %Y')
                df[f"{col} (Hari)"] = df[col].dt.day.dropna().astype(int).astype(str)
                continue
            except Exception:
                pass

        # Skip identifier / code columns from auto numeric conversion to preserve leading zeros
        if any(id_kw in col_lower for id_kw in ['kode', 'kdppk', 'kd_ppk', 'id_faskes', 'kodefaskes', 'nik', 'nip', 'telp', 'phone', 'pos']):
            df[col] = df[col].astype(str).str.strip()
            continue
                
        if df[col].dtype == 'object':
            sample = df[col].dropna().astype(str).str.strip()
            if sample.empty:
                continue
            
            # [F-04] Cek jika kolom kualitatif berisi tanggal berpola — fix regex precedence dengan grouping
            if sample.str.contains(r'^(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})$').any():
                try:
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                    # Buat sub-kolom Tableau untuk kolom tanggal utama
                    df[f"{col} (Tahun)"] = df[col].dt.year.dropna().astype(int).astype(str)
                    df[f"{col} (Kuartal)"] = df[col].dt.to_period('Q').dropna().astype(str)
                    bulan_map = {1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
                                 7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember'}
                    df[f"{col} (Bulan)"] = df[col].dt.month.map(bulan_map)
                    df[f"{col} (Bulan Tahun)"] = df[col].dt.strftime('%b %Y')
                    df[f"{col} (Hari)"] = df[col].dt.day.dropna().astype(int).astype(str)
                    continue
                except Exception:
                    pass
            
            # [F-06] Deteksi Persentase — hanya konversi jika mayoritas (>= 80%) match pattern persentase murni
            pct_pattern = r'^\d+[\.,]?\d*\s*%$'
            pct_match_ratio = sample.str.match(pct_pattern).sum() / len(sample) if len(sample) > 0 else 0
            if pct_match_ratio >= 0.8:
                temp = df[col].astype(str).str.replace('%', '', regex=False).str.replace(',', '.', regex=False).str.strip()
                converted = pd.to_numeric(temp, errors='coerce') / 100.0
                df[col] = converted
                continue
            
            # [F-05] Deteksi Angka Format Desimal Indonesia — naikkan threshold ke 0.85
            # dan tambahkan heuristic: skip kolom yang terlihat seperti kode (panjang seragam 5-6 digit)
            temp_numeric = df[col].astype(str).str.strip()
            
            # Heuristic: jika semua non-null values panjangnya seragam 5-6 digit, kemungkinan kode pos/ID
            non_empty = temp_numeric[temp_numeric != '']
            if not non_empty.empty:
                lengths = non_empty.str.len()
                if lengths.std() < 0.5 and lengths.mean() >= 4 and lengths.mean() <= 8:
                    is_all_digit = non_empty.str.match(r'^\d+$').all()
                    if is_all_digit:
                        continue  # Kemungkinan besar kode/ID, skip konversi
            
            if temp_numeric.str.contains(r'\d+,\d+').any():
                temp_numeric = temp_numeric.str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
            else:
                temp_numeric = temp_numeric.str.replace(',', '.', regex=False)
                
            converted = pd.to_numeric(temp_numeric, errors='coerce')
            
            original_non_na = int(pd.notna(df[col]).sum())
            converted_non_na = int(pd.notna(converted).sum())
            
            if original_non_na > 0 and (converted_non_na / original_non_na) >= 0.85:
                df[col] = converted
                
    return df

# --- 3. DATA ENGINE (Merge Layer) ---
@st.cache_data(show_spinner="Mengunduh data...")
def load_raw_sheets(spreadsheet_id):
    try:
        url_faskes = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_FASKES"
        url_antrol = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_LAP_ANTROL_FKRTL"
        
        df_faskes = pd.read_csv(url_faskes)
        df_antrol = pd.read_csv(url_antrol)
        return df_faskes, df_antrol
    except Exception as e:
        # [S-03] Log error lengkap ke console, tampilkan pesan generik ke pengguna
        import logging
        logging.error(f"Gagal mengunduh spreadsheet: {e}")
        st.sidebar.error("Gagal mengunduh data dari Google Sheets. Pastikan URL benar dan sheet memiliki nama 'DB_FASKES' serta 'DB_LAP_ANTROL_FKRTL'.")
        return None, None

@st.cache_data(show_spinner="Menggabungkan data...")
def merge_data_with_keys(df_antrol, df_faskes, key_antrol, key_faskes):
    try:
        # [P-05] Hanya konversi kolom kunci, bukan copy seluruh DataFrame
        df_antrol_work = df_antrol.copy()
        df_faskes_work = df_faskes.copy()
        df_antrol_work[key_antrol] = df_antrol_work[key_antrol].astype(str).str.strip()
        df_faskes_work[key_faskes] = df_faskes_work[key_faskes].astype(str).str.strip()

        merged_df = pd.merge(
            df_antrol_work, 
            df_faskes_work, 
            left_on=key_antrol, 
            right_on=key_faskes, 
            how="left", 
            suffixes=("", "_master")
        )
        
        if key_faskes != key_antrol and key_faskes in merged_df.columns:
            merged_df = merged_df.drop(columns=[key_faskes])
            
        # [I-02] Hapus DuckDB pass-through yang tidak memberikan nilai tambah
        merged_df = clean_dataframe_dtypes(merged_df)
        return merged_df
    except Exception as e:
        import logging
        logging.error(f"Gagal melakukan penggabungan: {e}")
        st.sidebar.error("Gagal menggabungkan data. Pastikan kolom kunci hubung dipilih dengan benar.")
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
            
        # [I-02] Hapus DuckDB pass-through yang tidak memberikan nilai tambah
        df = clean_dataframe_dtypes(df)
        return df
    except Exception as e:
        import logging
        logging.error(f"Gagal membaca file: {e}")
        st.sidebar.error("Gagal membaca file. Pastikan format file CSV/Excel valid.")
        return None

# --- 4. OPTIMIZED CACHED RENDERER RESOURCE ---
# [P-01] Fix: gunakan satu renderer per sumber data, bukan per filter combination.
# Underscore prefix _df tidak di-hash; cache_key dipakai sebagai pembeda sumber data saja.
@st.cache_resource
def get_pyg_renderer(_df, cache_key: str) -> StreamlitRenderer:
    # [F-01] Fix: spec_path → spec (deprecated di PyGWalker v0.5.x)
    return StreamlitRenderer(
        _df, 
        spec="./gw_config.json",
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
        # [S-04] Validasi bahwa URL berasal dari domain Google Sheets
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


# --- 6. HELPER: Deteksi Periode Dinamis dari Data ---
def detect_dynamic_period(df):
    """[F-08] Deteksi periode data dari kolom datetime yang tersedia."""
    datetime_cols = [col for col in df.columns if pd.api.types.is_datetime64_any_dtype(df[col])]
    if not datetime_cols:
        return "Seluruh Periode"
    
    date_col = datetime_cols[0]
    valid_dates = df[date_col].dropna()
    if valid_dates.empty:
        return "Seluruh Periode"
    
    min_date = valid_dates.min()
    max_date = valid_dates.max()
    
    min_ts = pd.Timestamp(min_date)
    max_ts = pd.Timestamp(max_date)
    
    # Jika dalam bulan yang sama
    if min_ts.year == max_ts.year and min_ts.month == max_ts.month:
        bulan_map = {1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
                     7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember'}
        return f"Periode {bulan_map.get(min_ts.month, '')} {min_ts.year}"
    
    return f"Periode {min_ts.strftime('%d/%m/%Y')} — {max_ts.strftime('%d/%m/%Y')}"


# --- 7. HELPER: Auto-Generate KPI Cards ---
def render_kpi_cards(df, period_label):
    """[U-04] Auto-generate KPI cards berdasarkan kolom numerik yang tersedia."""
    # Escape semua variabel HTML untuk [S-02]
    safe_period = html_module.escape(str(period_label))
    
    kpi_items = []
    
    # KPI utama: Capaian (jika ada)
    if 'Capaian' in df.columns:
        try:
            capaian_numeric = pd.to_numeric(df['Capaian'], errors='coerce')
            avg_val = capaian_numeric.mean()
            
            if pd.isna(avg_val):
                kpi_display = "0.00%"
            else:
                # [F-03] Auto-detect range: jika rata-rata > 1, data sudah dalam format persentase (0-100)
                if avg_val > 1:
                    kpi_display = f"{avg_val:.2f}%"
                else:
                    kpi_display = f"{avg_val * 100:.2f}%"
        except Exception:
            kpi_display = "N/A"
        
        kpi_items.append(f"""
        <div style="background: linear-gradient(135deg, #1E3A8A, #3B82F6); padding: 15px; border-radius: 8px; text-align: center; color: white; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); flex: 1; min-width: 200px; margin: 10px;">
            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;">Pemanfaatan</div>
            <div style="font-size: 10px; font-style: italic; opacity: 0.7; margin-bottom: 6px;">{safe_period}</div>
            <div style="font-size: 32px; font-weight: 800;">{html_module.escape(kpi_display)}</div>
        </div>
        """)
    
    # KPI sekunder: Total Records
    total_rows = len(df)
    kpi_items.append(f"""
    <div style="background: #1E293B; padding: 15px; border-radius: 8px; text-align: center; color: white; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); flex: 1; min-width: 200px; margin: 10px;">
        <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;">Total Rekaman</div>
        <div style="font-size: 10px; font-style: italic; opacity: 0.7; margin-bottom: 6px;">Baris Data</div>
        <div style="font-size: 32px; font-weight: 800;">{total_rows:,}</div>
    </div>
    """)
    
    # KPI dari kolom numerik lain (max 2 tambahan)
    numeric_cols = df.select_dtypes(include='number').columns.tolist()
    skip_cols = ['Capaian']
    extra_count = 0
    
    for ncol in numeric_cols:
        if ncol in skip_cols or extra_count >= 2:
            break
        col_mean = df[ncol].mean()
        if pd.isna(col_mean):
            continue
        
        safe_col = html_module.escape(str(ncol))
        
        # Format angka dengan separator ribuan
        if col_mean == int(col_mean):
            val_display = f"{int(col_mean):,}"
        else:
            val_display = f"{col_mean:,.2f}"
        
        kpi_items.append(f"""
        <div style="background: #1E293B; padding: 15px; border-radius: 8px; text-align: center; color: white; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); flex: 1; min-width: 200px; margin: 10px;">
            <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;">Rata-rata {safe_col}</div>
            <div style="font-size: 10px; font-style: italic; opacity: 0.7; margin-bottom: 6px;">Metrik Otomatis</div>
            <div style="font-size: 32px; font-weight: 800;">{html_module.escape(val_display)}</div>
        </div>
        """)
        extra_count += 1
    
    # Bungkus dalam container flexbox horizontal
    return f"""
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; width: 100%; margin-bottom: 10px;">
        {"".join(kpi_items)}
    </div>
    """


# --- 8. RENDER KANVAS DASHBOARD ---
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
        # Tableau-Style Header
        st.markdown("<h1 style='text-align: center; color: #F8FAFC; font-weight: 700; margin-bottom: 0px;'>Dashboard Pemanfaatan Antrean Online FKRTL</h1>", unsafe_allow_html=True)
        
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        safe_time = html_module.escape(current_time)
        st.markdown(f"<p style='text-align: center; color: #94A3B8; font-size: 13px; margin-top: 4px; margin-bottom: 20px; font-style: italic;'>Terakhir Diperbarui: {safe_time}</p>", unsafe_allow_html=True)
        st.write("---")
        
        filtered_df = df_raw.copy()
        filter_states = {}
        
        # A. TABLEAU-STYLE HORIZONTAL QUICK FILTERS
        st.markdown("### 🔍 Filter Cepat (Quick Filters)")
        filter_cols = st.columns(4)
        
        datetime_cols = [col for col in df_raw.columns if pd.api.types.is_datetime64_any_dtype(df_raw[col])]
        
        if datetime_cols:
            date_col = datetime_cols[0]
            valid_dates_series = df_raw[date_col].dropna()
            
            if not valid_dates_series.empty:
                with filter_cols[0]:
                    date_filter_type = st.selectbox(
                        "Tingkat Detail Tanggal",
                        ["Bulan / Tahun", "Rentang Tanggal", "Tahun", "Tanggal Spesifik"],
                        key=f"date_filter_type_{date_col}"
                    )
                
                with filter_cols[1]:
                    if date_filter_type == "Bulan / Tahun":
                        sorted_unique_dates = sorted([d for d in valid_dates_series.unique() if pd.notna(d)])
                        options = []
                        for d in sorted_unique_dates:
                            fmt_val = pd.Timestamp(d).strftime('%b %Y')
                            if fmt_val not in options:
                                options.append(fmt_val)
                        
                        selected_my = st.multiselect(
                            "Filter Bulan Tahun",
                            options=options,
                            default=[],
                            key=f"selected_my_{date_col}"
                        )
                        if selected_my:
                            mask = filtered_df[date_col].dropna().apply(lambda x: pd.Timestamp(x).strftime('%b %Y')).isin(selected_my)
                            mask = mask.reindex(filtered_df.index, fill_value=False)
                            filtered_df = filtered_df[mask]
                            filter_states[f"{date_col}_MY"] = selected_my
                            
                    elif date_filter_type == "Rentang Tanggal":
                        min_ts = pd.Timestamp(valid_dates_series.min())
                        max_ts = pd.Timestamp(valid_dates_series.max())
                        min_date = min_ts.date()
                        max_date = max_ts.date()
                        
                        if min_date == max_date:
                            st.info(f"Tanggal: {min_date}")
                        else:
                            selected_range = st.slider(
                                "Pilih Rentang",
                                min_value=min_date,
                                max_value=max_date,
                                value=(min_date, max_date),
                                format="YYYY-MM-DD",
                                key=f"selected_range_{date_col}"
                            )
                            dates_as_date = pd.to_datetime(filtered_df[date_col], errors='coerce').dt.date
                            mask = (dates_as_date >= selected_range[0]) & (dates_as_date <= selected_range[1])
                            mask = mask.fillna(False)
                            filtered_df = filtered_df[mask]
                            filter_states[f"{date_col}_range"] = [selected_range[0].strftime("%Y-%m-%d"), selected_range[1].strftime("%Y-%m-%d")]
                            
                    elif date_filter_type == "Tahun":
                        years_series = pd.to_datetime(valid_dates_series, errors='coerce').dt.year.dropna().astype(int)
                        options = sorted(years_series.unique().tolist())
                        
                        selected_years = st.multiselect(
                            "Filter Tahun",
                            options=options,
                            default=[],
                            key=f"selected_years_{date_col}"
                        )
                        if selected_years:
                            year_vals = pd.to_datetime(filtered_df[date_col], errors='coerce').dt.year
                            mask = year_vals.isin(selected_years)
                            mask = mask.fillna(False)
                            filtered_df = filtered_df[mask]
                            filter_states[f"{date_col}_years"] = selected_years
                            
                    elif date_filter_type == "Tanggal Spesifik":
                        dates_formatted = pd.to_datetime(valid_dates_series, errors='coerce').dt.strftime("%Y-%m-%d").dropna()
                        options = sorted(dates_formatted.unique().tolist())
                        
                        selected_dates = st.multiselect(
                            "Filter Tanggal Spesifik",
                            options=options,
                            default=[],
                            key=f"selected_dates_{date_col}"
                        )
                        if selected_dates:
                            date_strs = pd.to_datetime(filtered_df[date_col], errors='coerce').dt.strftime("%Y-%m-%d")
                            mask = date_strs.isin(selected_dates)
                            mask = mask.fillna(False)
                            filtered_df = filtered_df[mask]
                            filter_states[f"{date_col}_dates"] = selected_dates
        
        # B. STANDARD CATEGORICAL FILTERS (Kategori non-tanggal, maks 2 filter agar pas di grid horizontal)
        col_idx = 2
        for col in active_filters:
            if col_idx >= 4:
                break
            with filter_cols[col_idx]:
                try:
                    unique_vals = sorted(df_raw[col].dropna().unique().tolist(), key=str)
                except TypeError:
                    unique_vals = sorted([str(v) for v in df_raw[col].dropna().unique().tolist()])
                    
                selected = st.multiselect(
                    f"Filter {col}",
                    options=unique_vals,
                    default=[],
                    key=f"dashboard_filter_{col}"
                )
                if selected:
                    filtered_df = filtered_df[filtered_df[col].isin(selected)]
                    filter_states[col] = selected
            col_idx += 1
            
        st.write("---")
        
        # 2. Render KPI Row (Horizontal Grid)
        period_label = detect_dynamic_period(filtered_df)
        kpi_html = render_kpi_cards(filtered_df, period_label)
        st.markdown(kpi_html, unsafe_allow_html=True)
        st.write("")
        
        # 3. Tableau Tab Sheets Navigation (100% Lebar Layar)
        tab_visual, tab_data = st.tabs(["📊 Lembar Analisis (Visual)", "🗄️ Tabel Rekaman Data"])
        
        with tab_visual:
            if filtered_df.empty:
                st.warning("⚠️ Tidak ada data yang sesuai dengan filter yang dipilih. Silakan sesuaikan filter Anda.")
            else:
                active_cache_key = f"{base_cache_key}_dashboard"
                # Loading spinner saat rendering PyGWalker
                with st.spinner("Memuat visualisasi Tableau..."):
                    renderer = get_pyg_renderer(filtered_df, active_cache_key)
                    renderer.viewer()
                    
        with tab_data:
            st.markdown("### 📋 Detail Rekaman Data Aktif")
            st.dataframe(filtered_df, use_container_width=True)
            
    else:
        st.sidebar.warning(
            "💡 **Mode Developer Hack:** Silakan buat lembar kerja (Sheet) baru, drag-and-drop kolom, "
            "dan pastikan untuk mengklik ikon **Simpan (Disket)** sebelum beralih ke Mode Published Dashboard."
        )
        
        active_cache_key = f"{base_cache_key}_developer_mode"
        # Loading spinner saat rendering PyGWalker
        with st.spinner("Memuat workspace developer..."):
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