from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import httpx
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base, SessionLocal
from routers import departamentos, empleados, contratos, sincronizacion, cpv, config, superbuscador, contratos_menores, favoritos, auth, adjudicatarios, auditoria
from services.scheduler_service import start_scheduler, shutdown_scheduler
from services.auth_service import AuthService
import models

# Create database tables
Base.metadata.create_all(bind=engine)

def init_db():
    db = SessionLocal()
    try:
        admin_user = db.query(models.Empleado).filter(models.Empleado.email == "admin@admin.com").first()
        if not admin_user:
            hashed_pw = AuthService.get_password_hash("admin123")
            new_admin = models.Empleado(
                nombre="Administrador",
                email="admin@admin.com",
                rol="admin",
                hashed_password=hashed_pw
            )
            db.add(new_admin)
            db.commit()
    finally:
        db.close()

init_db()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    yield
    # Shutdown
    shutdown_scheduler()

app = FastAPI(
    title="LicitIA",
    description="API de Gestió Intel·ligent de Contractes Públics",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from fastapi import Depends
from services.auth_service import get_current_user

# API Router for all endpoints
api_app = FastAPI()

# Auth is public
api_app.include_router(auth.router)

# SSE stream endpoints
api_app.include_router(sincronizacion.router_public)

# Protected APIs
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

@api_app.get("/proxy-json")
def proxy_json(url: str):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = httpx.get(url, timeout=30.0, follow_redirects=True, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching JSON: {str(e)}")

@api_app.get("/ping")
def ping():
    return {"ping": "pong"}

@api_app.get("/health")
def health_check():
    return {"status": "healthy"}

# Include the API router into the main app with /api prefix
app.mount("/api", api_app)

# Mount frontend static files
# In Docker, frontend files will be in backend/static/
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_path):
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")

    # Catch-all for SPA client-side routing
    @app.exception_handler(404)
    async def not_found_handler(request, exc):
        return FileResponse(os.path.join(static_path, "index.html"))
else:
    print(f"Warning: Static files path not found at {static_path}")
