import streamlit as st
import polars as pl
import plotly.graph_objects as go
import plotly.express as px
import html as html_module
from datetime import datetime
from modules.data_processor import detect_dynamic_period_polars

def create_kpi_indicator_cards(df: pl.DataFrame):
    """Generate interactive Plotly KPI Indicator cards for fast client-side rendering."""
    if df is None or df.height == 0:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", title="Tidak ada data")
        return fig

    total_records = df.height
    avg_capaian = "N/A"
    
    if "Capaian" in df.columns:
        try:
            cap_vals = df.select(pl.col("Capaian").cast(pl.Float64, strict=False).mean()).item()
            if cap_vals is not None:
                if cap_vals > 1:
                    avg_capaian = f"{cap_vals:.2f}%"
                else:
                    avg_capaian = f"{cap_vals * 100:.2f}%"
        except Exception:
            pass

    fig = go.Figure()

    # KPI 1: Pemanfaatan
    fig.add_trace(go.Indicator(
        mode="number",
        value=float(avg_capaian.replace("%", "")) if avg_capaian != "N/A" else 0,
        number={'suffix': "%", 'font': {'size': 34, 'color': "#60A5FA"}},
        title={'text': "Pemanfaatan Antrean", 'font': {'size': 13, 'color': "#94A3B8"}},
        domain={'x': [0, 0.48], 'y': [0, 1]}
    ))

    # KPI 2: Total Rekaman
    fig.add_trace(go.Indicator(
        mode="number",
        value=total_records,
        number={'font': {'size': 34, 'color': "#34D399"}},
        title={'text': "Total Rekaman Data", 'font': {'size': 13, 'color': "#94A3B8"}},
        domain={'x': [0.52, 1], 'y': [0, 1]}
    ))

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(15,23,42,0.5)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=10, r=10, t=25, b=15),
        height=120
    )
    return fig

def create_utilization_chart(df: pl.DataFrame):
    """Generate main trend chart using Plotly graph objects."""
    if df is None or df.height == 0:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", title="Tidak Ada Data Tren")
        return fig

    date_cols = [c for c in df.columns if any(kw in c.lower() for kw in ['tanggal', 'timestamp', 'date', 'waktu'])]
    num_cols = [c for c in df.columns if df.schema[c] in (pl.Float64, pl.Int64, pl.Int32) and c != 'Capaian']

    if date_cols and 'Capaian' in df.columns:
        date_col = date_cols[0]
        agg_df = (
            df.lazy()
            .group_by(date_col)
            .agg(pl.col('Capaian').cast(pl.Float64, strict=False).mean().alias('Rata_Capaian'))
            .sort(date_col)
            .collect()
        )
        
        fig = px.line(
            agg_df.to_pandas(),
            x=date_col,
            y='Rata_Capaian',
            title='<b>Tren Pemanfaatan Antrean Online</b>',
            labels={date_col: 'Tanggal', 'Rata_Capaian': 'Tingkat Capaian'},
            template='plotly_dark'
        )
        fig.update_traces(line_color='#60A5FA', line_width=3)
    elif num_cols:
        num_col = num_cols[0]
        fig = px.histogram(
            df.to_pandas(),
            x=num_col,
            title=f'<b>Distribusi {num_col}</b>',
            template='plotly_dark'
        )
        fig.update_traces(marker_color='#60A5FA')
    else:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", title="Visualisasi Data Siap")

    fig.update_layout(
        paper_bgcolor="rgba(15,23,42,0.4)",
        plot_bgcolor="rgba(15,23,42,0.4)",
        font=dict(color="#E2E8F0"),
        margin=dict(l=20, r=20, t=40, b=20),
        height=360
    )
    return fig

def create_regional_distribution_chart(df: pl.DataFrame):
    """Generate categorical distribution bar chart."""
    if df is None or df.height == 0:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", title="Tidak Ada Data Distribusi")
        return fig

    cat_cols = [c for c in ['Kabupaten', 'Kepemilikan', 'Cabang', 'Kelas_RS'] if c in df.columns]
    if not cat_cols:
        cat_cols = [c for c in df.columns if df.schema[c] == pl.Utf8][:1]

    if cat_cols:
        cat_col = cat_cols[0]
        agg_df = (
            df.lazy()
            .group_by(cat_col)
            .agg(pl.len().alias('Jumlah'))
            .sort('Jumlah', descending=True)
            .limit(10)
            .collect()
        )

        fig = px.bar(
            agg_df.to_pandas(),
            x='Jumlah',
            y=cat_col,
            orientation='h',
            title=f'<b>Top 10 Rekaman Berdasarkan {cat_col}</b>',
            template='plotly_dark',
            color='Jumlah',
            color_continuous_scale='Blues'
        )
    else:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", title="Kategori Data")

    fig.update_layout(
        paper_bgcolor="rgba(15,23,42,0.4)",
        plot_bgcolor="rgba(15,23,42,0.4)",
        font=dict(color="#E2E8F0"),
        margin=dict(l=20, r=20, t=40, b=20),
        height=360
    )
    return fig

def render_published_dashboard_polars(df_raw: pl.DataFrame, base_cache_key: str, active_filters: list):
    """Render High-Performance Dashboard powered by Polars & Plotly in Streamlit."""
    st.markdown("<h1 style='text-align: center; color: #F8FAFC; font-weight: 700; margin-bottom: 0px;'>Dashboard Pemanfaatan Antrean Online FKRTL</h1>", unsafe_allow_html=True)
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    safe_time = html_module.escape(current_time)
    st.markdown(f"<p style='text-align: center; color: #94A3B8; font-size: 13px; margin-top: 4px; margin-bottom: 20px; font-style: italic;'>Terakhir Diperbarui: {safe_time} | Polars Engine Active ⚡</p>", unsafe_allow_html=True)
    st.write("---")
    
    filtered_df = df_raw
    
    # 1. TABLEAU-STYLE HORIZONTAL QUICK FILTERS (Polars)
    st.markdown("### 🔍 Filter Cepat (Quick Filters)")
    filter_cols = st.columns(4)
    
    datetime_cols = [c for c, dt in df_raw.schema.items() if dt in (pl.Datetime, pl.Date)]
    
    if datetime_cols:
        date_col = datetime_cols[0]
        valid_dates = df_raw.select(pl.col(date_col).drop_nulls())
        
        if valid_dates.height > 0:
            with filter_cols[0]:
                date_filter_type = st.selectbox(
                    "Tingkat Detail Tanggal",
                    ["Bulan / Tahun", "Semua Tanggal"],
                    key=f"date_filter_type_{date_col}"
                )
            
            with filter_cols[1]:
                if date_filter_type == "Bulan / Tahun":
                    bulan_tahun_col = f"{date_col} (Bulan Tahun)"
                    if bulan_tahun_col in df_raw.columns:
                        options = sorted(df_raw[bulan_tahun_col].drop_nulls().unique().to_list())
                        selected_my = st.multiselect(
                            "Filter Bulan Tahun",
                            options=options,
                            default=[],
                            key=f"selected_my_{date_col}"
                        )
                        if selected_my:
                            filtered_df = filtered_df.filter(pl.col(bulan_tahun_col).is_in(selected_my))

    # Categorical Filters
    col_idx = 2
    for col in active_filters:
        if col_idx >= 4:
            break
        with filter_cols[col_idx]:
            unique_vals = sorted(df_raw[col].drop_nulls().unique().to_list())
            selected = st.multiselect(
                f"Filter {col}",
                options=unique_vals,
                default=[],
                key=f"dashboard_filter_{col}"
            )
            if selected:
                filtered_df = filtered_df.filter(pl.col(col).is_in(selected))
        col_idx += 1
        
    st.write("---")
    
    # 2. KPI Indicator Cards (Plotly)
    period_label = detect_dynamic_period_polars(filtered_df)
    fig_kpi = create_kpi_indicator_cards(filtered_df)
    st.plotly_chart(fig_kpi, use_container_width=True)
    st.write("")
    
    # 3. Tab Navigation (Plotly Visuals & Data Table)
    tab_visual, tab_data = st.tabs(["📊 Lembar Analisis (Plotly Visuals)", "🗄️ Tabel Rekaman Data (Polars View)"])
    
    with tab_visual:
        if filtered_df.height == 0:
            st.warning("⚠️ Tidak ada data yang sesuai dengan filter yang dipilih.")
        else:
            col_v1, col_v2 = st.columns(2)
            with col_v1:
                fig_trend = create_utilization_chart(filtered_df)
                st.plotly_chart(fig_trend, use_container_width=True)
            with col_v2:
                fig_dist = create_regional_distribution_chart(filtered_df)
                st.plotly_chart(fig_dist, use_container_width=True)
                
    with tab_data:
        st.markdown(f"### 📋 Detail Rekaman Data Aktif ({filtered_df.height:,} baris diproses via Polars)")
        st.dataframe(filtered_df.to_pandas(), use_container_width=True)
