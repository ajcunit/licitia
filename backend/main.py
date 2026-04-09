"""
LicitIA v2 — Main Application
Seguretat per disseny: cap secret hardcoded, rate limiting, security headers.
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from contextlib import asynccontextmanager
from slowapi.errors import RateLimitExceeded
import os
import logging

from core.config import settings
from core.database import Base, engine, SessionLocal
from core.rate_limiter import limiter, rate_limit_exceeded_handler
from core.dependencies import get_current_user
from middleware.security_headers import SecurityHeadersMiddleware
from services.external_api_client import ExternalAPIClient
from services.scheduler_service import start_scheduler, shutdown_scheduler

import models
from routers import (
    departamentos, empleados, contratos, sincronizacion,
    cpv, config, superbuscador, contratos_menores, favoritos,
    auth, adjudicatarios, auditoria, setup, ppt,
)

logger = logging.getLogger(__name__)

# Create database tables with retry
import time
for i in range(15):
    try:
        Base.metadata.create_all(bind=engine)
        print("INFO:    Database tables synchronized")
        # NO es crea cap admin automàticament — el wizard s'encarrega
        break
    except Exception as e:
        if i == 14:
            print(f"ERROR:   Could not sync database after 30 seconds: {str(e)}")
        else:
            print(f"INFO:    Waiting for database... (attempt {i+1}/15)")
            time.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    description="API de Gestió Intel·ligent de Contractes Públics",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# === Middleware ===
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # NO "*" — configurable via env
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-View-Mode"],
)

# === API Sub-app ===
api_app = FastAPI()

# Endpoints públics (sense auth)
api_app.include_router(setup.router)
api_app.include_router(auth.router)

# SSE stream (auth via query param)
api_app.include_router(sincronizacion.router_public)

# Endpoints protegits
secure_deps = [Depends(get_current_user)]
api_app.include_router(departamentos.router, dependencies=secure_deps)
api_app.include_router(empleados.router, dependencies=secure_deps)
api_app.include_router(contratos.router, dependencies=secure_deps)
api_app.include_router(sincronizacion.router, dependencies=secure_deps)
api_app.include_router(cpv.router, dependencies=secure_deps)
api_app.include_router(config.router, dependencies=secure_deps)
api_app.include_router(superbuscador.router, dependencies=secure_deps)
api_app.include_router(contratos_menores.router, dependencies=secure_deps)
api_app.include_router(favoritos.router, dependencies=secure_deps)
api_app.include_router(adjudicatarios.router)
api_app.include_router(auditoria.router, dependencies=secure_deps)
api_app.include_router(ppt.router, dependencies=secure_deps)


# Proxy JSON SEGUR — whitelist de dominis + rate limit
@api_app.get("/proxy-json")
async def proxy_json(url: str):
    """Proxy JSON amb whitelist de dominis i rate limit extern."""
    try:
        return await ExternalAPIClient.proxy_fetch(url)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")


@api_app.get("/ping")
def ping():
    return {"ping": "pong"}


@api_app.get("/health")
def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}


# Mount API
app.mount("/api", api_app)


# === Frontend Static Files ===
possible_paths = [
    os.path.join(os.path.dirname(__file__), "static"),
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")),
    os.path.join(os.getcwd(), "static"),
    os.path.join(os.getcwd(), "frontend", "dist"),
]

static_path = None
for path in possible_paths:
    if os.path.exists(os.path.join(path, "index.html")):
        static_path = path
        break

if static_path:
    print(f"INFO:    Found static files at {static_path}")
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
else:
    print(f"WARNING: Frontend build NOT found. Searched in: {possible_paths}")


# SPA Catch-all
@app.exception_handler(404)
async def spa_catch_all(request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})
    if static_path:
        index_file = os.path.join(static_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
    return JSONResponse(status_code=404, content={"detail": "Frontend not found"})
