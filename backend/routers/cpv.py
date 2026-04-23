from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas
from core.database import get_db
from services.cpv_service import CPVService
from services.ai_service import AIService

router = APIRouter(prefix="/cpv", tags=["cpv"])
router_public = APIRouter(prefix="/cpv", tags=["cpv"])

@router_public.get("/sync/stream")
def sync_cpvs_stream(
    token: str = Query(..., description="JWT token for authentication"),
    db: Session = Depends(get_db)
):
    from core.security import decode_access_token
    from jose import JWTError
    from fastapi.responses import StreamingResponse
    import json
    
    try:
        payload = decode_access_token(token)
        email: str = payload.get("sub")
        if email is None:
            return StreamingResponse(iter([f'data: {json.dumps({"msg": "Token invàlid", "progress": 100, "error": True})}\n\n']), media_type="text/event-stream")
        current_user = db.query(models.Empleado).filter(models.Empleado.email == email).first()
        if not current_user or not current_user.activo:
            return StreamingResponse(iter([f'data: {json.dumps({"msg": "Usuari invàlid", "progress": 100, "error": True})}\n\n']), media_type="text/event-stream")
    except JWTError:
        return StreamingResponse(iter([f'data: {json.dumps({"msg": "Token expirat", "progress": 100, "error": True})}\n\n']), media_type="text/event-stream")
        
    if current_user.rol not in ["admin", "responsable_contratacion"]:
        return StreamingResponse(iter([f'data: {json.dumps({"msg": "No tens permissos", "progress": 100, "error": True})}\n\n']), media_type="text/event-stream")

    return StreamingResponse(CPVService.sync_cpvs_stream(db), media_type="text/event-stream")

@router.get("/search", response_model=List[schemas.CPV])
def search_cpvs(
    q: Optional[str] = None, 
    nivel: Optional[str] = None, 
    padre: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(models.CPV)
    if q:
        search = f"%{q}%"
        query = query.filter(models.CPV.codigo.ilike(search) | models.CPV.descripcion.ilike(search))
    if nivel:
        query = query.filter(models.CPV.nivel == nivel)
    if padre:
        query = query.filter(models.CPV.padre_codigo == padre)
    
    return query.limit(limit).all()

@router.post("/sync")
def sync_cpvs(db: Session = Depends(get_db)):
    return CPVService.sync_cpvs(db)

@router.post("/suggest-ai", response_model=schemas.CPVAIResponse)
async def suggest_cpvs_ai(request: schemas.CPVAIRequest, db: Session = Depends(get_db)):
    # AIService decidirà si usa Ollama o Gemini segons la configuració
    suggestions = await AIService.suggest_cpvs(db, request.descripcion)
    return {"suggestions": suggestions}
