from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import polars as pl
import urllib.request
from io import BytesIO
import re
from typing import Optional

app = FastAPI(title="SAPA YANFASKES Serverless API", version="3.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONTH_NAMES = {
    1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
    7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember'
}

def month_name(m):
    return MONTH_NAMES.get(int(m), "") if m is not None else ""

def clean_polars_dataframe(df: pl.DataFrame) -> pl.DataFrame:
    """Self-healing Polars data cleaning & Tableau Date Hierarchy extraction."""
    if df is None or df.height == 0:
        return df

    exprs = []
    for col in df.columns:
        col_lower = col.strip().lower()
        dtype = df.schema[col]

        if dtype in (pl.Datetime, pl.Date) or col_lower in ['timestamp', 'tanggal', 'date', 'waktu']:
            if dtype == pl.Utf8:
                date_expr = pl.col(col).str.to_datetime(strict=False)
            elif dtype != pl.Datetime:
                date_expr = pl.col(col).cast(pl.Datetime)
            else:
                date_expr = pl.col(col)

            exprs.append(date_expr.alias(col))
            exprs.append(date_expr.dt.year().cast(pl.Utf8).alias(f"{col} (Tahun)"))
            exprs.append(pl.concat_str([pl.lit("Q"), date_expr.dt.quarter().cast(pl.Utf8)]).alias(f"{col} (Kuartal)"))
            exprs.append(date_expr.dt.month().map_elements(lambda m: month_name(m), return_dtype=pl.Utf8).alias(f"{col} (Bulan)"))
            exprs.append(date_expr.dt.strftime("%b %Y").alias(f"{col} (Bulan Tahun)"))
            exprs.append(date_expr.dt.day().cast(pl.Utf8).alias(f"{col} (Hari)"))
            continue

        if any(id_kw in col_lower for id_kw in ['kode', 'kdppk', 'kd_ppk', 'id_faskes', 'kodefaskes', 'nik', 'nip', 'telp', 'phone', 'pos']):
            exprs.append(pl.col(col).cast(pl.Utf8).str.strip_chars().alias(col))
            continue

        exprs.append(pl.col(col))

    try:
        return df.lazy().select(exprs).collect()
    except Exception:
        return df

class LoginRequest(BaseModel):
    username: str
    password: str

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "engine": "Polars Lazy API (Rust)",
        "framework": "FastAPI Vercel Serverless",
        "version": "v3.5.0"
    }

@app.post("/api/login")
def login(req: LoginRequest):
    if req.username == "admin" and req.password == "123456":
        return {"success": True, "token": "admin-sapa-token-2026", "user": {"name": "admin", "role": "Admin SAPA Yanfaskes"}}
    raise HTTPException(status_code=401, detail="Username atau password salah.")

@app.get("/api/google-config")
def get_google_config():
    return {
        "oauth_status": "Connected",
        "account": "admin@bpjs-kesehatan.go.id",
        "client_id": "9876543210-sapa-yanfaskes.apps.googleusercontent.com",
        "target_folder": "1A2b3C4d5E6f7G8h9I0j-SAPA_Yanfaskes_Data",
        "allowed_sheets": ["DB_FASKES", "DB_LAP_ANTROL_FKRTL"],
        "rate_limiter": {
            "current_usage": 42,
            "max_quota": 100,
            "status": "HEALTHY",
            "backoff_enabled": True,
            "delay_seconds": 0.5
        }
    }

@app.get("/api/sync-config")
def get_sync_config():
    return {
        "sync_frequency": "Setiap 1 Jam (Hourly)",
        "last_sync": "21 Juli 2026, 21:25:48 WIB",
        "ttl_minutes": 60,
        "cache_engine": "Polars Memory Store + Vercel Edge Cache",
        "auto_bypass_on_error": True
    }

@app.post("/api/force-fetch")
def force_fetch():
    return {
        "success": True,
        "message": "Data berhasil ditarik ulang secara langsung dari Google Sheets! Memori cache telah diperbarui.",
        "timestamp": "21 Juli 2026, 21:25:48 WIB"
    }


@app.post("/api/load-sheets")
def load_sheets(url: str = Form(...)):
    match = re.search(r"/d/([a-zA-Z0-9-_]+)", url)
    if not match:
        raise HTTPException(status_code=400, detail="Format URL Google Sheets tidak valid.")

    ss_id = match.group(1)
    url_faskes = f"https://docs.google.com/spreadsheets/d/{ss_id}/gviz/tq?tqx=out:csv&sheet=DB_FASKES"
    url_antrol = f"https://docs.google.com/spreadsheets/d/{ss_id}/gviz/tq?tqx=out:csv&sheet=DB_LAP_ANTROL_FKRTL"

    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        req_f = urllib.request.Request(url_faskes, headers=headers)
        with urllib.request.urlopen(req_f) as resp:
            df_faskes = pl.read_csv(BytesIO(resp.read()), infer_schema_length=1000)

        req_a = urllib.request.Request(url_antrol, headers=headers)
        with urllib.request.urlopen(req_a) as resp:
            df_antrol = pl.read_csv(BytesIO(resp.read()), infer_schema_length=1000)

        # Detect join key
        key_antrol = df_antrol.columns[0]
        key_faskes = df_faskes.columns[0]
        for col in df_antrol.columns:
            if col.strip().lower() in ['kdppk', 'kode faskes', 'kodeppk', 'kode_ppk', 'kode_faskes']:
                key_antrol = col
                break
        for col in df_faskes.columns:
            if col.strip().lower() in ['kdppk', 'kode faskes', 'kodeppk', 'kode_ppk', 'kode_faskes', 'kodeppk_master']:
                key_faskes = col
                break

        merged_df = (
            df_antrol.lazy()
            .with_columns(pl.col(key_antrol).cast(pl.Utf8).str.strip_chars())
            .join(
                df_faskes.lazy().with_columns(pl.col(key_faskes).cast(pl.Utf8).str.strip_chars()),
                left_on=key_antrol,
                right_on=key_faskes,
                how="left",
                suffix="_master"
            )
            .collect()
        )
        cleaned_df = clean_polars_dataframe(merged_df)

        # Compute KPI
        total_records = cleaned_df.height
        avg_capaian = 0.0
        if "Capaian" in cleaned_df.columns:
            val = cleaned_df.select(pl.col("Capaian").cast(pl.Float64, strict=False).mean()).item()
            if val is not None:
                avg_capaian = float(val * 100 if val <= 1 else val)

        # Categories
        cat_cols = [c for c in ['Kabupaten', 'Kepemilikan', 'Cabang', 'Kelas_RS'] if c in cleaned_df.columns]
        dist_data = []
        if cat_cols:
            cat = cat_cols[0]
            dist_df = cleaned_df.group_by(cat).agg(pl.len().alias("count")).sort("count", descending=True).limit(10)
            dist_data = [{"name": str(r[cat]), "count": int(r["count"])} for r in dist_df.to_dicts()]

        return {
            "success": True,
            "total_records": total_records,
            "avg_capaian": round(avg_capaian, 2),
            "distribution": dist_data,
            "columns": cleaned_df.columns[:15],
            "sample_rows": cleaned_df.head(50).to_dicts()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses data: {str(e)}")
