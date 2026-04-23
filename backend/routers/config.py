from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import models, schemas
from core.database import get_db
import services.ollama_service as ollama_service
from services.auth_service import get_current_user

router = APIRouter(prefix="/config", tags=["configuracion"])

@router.get("/", response_model=List[schemas.Configuracion])
def get_all_config(db: Session = Depends(get_db)):
    return db.query(models.Configuracion).all()

@router.get("/ollama-models", response_model=List[str])
async def get_ollama_models(db: Session = Depends(get_db)):
    return await ollama_service.OllamaService.get_available_models(db)

@router.get("/{clave}", response_model=schemas.Configuracion)
def get_config(clave: str, db: Session = Depends(get_db)):
    cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == clave).first()
    if not cfg:
        # Check if it's one of the defaults we want to return
        if clave == "ollama_url":
            return {"id": 0, "clave": "ollama_url", "valor": "http://host.docker.internal:11434", "descripcion": "URL de l'API d'Ollama", "updated_at": None}
        if clave == "cpv_api_url":
            return {"id": 0, "clave": "cpv_api_url", "valor": "https://analisi.transparenciacatalunya.cat/resource/wxdw-5eyv.json?$limit=50000", "descripcion": "URL de l'API de CPVs (Open Data)", "updated_at": None}
        if clave == "ollama_model":
            return {"id": 0, "clave": "ollama_model", "valor": "llama3", "descripcion": "Nom del model d'Ollama", "updated_at": None}
        if clave == "sync_auto_enabled":
            return {"id": 0, "clave": "sync_auto_enabled", "valor": "false", "descripcion": "Activa o desactiva la sincronització automàtica", "updated_at": None}
        if clave == "sync_cron_hora":
            return {"id": 0, "clave": "sync_cron_hora", "valor": "03:00", "descripcion": "Hora d'execució diària (HH:MM)", "updated_at": None}
        if clave == "sync_cron_days":
            return {"id": 0, "clave": "sync_cron_days", "valor": "*", "descripcion": "Dies de la setmana per executar (ex: mon,tue o *)", "updated_at": None}
        if clave == "sync_cron_timezone":
            return {"id": 0, "clave": "sync_cron_timezone", "valor": "Europe/Madrid", "descripcion": "Zona horària d'execució", "updated_at": None}
        if clave == "ldap_server":
            return {"id": 0, "clave": "ldap_server", "valor": "", "descripcion": "Servidor LDAP/AD (ex: ldap://10.0.0.1)", "updated_at": None}
        if clave == "ldap_port":
            return {"id": 0, "clave": "ldap_port", "valor": "389", "descripcion": "Port del servidor LDAP", "updated_at": None}
        if clave == "ldap_base_dn":
            return {"id": 0, "clave": "ldap_base_dn", "valor": "", "descripcion": "Base DN (ex: dc=empresa,dc=local)", "updated_at": None}
        if clave == "ldap_user_domain":
            return {"id": 0, "clave": "ldap_user_domain", "valor": "", "descripcion": "Domini d'usuari (ex: @empresa.local)", "updated_at": None}
        if clave == "ldap_enabled":
            return {"id": 0, "clave": "ldap_enabled", "valor": "false", "descripcion": "Activa l'autenticació LDAP", "updated_at": None}
        if clave == "dashboard_mesos_caducitat":
            return {"id": 0, "clave": "dashboard_mesos_caducitat", "valor": "3", "descripcion": "Mesos d'avís per venciment de contracte per defecte", "updated_at": None}
        
        raise HTTPException(status_code=404, detail="Configuració no trobada")
    return cfg

@router.put("/{clave}", response_model=schemas.Configuracion)
def update_config(
    clave: str, 
    cfg_update: schemas.ConfiguracionUpdate, 
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user)
):
    if current_user.rol not in ["admin", "responsable_contratacion"]:
        raise HTTPException(status_code=403, detail="No tens permissos per modificar la configuració")
    cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == clave).first()
    if not cfg:
        # Create it if it doesn't exist
        cfg = models.Configuracion(clave=clave, valor=cfg_update.valor, descripcion=cfg_update.descripcion)
        db.add(cfg)
    else:
        if cfg_update.valor is not None:
            cfg.valor = cfg_update.valor
        if cfg_update.descripcion is not None:
            cfg.descripcion = cfg_update.descripcion
            
    db.commit()
    
    if clave == 'dashboard_mesos_caducitat':
        import services.alerta_service as alerta_service
        alerta_service.update_and_notify_expirations(db)
        
    db.refresh(cfg)
    return cfg

@router.post("/scheduler/reload")
def reload_scheduler(
    current_user: models.Empleado = Depends(get_current_user)
):
    if current_user.rol not in ["admin", "responsable_contratacion"]:
        raise HTTPException(status_code=403, detail="No tens permissos per recarregar el planificador")
    from services.scheduler_service import reload_scheduler as _reload_scheduler
    _reload_scheduler()
    return {"status": "ok", "message": "Scheduler recarregat."}
