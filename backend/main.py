from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import httpx
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from database import engine, Base, SessionLocal
from routers import departamentos, empleados, contratos, sincronizacion, cpv, config, superbuscador, contratos_menores, favoritos, auth, adjudicatarios, auditoria
from services.scheduler_service import start_scheduler, shutdown_scheduler
from services.auth_service import AuthService
import models

# Create database tables with retry
import time
for i in range(5):
    try:
        Base.metadata.create_all(bind=engine)
        print("INFO:    Database tables synchronized")
        break
    except Exception as e:
        if i == 4:
            print(f"ERROR:   Could not sync database: {str(e)}")
            # Don't raise here, let it fail naturally if needed, 
            # though usually create_all failing means the app won't work
        else:
            print(f"INFO:    Waiting for database... (attempt {i+1}/5)")
            time.sleep(2)


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

# Mount frontend static files logic
# Search for static files in multiple possible locations
# 1. ./static (Docker default)
# 2. ../frontend/dist (Local dev)
# 3. ./frontend/dist (Alternative layout)
possible_paths = [
    os.path.join(os.path.dirname(__file__), "static"),
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")),
    os.path.join(os.getcwd(), "static"),
    os.path.join(os.getcwd(), "frontend", "dist")
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
    print(f"ERROR:   Frontend build NOT found. Searched in: {possible_paths}")

# Debug endpoint to check static files
@app.get("/api/health/static")
async def check_static():
    results = []
    for path in possible_paths:
        exists = os.path.exists(path)
        has_index = os.path.exists(os.path.join(path, "index.html")) if exists else False
        results.append({
            "path": path,
            "exists": exists,
            "has_index": has_index
        })
    return {
        "current_working_directory": os.getcwd(),
        "static_path_used": static_path,
        "search_results": results
    }

# SPA Catch-all (must be at the end)
@app.exception_handler(404)
async def spa_catch_all(request, exc):
    # Allow /api/ routes to return proper 404s
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})
    
    # Serve index.html for all other routes to let React handle the routing
    if static_path:
        index_file = os.path.join(static_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
    
    return JSONResponse(status_code=404, content={"detail": f"Frontend index.html not found. Search path: {static_path}"})


