import streamlit as st
import pandas as pd
import os
import logging

def ensure_streamlit_config():
    """Ensure server fileWatcherType configuration is present."""
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
            if '[server]' not in content:
                with open(config_file, "a") as f:
                    f.write("\n[server]\n")
            with open(config_file, "a") as f:
                f.write('fileWatcherType = "none"\n')

def ensure_gw_config():
    """Create gw_config.json if not present for PyGWalker compatibility."""
    config_path = "gw_config.json"
    if not os.path.exists(config_path):
        with open(config_path, "w") as f:
            f.write("")

def clean_dataframe_dtypes(df):
    """Self-healing data cleaning & Tableau Date Hierarchy auto-generation."""
    for col in df.columns:
        col_lower = col.strip().lower()
        
        # 1. Konversi Kolom Tanggal/Waktu secara Eksplisit
        if col_lower in ['timestamp', 'tanggal', 'date', 'waktu']:
            try:
                df[col] = pd.to_datetime(df[col], errors='coerce')
                # Sub-kolom Tableau Date Hierarchy
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

        # Skip identifier / code columns
        if any(id_kw in col_lower for id_kw in ['kode', 'kdppk', 'kd_ppk', 'id_faskes', 'kodefaskes', 'nik', 'nip', 'telp', 'phone', 'pos']):
            df[col] = df[col].astype(str).str.strip()
            continue
                
        if df[col].dtype == 'object':
            sample = df[col].dropna().astype(str).str.strip()
            if sample.empty:
                continue
            
            # Cek jika kolom kualitatif berisi tanggal berpola
            if sample.str.contains(r'^(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})$').any():
                try:
                    df[col] = pd.to_datetime(df[col], errors='coerce')
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
            
            # Deteksi Persentase
            pct_pattern = r'^\d+[\.,]?\d*\s*%$'
            if (sample.str.match(pct_pattern).sum() / len(sample)) >= 0.8:
                try:
                    df[col] = sample.str.rstrip('%').str.replace(',', '.').astype(float) / 100.0
                    continue
                except Exception:
                    pass
            
            # Deteksi Numerik Bersih
            try:
                cleaned_sample = sample.str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df[col] = pd.to_numeric(cleaned_sample, errors='raise')
                continue
            except Exception:
                pass
                
    return df

@st.cache_data(ttl=3600, show_spinner="Mengunduh data Google Sheets...")
def load_raw_sheets(spreadsheet_id):
    """Load raw Google Sheets tables with caching."""
    url_faskes = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_FASKES"
    url_antrol = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=DB_LAP_ANTROL_FKRTL"
    
    try:
        df_faskes = pd.read_csv(url_faskes)
        df_antrol = pd.read_csv(url_antrol)
        return df_faskes, df_antrol
    except Exception as e:
        logging.error(f"Gagal mengunduh Google Sheets: {e}")
        st.sidebar.error("Gagal mengunduh data dari Google Sheets. Pastikan URL benar dan sheet memiliki nama 'DB_FASKES' serta 'DB_LAP_ANTROL_FKRTL'.")
        return None, None

@st.cache_data(show_spinner="Menggabungkan data...")
def merge_data_with_keys(df_antrol, df_faskes, key_antrol, key_faskes):
    """Merge antrean online and master faskes data with keys."""
    try:
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
            
        merged_df = clean_dataframe_dtypes(merged_df)
        return merged_df
    except Exception as e:
        logging.error(f"Gagal melakukan penggabungan: {e}")
        st.sidebar.error("Gagal menggabungkan data. Pastikan kolom kunci hubung dipilih dengan benar.")
        return None

@st.cache_data(show_spinner="Sedang memproses file tunggal...")
def load_single_data(source):
    """Load single local CSV/Excel file."""
    try:
        if source.name.endswith('.csv'):
            df = pd.read_csv(source)
        elif source.name.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(source)
        else:
            return None
            
        df = clean_dataframe_dtypes(df)
        return df
    except Exception as e:
        logging.error(f"Gagal membaca file: {e}")
        st.sidebar.error("Gagal membaca file. Pastikan format file CSV/Excel valid.")
        return None

def detect_dynamic_period(df):
    """Detect data period automatically from datetime columns."""
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
    
    if min_ts.year == max_ts.year and min_ts.month == max_ts.month:
        bulan_map = {1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
                     7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember'}
        return f"Periode {bulan_map.get(min_ts.month, '')} {min_ts.year}"
    
    return f"Periode {min_ts.strftime('%d/%m/%Y')} — {max_ts.strftime('%d/%m/%Y')}"
