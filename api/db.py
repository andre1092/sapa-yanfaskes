import os
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from fastapi import HTTPException

logger = logging.getLogger("sapa-api-db")

DATABASE_URL = os.environ.get("DATABASE_URL")

# Engine initialization
engine = None
AsyncSessionLocal = None

if DATABASE_URL:
    try:
        # If the user provides a standard postgres URL, convert it to asyncpg
        if DATABASE_URL.startswith("postgresql://"):
            DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)
        AsyncSessionLocal = sessionmaker(
            engine, class_=AsyncSession, expire_on_commit=False
        )
    except Exception as e:
        logger.error(f"Failed to initialize database engine: {e}")

async def get_db():
    if not AsyncSessionLocal:
        logger.warning("DATABASE_URL is not set. Database operations will be mocked.")
        yield None
        return
        
    async with AsyncSessionLocal() as session:
        yield session

async def set_tenant_context(session: AsyncSession, tenant_id: str, user_id: str, is_superadmin: bool = False):
    """
    Injects the contextual variables into the PostgreSQL transaction for RLS evaluation.
    Must be called before any data queries within the session.
    """
    if not session:
        return
        
    try:
        query = text(
            "SELECT set_tenant_context(:tenant_id::UUID, :user_id::UUID, :is_superadmin::BOOLEAN)"
        )
        await session.execute(query, {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "is_superadmin": is_superadmin
        })
    except Exception as e:
        logger.error(f"Failed to set tenant context in database: {e}")
        raise HTTPException(status_code=500, detail="Database context isolation failure.")
