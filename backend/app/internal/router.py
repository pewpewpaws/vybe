from fastapi import APIRouter

from backend.app.internal.routes.experiments import router as experiments_router

internal_router = APIRouter()
internal_router.include_router(experiments_router, prefix="/experiments", tags=["internal"])
