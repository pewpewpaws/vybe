from fastapi import APIRouter

from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.discovery import router as discovery_router
from backend.app.api.routes.health import router as health_router
from backend.app.api.routes.matches import router as matches_router
from backend.app.api.routes.onboarding import router as onboarding_router
from backend.app.api.routes.profile import router as profile_router
from backend.app.api.routes.vibe_metrics import router as vibe_metrics_router
from backend.app.api.routes.requests import router as requests_router
from backend.app.api.routes.spotify import router as spotify_router
from backend.app.api.routes.verify import router as verify_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(profile_router, prefix="/profile", tags=["profile"])
api_router.include_router(vibe_metrics_router, prefix="/profile", tags=["profile"])
api_router.include_router(onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(spotify_router, prefix="/spotify", tags=["spotify"])
api_router.include_router(verify_router, prefix="/verify", tags=["verify"])
api_router.include_router(discovery_router, prefix="/discovery", tags=["discovery"])
api_router.include_router(requests_router, prefix="/requests", tags=["requests"])
api_router.include_router(matches_router, prefix="/matches", tags=["matches"])
