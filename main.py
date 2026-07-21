from taipy.gui import Gui, notify, State
import plotly.graph_objects as go
import polars as pl
import pandas as pd
import re

from modules.data_processor import (
    load_raw_sheets_polars,
    merge_data_with_keys_polars,
    load_single_data_polars,
    detect_dynamic_period_polars
)
from modules.auth import authenticate_credentials
from modules.dashboard import (
    create_kpi_indicator_cards,
    create_utilization_chart,
    create_regional_distribution_chart
)
from modules.theme import GLASSMORPHISM_CSS
from modules.settings import get_system_status

# --- INITIAL REACTIVE STATE ---
logged_in = False
username = ""
password = ""
login_error = ""

nav_selection = "🏠 Home"
input_method = "Gabung Otomatis (2 Sheets)"
sheet_url = ""
file_path = None

df_polars = None
data_pandas = pd.DataFrame()
period_label = "Seluruh Periode"

fig_kpi = create_kpi_indicator_cards(None)
fig_trend = create_utilization_chart(None)
fig_dist = create_regional_distribution_chart(None)

sys_info = get_system_status()

# --- BACKEND CALLBACKS ---
def on_login(state: State):
    """Callback for login form submission."""
    success, msg = authenticate_credentials(state.username, state.password)
    if success:
        state.logged_in = True
        state.login_error = ""
        notify(state, "success", f"Selamat datang, {state.username}!")
    else:
        state.login_error = msg
        notify(state, "error", msg)

def on_logout(state: State):
    """Callback for logging out."""
    state.logged_in = False
    state.username = ""
    state.password = ""
    state.df_polars = None
    state.data_pandas = pd.DataFrame()
    notify(state, "info", "Anda telah keluar dari sesi SAPA YANFASKES.")

def process_sheets_url(state: State):
    """Callback to load and merge Google Sheets using Polars."""
    if not state.sheet_url:
        notify(state, "warning", "Masukkan URL Google Sheets terlebih dahulu.")
        return

    match = re.search(r"/d/([a-zA-Z0-9-_]+)", state.sheet_url)
    if not match:
        notify(state, "error", "Format URL Google Sheets tidak valid.")
        return

    ss_id = match.group(1)
    notify(state, "info", "Mengunduh & memproses data Google Sheets dengan Polars...")
    
    df_faskes, df_antrol = load_raw_sheets_polars(ss_id)
    if df_faskes is None or df_antrol is None:
        notify(state, "error", "Gagal mengunduh sheet. Pastikan sheet publik & memiliki DB_FASKES dan DB_LAP_ANTROL_FKRTL.")
        return

    # Auto detect merge keys
    antrol_cols = df_antrol.columns
    faskes_cols = df_faskes.columns
    key_antrol = antrol_cols[0]
    key_faskes = faskes_cols[0]

    for col in antrol_cols:
        if col.strip().lower() in ['kdppk', 'kode faskes', 'kodeppk', 'kode_ppk', 'kode_faskes']:
            key_antrol = col
            break

    for col in faskes_cols:
        if col.strip().lower() in ['kdppk', 'kode faskes', 'kodeppk', 'kode_ppk', 'kode_faskes', 'kodeppk_master']:
            key_faskes = col
            break

    merged_df = merge_data_with_keys_polars(df_antrol, df_faskes, key_antrol, key_faskes)
    if merged_df is not None:
        state.df_polars = merged_df
        state.data_pandas = merged_df.to_pandas()
        state.period_label = detect_dynamic_period_polars(merged_df)
        
        # Update Plotly charts reactively
        state.fig_kpi = create_kpi_indicator_cards(merged_df)
        state.fig_trend = create_utilization_chart(merged_df)
        state.fig_dist = create_regional_distribution_chart(merged_df)
        
        notify(state, "success", f"Berhasil memproses {merged_df.height:,} baris data dengan Polars!")

def on_file_upload(state: State):
    """Callback for local file upload via Taipy file selector."""
    if not state.file_path:
        return

    try:
        with open(state.file_path, "rb") as f:
            content = f.read()

        df = load_single_data_polars(content, state.file_path)
        if df is not None:
            state.df_polars = df
            state.data_pandas = df.to_pandas()
            state.period_label = detect_dynamic_period_polars(df)
            
            state.fig_kpi = create_kpi_indicator_cards(df)
            state.fig_trend = create_utilization_chart(df)
            state.fig_dist = create_regional_distribution_chart(df)
            
            notify(state, "success", f"File berhasil dibaca! {df.height:,} baris diproses via Polars.")
    except Exception as e:
        notify(state, "error", f"Gagal membaca file: {e}")

# --- TAIPY MARKDOWN LAYOUT PAGES ---

LOGIN_PAGE = """
<|container glass-card|
# 🏥 SAPA YANFASKES
### Single Sign-On BPJS Kesehatan Style Login

Username:
<|{username}|input|>

Password:
<|{password}|input|password=True|>

<|Sign In|button|on_action=on_login|>

<|{login_error}|text|class_name=error-text|>
|>
"""

MAIN_PAGE = """
<|layout|columns=1 4|
<|sidebar|
## 🏥 SAPA YANFASKES
*Saluran Analisis Performa & Akselerasi*

Navigasi:
<|{nav_selection}|selector|lov=🏠 Home;⚙️ Setting|dropdown=False|>

---
Metode Data:
<|{input_method}|selector|lov=Gabung Otomatis (2 Sheets);Unggah File Lokal|dropdown=False|>

<|{input_method == "Gabung Otomatis (2 Sheets)"}|part|
Google Sheets URL:
<|{sheet_url}|input|placeholder=https://docs.google.com/spreadsheets/d/...|>
<|Proses Data|button|on_action=process_sheets_url|>
|>

<|{input_method == "Unggah File Lokal"}|part|
File CSV / Excel:
<|{file_path}|file_selector|on_action=on_file_upload|extensions=.csv,.xlsx,.xls|>
|>

---
<|Logout|button|on_action=on_logout|>
|>

<|content|
<|{nav_selection == "🏠 Home"}|part|
# 📊 Dashboard Pemanfaatan Antrean Online FKRTL
*<|{period_label}|text|>*

<|{fig_kpi}|chart|>

<|layout|columns=1 1|
<|
<|{fig_trend}|chart|>
|>
<|
<|{fig_dist}|chart|>
|>
|>

### 📋 Detail Rekaman Data Aktif (Polars High-Performance View)
<|{data_pandas}|table|page_size=10|>
|>

<|{nav_selection == "⚙️ Setting"}|part|
# ⚙️ Pengaturan & Konfigurasi Sistem

<|container glass-card|
### 👤 Profil Pengguna
- **Username:** `admin`
- **Peran:** Administrator Utama SAPA Yanfaskes
- **Status Engine:** High-Performance Polars + Taipy + Plotly Engine

### 🛡️ Status Sistem
- **Data Engine:** Polars Lazy API (Multi-threaded Rust)
- **UI Engine:** Taipy GUI Reactive State
- **Excel Engine:** fastexcel / calamine engine (10x-15x faster)
- **Visualization:** Pre-configured Plotly SVG/WebGL
|>
|>
|>
|>
"""

PAGE_ROUTER = """
<|{not logged_in}|part|
""" + LOGIN_PAGE + """
|>

<|{logged_in}|part|
""" + MAIN_PAGE + """
|>
"""

app = Gui(page=PAGE_ROUTER, css_file=GLASSMORPHISM_CSS)

if __name__ == "__main__":
    app.run(title="SAPA YANFASKES — High-Performance Engine", port=8501, dark=True)
