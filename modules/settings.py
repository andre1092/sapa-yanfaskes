def get_system_status():
    """Return system information for settings overview."""
    return {
        "version": "v3.0.0 (High-Performance Engine)",
        "data_engine": "Polars Lazy API (Multi-threaded Rust)",
        "ui_framework": "Taipy GUI Reactive State",
        "visualization_engine": "Plotly SVG/WebGL Client Pre-configured",
        "excel_engine": "Polars fastexcel / calamine",
        "status": "Operational & High-Speed"
    }
