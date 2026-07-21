import streamlit as st
import pandas as pd
import html as html_module
from datetime import datetime
from pygwalker.api.streamlit import StreamlitRenderer
from modules.data_processor import detect_dynamic_period

@st.cache_resource
def get_pyg_renderer(_df, cache_key: str) -> StreamlitRenderer:
    """Cached PyGWalker renderer instance per dataset source."""
    return StreamlitRenderer(
        _df, 
        spec="./gw_config.json",
        spec_io_mode="rw",
        appearance="dark"
    )

def render_kpi_cards(df, period_label):
    """Auto-generate horizontal flexbox KPI cards."""
    safe_period = html_module.escape(str(period_label))
    kpi_items = []
    
    # KPI 1: Capaian / Pemanfaatan
    if 'Capaian' in df.columns:
        try:
            capaian_numeric = pd.to_numeric(df['Capaian'], errors='coerce')
            avg_val = capaian_numeric.mean()
            
            if pd.isna(avg_val):
                kpi_display = "0.00%"
            else:
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
    
    # KPI 2: Total Rekaman
    total_rows = len(df)
    kpi_items.append(f"""
    <div style="background: #1E293B; padding: 15px; border-radius: 8px; text-align: center; color: white; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); flex: 1; min-width: 200px; margin: 10px;">
        <div style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;">Total Rekaman</div>
        <div style="font-size: 10px; font-style: italic; opacity: 0.7; margin-bottom: 6px;">Baris Data</div>
        <div style="font-size: 32px; font-weight: 800;">{total_rows:,}</div>
    </div>
    """)
    
    # KPI 3 & 4: Kolom numerik tambahan (maks 2)
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
    
    return f"""
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; width: 100%; margin-bottom: 10px;">
        {"".join(kpi_items)}
    </div>
    """

def render_published_dashboard(df_raw, base_cache_key, active_filters):
    """Render Published Dashboard with Tableau horizontal filters, KPI cards, and tab sheets."""
    st.markdown("<h1 style='text-align: center; color: #F8FAFC; font-weight: 700; margin-bottom: 0px;'>Dashboard Pemanfaatan Antrean Online FKRTL</h1>", unsafe_allow_html=True)
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    safe_time = html_module.escape(current_time)
    st.markdown(f"<p style='text-align: center; color: #94A3B8; font-size: 13px; margin-top: 4px; margin-bottom: 20px; font-style: italic;'>Terakhir Diperbarui: {safe_time}</p>", unsafe_allow_html=True)
    st.write("---")
    
    filtered_df = df_raw.copy()
    filter_states = {}
    
    # 1. TABLEAU-STYLE HORIZONTAL QUICK FILTERS
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
    
    # Categorical Filters
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
    
    # 2. KPI Horizontal Grid
    period_label = detect_dynamic_period(filtered_df)
    kpi_html = render_kpi_cards(filtered_df, period_label)
    st.markdown(kpi_html, unsafe_allow_html=True)
    st.write("")
    
    # 3. Tableau Tab Sheets Navigation
    tab_visual, tab_data = st.tabs(["📊 Lembar Analisis (Visual)", "🗄️ Tabel Rekaman Data"])
    
    with tab_visual:
        if filtered_df.empty:
            st.warning("⚠️ Tidak ada data yang sesuai dengan filter yang dipilih. Silakan sesuaikan filter Anda.")
        else:
            active_cache_key = f"{base_cache_key}_dashboard"
            with st.spinner("Memuat visualisasi Tableau..."):
                renderer = get_pyg_renderer(filtered_df, active_cache_key)
                renderer.viewer()
                
    with tab_data:
        st.markdown("### 📋 Detail Rekaman Data Aktif")
        st.dataframe(filtered_df, use_container_width=True)

def render_developer_mode(df_raw, base_cache_key):
    """Render PyGWalker Developer Mode canvas for designing drag-and-drop charts."""
    st.sidebar.warning(
        "💡 **Mode Developer Hack:** Silakan buat lembar kerja (Sheet) baru, drag-and-drop kolom, "
        "dan pastikan untuk mengklik ikon **Simpan (Disket)** sebelum beralih ke Mode Published Dashboard."
    )
    
    active_cache_key = f"{base_cache_key}_developer_mode"
    with st.spinner("Memuat workspace developer..."):
        renderer = get_pyg_renderer(df_raw, active_cache_key)
        renderer.explorer()
