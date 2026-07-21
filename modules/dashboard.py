import plotly.graph_objects as go
import plotly.express as px
import polars as pl
from modules.data_processor import detect_dynamic_period_polars

def create_kpi_indicator_cards(df: pl.DataFrame):
    """Generate interactive Plotly KPI Indicator cards for fast client-side rendering.
    
    Performance Note:
    Plotly Indicators are pre-configured SVG elements rendered directly on the client,
    avoiding heavy DOM re-computations and providing instantaneous visual feedback.
    """
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
        number={'suffix': "%", 'font': {'size': 36, 'color': "#3B82F6"}},
        title={'text': "Pemanfaatan Antrean", 'font': {'size': 14, 'color': "#94A3B8"}},
        domain={'x': [0, 0.48], 'y': [0, 1]}
    ))

    # KPI 2: Total Rekaman
    fig.add_trace(go.Indicator(
        mode="number",
        value=total_records,
        number={'font': {'size': 36, 'color': "#10B981"}},
        title={'text': "Total Rekaman Data", 'font': {'size': 14, 'color': "#94A3B8"}},
        domain={'x': [0.52, 1], 'y': [0, 1]}
    ))

    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(15,23,42,0.6)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=20, r=20, t=30, b=20),
        height=130
    )
    return fig

def create_utilization_chart(df: pl.DataFrame):
    """Generate main trend chart using Plotly graph objects."""
    if df is None or df.height == 0:
        fig = go.Figure()
        fig.update_layout(template="plotly_dark", title="Tidak Ada Data Tren")
        return fig

    # Find date and numeric columns
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
        fig.update_traces(line_color='#3B82F6', line_width=3)
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
        margin=dict(l=30, r=30, t=50, b=30),
        height=380
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
        margin=dict(l=30, r=30, t=50, b=30),
        height=380
    )
    return fig
