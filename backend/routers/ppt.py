from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from core.database import get_db
from core.dependencies import get_current_user
from services.ppt_service import PPTService
from core.rate_limiter import sync_api_limiter, slowapi_limiter
from starlette.requests import Request

router = APIRouter(prefix="/ppt", tags=["Generador PPT"])


class IndexRequest(BaseModel):
    urls: List[str]


class SectionRequest(BaseModel):
    title: str
    instructions: str
    urls: List[str]


@router.post("/generate-index")
@slowapi_limiter.limit("5/minute")
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
@slowapi_limiter.limit("10/minute")
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
