from fastapi import Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.datasets import router as datasets_router
from app.api.data_quality import router as data_quality_router
from app.api.pipelines import router as pipelines_router
from app.api.analytics import router as analytics_router
from app.api.admin import router as admin_router
from app.api.dependencies import get_current_user

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db

from app.models.user import User

from app.services.rbac import get_effective_role, require_permission


# =========================================================
# APPLICATION
# =========================================================

app = FastAPI(
    title="DataForge API",
    description=(
        "Production-Grade AI Data Engineering & Analytics Platform"
    ),
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# API ROUTERS
# =========================================================

app.include_router(auth_router)
app.include_router(datasets_router)
app.include_router(data_quality_router)
app.include_router(pipelines_router)
app.include_router(analytics_router)
app.include_router(admin_router)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
async def root():
    return {
        "message": "DataForge API is running",
        "version": "1.0.0",
        "status": "healthy",
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "dataforge-api",
    }


# =========================================================
# DATABASE HEALTH CHECK
# =========================================================

@app.get("/health/database")
async def database_health_check():

    try:

        async with AsyncSessionLocal() as session:

            result = await session.execute(
                text("SELECT 1")
            )

            value = result.scalar()

        return {
            "database": "connected",
            "test_result": value,
            "status": "healthy",
        }

    except Exception:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "database": "disconnected",
                "status": "unhealthy",
            },
        )


# =========================================================
# CURRENT USER
# =========================================================

@app.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):

    # -----------------------------------------------------
    # Safely obtain the user's role
    # -----------------------------------------------------

    role = await get_effective_role(current_user, db)

    # -----------------------------------------------------
    # Return authenticated user information
    # -----------------------------------------------------

    return {
        "id": str(current_user.id),

        "email": current_user.email,

        "first_name": current_user.first_name,

        "last_name": current_user.last_name,

        "organization_id": str(
            current_user.organization_id
        ),

        "is_active": current_user.is_active,

        "role": role,
    }


# =========================================================
# ADMIN RBAC TEST
# =========================================================

@app.get("/admin-test")
async def admin_test(
    current_user: User = Depends(
        require_permission("admin:manage")
    ),
):

    return {
        "message": "RBAC permission check passed",

        "user": current_user.email,

        "permission": "dataset:delete",

        "role": getattr(
            current_user,
            "role",
            None,
        ),
    }