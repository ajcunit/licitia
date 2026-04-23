from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from core.database import get_db
from core.dependencies import get_current_user
from services.ppt_service import PPTService
from core.rate_limiter import limiter
from starlette.requests import Request

router = APIRouter(prefix="/ppt", tags=["Generador PPT"])


class IndexRequest(BaseModel):
    urls: List[str]


class SectionRequest(BaseModel):
    title: str
    instructions: str
    urls: List[str]


@router.post("/generate-index")
@limiter.limit("5/minute")
async def generate_ppt_index(
    request: Request,
    payload: IndexRequest,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user)
):
    """Genera un índex suggerit de PPT basat en els documents escollits."""
    try:
        index_data = await PPTService.extract_index_from_documents(db, payload.urls)
        return {"success": True, "index": index_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-section")
@limiter.limit("10/minute")
async def generate_ppt_section(
    request: Request,
    payload: SectionRequest,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user)
):
    """Genera el text markdown d'un subapartat del PPT."""
    try:
        content = await PPTService.generate_section(
            db, payload.title, payload.instructions, payload.urls
        )
        return {"success": True, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ProyectoCreate(BaseModel):
    nombre: str

class DocumentoUpdateRequest(BaseModel):
    contingut_json: Optional[str] = None
    documentos_referencia_json: Optional[str] = None

@router.get("/proyectos")
def get_user_proyectos(db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    from models import ProyectoGeneracion
    proyectos = db.query(ProyectoGeneracion).filter(ProyectoGeneracion.empleado_id == current_user.id).order_by(ProyectoGeneracion.fecha_modificacion.desc()).all()
    res = []
    for p in proyectos:
        docs = [{"id": d.id, "tipo_documento": d.tipo_documento} for d in p.documentos]
        res.append({
            "id": p.id,
            "nombre": p.nombre,
            "fecha_modificacion": p.fecha_modificacion,
            "documentos": docs
        })
    return res

@router.post("/proyectos")
def create_proyecto(payload: ProyectoCreate, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    from models import ProyectoGeneracion, DocumentoGeneracion
    proyecto = ProyectoGeneracion(
        empleado_id=current_user.id,
        nombre=payload.nombre
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    
    for t in ["PPT", "PPA", "INFORME"]:
        doc = DocumentoGeneracion(
            proyecto_id=proyecto.id,
            tipo_documento=t,
            contingut_json="[]",
            documentos_referencia_json="[]"
        )
        db.add(doc)
    db.commit()
    return {"id": proyecto.id, "nombre": proyecto.nombre}

@router.get("/proyectos/{proyecto_id}")
def get_proyecto(proyecto_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    from models import ProyectoGeneracion
    p = db.query(ProyectoGeneracion).filter(ProyectoGeneracion.id == proyecto_id, ProyectoGeneracion.empleado_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no trobat")
    
    docs = {d.tipo_documento: {
        "id": d.id,
        "tipo_documento": d.tipo_documento,
        "contingut_json": d.contingut_json,
        "documentos_referencia_json": d.documentos_referencia_json
    } for d in p.documentos}
    
    return {
        "id": p.id,
        "nombre": p.nombre,
        "documentos": docs
    }

@router.put("/proyectos/{proyecto_id}/documentos/{tipo_documento}")
def update_documento(proyecto_id: int, tipo_documento: str, payload: DocumentoUpdateRequest, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    from models import DocumentoGeneracion, ProyectoGeneracion
    p = db.query(ProyectoGeneracion).filter(ProyectoGeneracion.id == proyecto_id, ProyectoGeneracion.empleado_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no trobat")
        
    doc = db.query(DocumentoGeneracion).filter(DocumentoGeneracion.proyecto_id == proyecto_id, DocumentoGeneracion.tipo_documento == tipo_documento).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no trobat")
        
    if payload.contingut_json is not None:
        doc.contingut_json = payload.contingut_json
    if payload.documentos_referencia_json is not None:
        doc.documentos_referencia_json = payload.documentos_referencia_json
        
    # Also update modified project date
    from sqlalchemy.sql import func
    p.fecha_modificacion = func.now()
    
    db.commit()
    return {"success": True}

@router.delete("/proyectos/{proyecto_id}")
def delete_proyecto(proyecto_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    from models import ProyectoGeneracion
    proyecto = db.query(ProyectoGeneracion).filter(ProyectoGeneracion.id == proyecto_id, ProyectoGeneracion.empleado_id == current_user.id).first()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no trobat")
    db.delete(proyecto)
    db.commit()
    return {"success": True}
