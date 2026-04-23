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
    auth, adjudicatarios, auditoria, setup, pla_contractacio, ppt,
)

logger = logging.getLogger(__name__)

# Create database tables with retry
import time
for i in range(15):
    try:
        Base.metadata.create_all(bind=engine)
        print("INFO:    Database tables synchronized")
        
        # Auto-run structural migrations to ensure new columns are added in production
        try:
            from scripts.migrate_enrichment import run_migration
            print("INFO:    Running schema migrations...")
            run_migration()
        except Exception as mig_e:
            print(f"WARNING: Schema migration failed: {mig_e}")
            
        break
    except Exception as e:
        if i == 14:
            print(f"ERROR:   Could not sync database after 30 seconds: {str(e)}")
        else:
            print(f"INFO:    Waiting for database... (attempt {i+1}/15)")
            time.sleep(2)


def run_migrations():
    """
    Aplica migracions de columnes noves a taules existents.
    Segur de re-executar: utilitza ADD COLUMN IF NOT EXISTS.
    """
    from sqlalchemy import text
    migrations = [
        # v2.1 — Pla de Contractació
        "ALTER TABLE empleados ADD COLUMN IF NOT EXISTS permiso_pla_contractacio BOOLEAN DEFAULT FALSE",
        "ALTER TABLE pla_contractacio_entrades ADD COLUMN IF NOT EXISTS estat VARCHAR(50) DEFAULT 'aprovat'",
        "ALTER TABLE pla_contractacio_entrades ADD COLUMN IF NOT EXISTS departamento_id INTEGER REFERENCES departamentos(id)",
        "ALTER TABLE contratos ADD COLUMN IF NOT EXISTS meses_aviso_vencimiento INTEGER NULL",
        """CREATE TABLE IF NOT EXISTS contrato_responsables (
            contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
            empleado_id INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
            PRIMARY KEY (contrato_id, empleado_id)
        )""",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"WARNING: Migration skipped or failed: {sql[:60]}... → {e}")

try:
    run_migrations()
    print("INFO:    Database migrations applied")
except Exception as e:
    print(f"WARNING: Could not run migrations: {e}")


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

from fastapi.exceptions import RequestValidationError
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"DEBUG: 422 Error at {request.url.path}")
    print(f"DEBUG: Errors: {exc.errors()}")
    print(f"DEBUG: Body: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(await request.body())},
    )

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
api_app.include_router(contratos.router_public)
api_app.include_router(cpv.router_public)
api_app.include_router(contratos_menores.router_public)

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
api_app.include_router(pla_contractacio.router, dependencies=secure_deps)
api_app.include_router(ppt.router, dependencies=secure_deps)

@api_app.exception_handler(RequestValidationError)
async def api_validation_exception_handler(request, exc):
    print(f"DEBUG API: 422 Error at {request.url.path}")
    print(f"DEBUG API: Errors: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


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
