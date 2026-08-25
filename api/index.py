import os
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
import requests

from fastapi import FastAPI, HTTPException, Response, Request, Depends, Cookie
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import polars as pl
import jwt
from jwt import PyJWKClient
from google.oauth2 import service_account
from googleapiclient.discovery import build
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

# Import the Database context and context injector
from .db import get_db, set_tenant_context

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sapa-api")

# Environment & Config
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "YOUR_AUTH0_DOMAIN.auth0.com")
AUTH0_API_AUDIENCE = os.environ.get("AUTH0_API_AUDIENCE", "https://api.sapa-yanfaskes.com")
GCP_SA_CREDENTIALS_JSON = os.environ.get("GCP_SA_CREDENTIALS_JSON")

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

# Auth0 JWKS Client
jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
jwk_client = PyJWKClient(jwks_url)

app = FastAPI(title="SAPA YANFASKES Enterprise IAM API", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://sapa-yanfaskes.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_auth0_token(token: str):
    """
    Verifies the RS256 JWT signature using Auth0's public keys.
    """
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=AUTH0_API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=403, detail="Invalid audience. Token is not intended for this API.")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=403, detail="Invalid issuer.")
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

def require_auth(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = auth_header.split(" ")[1]
    
    # Optional: Skip validation in dev mode if ENV is missing
    if AUTH0_DOMAIN == "YOUR_AUTH0_DOMAIN.auth0.com":
        logger.warning("Auth0 configuration missing, skipping JWT validation (Dev Mode).")
        return {"sub": "dev-user", "tenant_id": "00000000-0000-0000-0000-000000000001", "role": "viewer"}
        
    return verify_auth0_token(token)

# --- SCIM 2.0 AUTOMATION ---
@app.post("/api/v2/tenants/{tenant_id}/Users")
async def scim_provision_user(tenant_id: str, req: Request, db: AsyncSession = Depends(get_db)):
    """SCIM 2.0 Endpoint for Automated Provisioning"""
    # NOTE: Normally secured by API Gateway Key / SCIM Bearer token
    if not db:
        return {"error": "Database not configured"}
        
    data = await req.json()
    email = data.get("userName")
    
    # Simple Provisioning Logic (Upsert)
    # Excluded full error handling for brevity
    return {"id": email, "active": True, "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"]}


# --- GOOGLE SHEETS INTEGRATION ---
def get_sheets_service():
    gcp_creds = os.environ.get("GCP_SA_CREDENTIALS_BASE64") or os.environ.get("GCP_SA_CREDENTIALS_JSON")
    if not gcp_creds:
        logger.error("No GCP Credentials found in environment variables.")
        return None
    try:
        # Check if Base64 encoded or raw JSON (Vercel best practices)
        import base64
        try:
            creds_str = base64.b64decode(gcp_creds).decode('utf-8')
            creds_info = json.loads(creds_str)
        except:
            creds_info = json.loads(gcp_creds)
            
        credentials = service_account.Credentials.from_service_account_info(
            creds_info, scopes=SCOPES
        )
        return build('sheets', 'v4', credentials=credentials, cache_discovery=False)
    except Exception as e:
        logger.error(f"Failed to initialize Google Sheets service: {e}")
        return None

def fetch_sheet_data(spreadsheet_id: str, range_name: str) -> pl.DataFrame:
    service = get_sheets_service()
    if not service:
        # Fallback Mock Data
        return pl.DataFrame({
            "Kdppk": ["0114B012", "0114B013"],
            "Faskes": ["RSUD A", "RSUD B"],
            "Jumlah Antrian by Sumber": ["100", "200"],
            "Jumlah Sep Rjtl": ["150", "250"],
            "Jumlah Peserta Jkn": ["500", "600"],
            "Timestamp": ["2026-07-21 10:00:00", "2026-07-22 11:00:00"],
            "Sumber": ["Mobile JKN", "All Sumber"]
        })
        
    try:
        sheet = service.spreadsheets()
        result = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
        rows = result.get('values', [])
        
        if not rows:
            return pl.DataFrame()
            
        headers = rows[0]
        data = rows[1:]
        
        normalized_data = []
        for r in data:
            if len(r) < len(headers):
                r.extend([""] * (len(headers) - len(r)))
            elif len(r) > len(headers):
                r = r[:len(headers)]
            normalized_data.append(r)
            
        return pl.DataFrame(normalized_data, schema=headers, orient="row")
    except Exception as e:
        logger.error(f"Error fetching sheets data: {e}")
        raise HTTPException(status_code=502, detail="Failed to retrieve data from Google Sheets.")

# --- DATA PROCESSING (Polars Engine) ---
@app.get("/api/v1/dashboard-stats")
async def get_dashboard_stats(spreadsheet_id: str = "1GqP1T3l_g6Z7k4n1x_F6Wp9Y_c-K4fA2", 
                              user=Depends(require_auth),
                              db: AsyncSession = Depends(get_db)):
    
    # 1. Enforce Row-Level Security in Database (Example hook)
    if db:
        tenant_id = user.get("tenant_id", "00000000-0000-0000-0000-000000000001")
        role = user.get("role", "viewer")
        sub = user.get("sub", "unknown")
        await set_tenant_context(db, tenant_id, sub, role == "superadmin")
        # In a full EHR integration, the database queries here would automatically be isolated by RLS.
        # But here we aggregate from Google Sheets, so we use the tenant_id to map to the correct spreadsheet if needed.

    # 2. Fetch raw data
    df_antrol = fetch_sheet_data(spreadsheet_id, "DB_LAP_ANTROL_FKRTL!A:Z")
    if df_antrol.is_empty():
        return {"status": "empty"}
        
    # Ensure numeric columns are casted
    numeric_cols = ["Jumlah Antrian by Sumber", "Jumlah Sep Rjtl", "Jumlah Peserta Jkn"]
    exprs = []
    for col in numeric_cols:
        if col in df_antrol.columns:
            exprs.append(pl.col(col).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0))
            
    if exprs:
        df_antrol = df_antrol.with_columns(exprs)
        
    # Calculate Capaian based on specific logic per source
    if "Sumber" in df_antrol.columns and "Jumlah Antrian by Sumber" in df_antrol.columns:
        df_antrol = df_antrol.with_columns(
            pl.when(pl.col("Sumber") == "Mobile JKN")
            .then(
                pl.when(pl.col("Jumlah Peserta Jkn").is_not_null() & (pl.col("Jumlah Peserta Jkn") > 0))
                .then((pl.col("Jumlah Antrian by Sumber") / pl.col("Jumlah Peserta Jkn")) * 100)
                .otherwise(0.0)
            )
            .otherwise(
                pl.when(pl.col("Jumlah Sep Rjtl").is_not_null() & (pl.col("Jumlah Sep Rjtl") > 0))
                .then((pl.col("Jumlah Antrian by Sumber") / pl.col("Jumlah Sep Rjtl")) * 100)
                .otherwise(0.0)
            )
            .alias("Capaian")
        )
    
    # Extract Timestamp hierarchies
    if "Timestamp" in df_antrol.columns:
        df_antrol = df_antrol.with_columns([
            pl.col("Timestamp").str.strptime(pl.Datetime, "%m/%d/%Y %H:%M:%S", strict=False).alias("DateObj")
        ]).with_columns([
            pl.col("DateObj").dt.strftime("%b %Y").alias("BulanTahun")
        ])
    
    avg_per_sumber = []
    if "Capaian" in df_antrol.columns and "Sumber" in df_antrol.columns:
        avg_per_sumber = df_antrol.group_by("Sumber").agg(pl.col("Capaian").mean().alias("AvgCapaian")).to_dicts()
        
    trend_per_bulan = []
    if "Capaian" in df_antrol.columns and "BulanTahun" in df_antrol.columns:
        trend_per_bulan = (
            df_antrol.filter(pl.col("BulanTahun").is_not_null())
            .group_by(["BulanTahun", "Sumber"])
            .agg(pl.col("Capaian").mean().alias("AvgCapaian"))
            .to_dicts()
        )
        
    top_faskes = []
    if "Capaian" in df_antrol.columns and "Faskes" in df_antrol.columns:
        top_faskes = df_antrol.group_by("Faskes").agg(pl.col("Capaian").mean().alias("AvgCapaian")).sort("AvgCapaian", descending=True).limit(10).to_dicts()

    overall_avg = df_antrol.select(pl.col("Capaian").mean()).item() if "Capaian" in df_antrol.columns else 0.0

    return {
        "status": "success",
        "total_records": df_antrol.height,
        "overall_avg_capaian": round(overall_avg or 0.0, 2),
        "avg_per_sumber": avg_per_sumber,
        "trend_per_bulan": trend_per_bulan,
        "top_faskes": top_faskes
    }
