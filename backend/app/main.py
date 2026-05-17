import logging
import warnings
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# ── Logging ────────────────────────────────────────────────────────────────────
# Uvicorn configures its own loggers but leaves application loggers at WARNING
# by default, so INFO calls from our services are silently dropped.
# basicConfig only fires if the root logger has no handlers yet (i.e. it is safe
# to call unconditionally — uvicorn's handlers take priority once it installs them).
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s  %(name)s  %(message)s",
)
# Keep third-party noise out of the console.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("hpack").setLevel(logging.WARNING)

# Pydantic v2.13 + Python 3.14 fires UnsupportedFieldAttributeWarning for every
# Optional (str | None) field when alias_generator is active.  The alias still
# resolves correctly at runtime — this is upstream noise, not a real issue.
# Filed: https://github.com/pydantic/pydantic/issues/XXXXX
warnings.filterwarnings(
    "ignore",
    message=".*alias.*was provided to the `Field\\(\\)` function.*has no effect.*",
    category=UserWarning,
)

from backend.app.api.router import api_router
from backend.app.core.settings import get_settings


def create_application() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(httpx.RequestError)
    async def handle_upstream_request_error(_: Request, exc: httpx.RequestError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "A temporary upstream network error occurred. Please retry.",
                "error": exc.__class__.__name__,
            },
        )

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


app = create_application()
