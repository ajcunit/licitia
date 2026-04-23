from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func, desc, nulls_last
from typing import List, Optional, Dict
from datetime import date, datetime
from core.database import get_db
import models
import schemas
from services.auth_service import get_current_user
from services.access_control import apply_department_filter
from services.enrichment_service import EnrichmentService
from fastapi import Header

router = APIRouter(prefix="/contratos", tags=["contratos"])
router_public = APIRouter(prefix="/contratos", tags=["contratos"])


@router.get("/", response_model=List[schemas.ContratoListItem])
def list_contratos(
    skip: int = 0,
    limit: int = 500,
    estat_actual: Optional[str] = None,
    tipus_contracte: Optional[str] = None,
    procediment: Optional[str] = None,
    fecha_inicio_desde: Optional[date] = None,
    fecha_inicio_hasta: Optional[date] = None,
    importe_min: Optional[float] = None,
    importe_max: Optional[float] = None,
    adjudicatari_nom: Optional[str] = None,
    cpv_principal_codi: Optional[str] = None,
    departamento_id: Optional[int] = None,
    estado_interno: Optional[str] = None,
    busqueda: Optional[str] = None,
    te_prorroga: Optional[bool] = None,
    alerta_finalitzacio: Optional[bool] = None,
    possiblement_finalitzat: Optional[bool] = None,
    sense_departament: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user),
    x_view_mode: str = Header(alias="X-View-Mode", default="user")
):
    query = db.query(models.Contrato)
    query = apply_department_filter(query, models.Contrato, current_user, x_view_mode)
    
    if estat_actual:
        if estat_actual == "Sin estado":
            query = query.filter(or_(models.Contrato.estat_actual == None, models.Contrato.estat_actual == ""))
        else:
            query = query.filter(models.Contrato.estat_actual == estat_actual)
    if tipus_contracte:
        query = query.filter(models.Contrato.tipus_contracte == tipus_contracte)
    if procediment:
        query = query.filter(models.Contrato.procediment == procediment)
    if fecha_inicio_desde:
        query = query.filter(models.Contrato.data_inici >= fecha_inicio_desde)
    if fecha_inicio_hasta:
        query = query.filter(models.Contrato.data_inici <= fecha_inicio_hasta)
    if importe_min is not None:
        query = query.filter(models.Contrato.import_adjudicacio_amb_iva >= importe_min)
    if importe_max is not None:
        query = query.filter(models.Contrato.import_adjudicacio_amb_iva <= importe_max)
    if adjudicatari_nom:
        query = query.filter(models.Contrato.adjudicatari_nom.ilike(f"%{adjudicatari_nom}%"))
    if cpv_principal_codi:
        query = query.filter(models.Contrato.cpv_principal_codi == cpv_principal_codi)
    if departamento_id:
        query = query.filter(models.Contrato.departamentos.any(models.Departamento.id == departamento_id))
    if estado_interno:
        query = query.filter(models.Contrato.estado_interno == estado_interno)
    if te_prorroga is not None:
        if te_prorroga:
            query = query.filter(models.Contrato.prorrogues.any())
        else:
            query = query.filter(~models.Contrato.prorrogues.any())
    if alerta_finalitzacio is not None:
        query = query.filter(models.Contrato.alerta_finalitzacio == alerta_finalitzacio)
    if possiblement_finalitzat is not None:
        query = query.filter(models.Contrato.possiblement_finalitzat == possiblement_finalitzat)
    if sense_departament is not None:
        if sense_departament:
            query = query.filter(~models.Contrato.departamentos.any())
        else:
            query = query.filter(models.Contrato.departamentos.any())
    if busqueda:
        search_term = f"%{busqueda}%"
        query = query.filter(
            or_(
                models.Contrato.codi_expedient.ilike(search_term),
                models.Contrato.objecte_contracte.ilike(search_term),
                models.Contrato.adjudicatari_nom.ilike(search_term)
            )
        )

    # Pick one representative contract per codi_expedient (lowest id) among those matching filters
    representative_ids = query.with_entities(
        func.min(models.Contrato.id).label('min_id')
    ).group_by(models.Contrato.codi_expedient).subquery()
    
    # Final results come from filtering the main query for these IDs
    results = db.query(models.Contrato).filter(models.Contrato.id.in_(
        db.query(representative_ids.c.min_id)
    )).order_by(models.Contrato.data_publicacio.desc()).offset(skip).limit(limit).all()
    
    if not results:
        return []

    # Calculate lot counts for the displayed expedients efficiently
    expedients = [r.codi_expedient for r in results]
    counts = db.query(
        models.Contrato.codi_expedient, 
        func.count(models.Contrato.id)
    ).filter(
        models.Contrato.codi_expedient.in_(expedients)
    ).group_by(models.Contrato.codi_expedient).all()
    
    counts_dict = {c[0]: c[1] for c in counts}

    # Inject num_lots into response
    response_list = []
    for r in results:
        item = schemas.ContratoListItem.model_validate(r)
        item.num_lots = counts_dict.get(r.codi_expedient, 1)
        item.num_prorrogues = r.num_prorrogues
        item.num_modificacions = r.num_modificacions
        response_list.append(item)
        
    return response_list


@router.get("/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(
    year: Optional[int] = Query(None, description="Filtrar per any de la data d'inici"),
    importe_min: Optional[float] = Query(None, description="Import mínim d'adjudicació"),
    importe_max: Optional[float] = Query(None, description="Import màxim d'adjudicació"),
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user),
    x_view_mode: str = Header(alias="X-View-Mode", default="user")
):
    base_query = apply_department_filter(db.query(models.Contrato), models.Contrato, current_user, x_view_mode)
    base_menores_query = apply_department_filter(db.query(models.ContratoMenor), models.ContratoMenor, current_user, x_view_mode)

    if year is not None:
        base_query = base_query.filter(func.extract('year', models.Contrato.data_inici) == year)
        base_menores_query = base_menores_query.filter(models.ContratoMenor.exercici == year)
        
    if importe_min is not None:
        base_query = base_query.filter(models.Contrato.import_adjudicacio_amb_iva >= importe_min)
        base_menores_query = base_menores_query.filter(models.ContratoMenor.import_adjudicacio >= importe_min)
        
    if importe_max is not None:
        base_query = base_query.filter(models.Contrato.import_adjudicacio_amb_iva <= importe_max)
        base_menores_query = base_menores_query.filter(models.ContratoMenor.import_adjudicacio <= importe_max)

    # Total contratos
    total_contratos = base_query.count()
    
    # Contratos por estado
    estados = base_query.with_entities(
        models.Contrato.estat_actual,
        func.count(models.Contrato.id)
    ).group_by(models.Contrato.estat_actual).all()
    contratos_por_estado = {estado or "Sin estado": count for estado, count in estados}
    
    # Pendientes de aprobación
    pendientes = base_query.filter(
        models.Contrato.estado_interno == 'pendiente_aprobacion'
    ).count()
    
    # Total importe
    total_importe = base_query.with_entities(func.sum(models.Contrato.import_adjudicacio_amb_iva)).scalar() or 0
    
    # Última sincronización
    ultima_sync = db.query(models.Sincronizacion).filter(
        models.Sincronizacion.estado == 'exitosa'
    ).order_by(models.Sincronizacion.fecha_hora_fin.desc()).first()
    
    # Contratos este mes
    hoy = date.today()
    primer_dia_mes = date(hoy.year, hoy.month, 1)
    contratos_mes = base_query.filter(
        models.Contrato.fecha_primera_sincronizacion >= primer_dia_mes
    ).count()
    
    # Top adjudicatarios
    top_adj = base_query.with_entities(
        models.Contrato.adjudicatari_nom,
        func.count(models.Contrato.id).label('total_contratos'),
        func.sum(models.Contrato.import_adjudicacio_amb_iva).label('volumen_total')
    ).filter(
        models.Contrato.adjudicatari_nom.isnot(None)
    ).group_by(
        models.Contrato.adjudicatari_nom
    ).order_by(
        nulls_last(desc(func.sum(models.Contrato.import_adjudicacio_amb_iva)))
    ).limit(10).all()
    
    top_adjudicatarios_list = [adj for adj, count, vol in top_adj if adj]
    contracts_by_adj = {}
    if top_adjudicatarios_list:
        contracts = base_query.filter(models.Contrato.adjudicatari_nom.in_(top_adjudicatarios_list)).with_entities(
            models.Contrato.adjudicatari_nom,
            models.Contrato.codi_expedient,
            models.Contrato.objecte_contracte,
            models.Contrato.import_adjudicacio_amb_iva
        ).order_by(desc(models.Contrato.import_adjudicacio_amb_iva)).all()
        
        for c in contracts:
            if c.adjudicatari_nom not in contracts_by_adj:
                contracts_by_adj[c.adjudicatari_nom] = []
            contracts_by_adj[c.adjudicatari_nom].append({
                "codi_expedient": c.codi_expedient,
                "objecte": c.objecte_contracte,
                "importe": float(c.import_adjudicacio_amb_iva or 0)
            })
    
    top_adjudicatarios = [
        {
            "nombre": adj, 
            "contratos": count, 
            "volumen": float(vol or 0),
            "desglose": contracts_by_adj.get(adj, [])
        }
        for adj, count, vol in top_adj
    ]
    
    # Contratos próximos a finalizar
    contratos_proximos = base_query.filter(
        models.Contrato.alerta_finalitzacio == True
    ).count()
    
    # Contratos posiblemente finalizados
    contratos_finalizados = base_query.filter(
        models.Contrato.possiblement_finalitzat == True
    ).count()
    
    # Contratos por departamento
    # Use a subquery approach to avoid double-counting amounts
    # when a contract belongs to multiple departments
    from sqlalchemy import case, literal_column
    
    # Get all contracts with their departments via the M2M relationship
    dept_query = base_query.outerjoin(
        models.Contrato.departamentos
    ).with_entities(
        func.coalesce(models.Departamento.nombre, 'No assignat').label('departamento'),
        models.Contrato.id,
        models.Contrato.import_adjudicacio_amb_iva
    ).all()
    
    # Aggregate manually to avoid SUM double-counting
    dept_stats = {}
    for dept_name, contrato_id, importe in dept_query:
        dept_key = str(dept_name)
        if dept_key not in dept_stats:
            dept_stats[dept_key] = {"ids": set(), "volumen": 0.0}
        if contrato_id not in dept_stats[dept_key]["ids"]:
            dept_stats[dept_key]["ids"].add(contrato_id)
            dept_stats[dept_key]["volumen"] += float(importe or 0)
    
    contratos_por_departamento = [
        {
            "departamento": dept_name,
            "contratos": len(stats["ids"]),
            "volumen": stats["volumen"]
        }
        for dept_name, stats in dept_stats.items()
    ]
    
    # Contratos Menores
    total_menores = base_menores_query.count()
    total_importe_menores = base_menores_query.with_entities(func.sum(models.ContratoMenor.import_adjudicacio)).scalar() or 0

    # 1. Temps mitjà de tramitació
    avg_diff_query = base_query.filter(
        models.Contrato.data_inici.isnot(None),
        models.Contrato.data_formalitzacio.isnot(None)
    ).with_entities(
        models.Contrato.data_inici,
        models.Contrato.data_formalitzacio
    ).all()
    
    total_days = 0
    count_days = 0
    for c in avg_diff_query:
        if c.data_formalitzacio >= c.data_inici:
            total_days += (c.data_formalitzacio - c.data_inici).days
            count_days += 1
    temps_mitja_tramitacio_dies = (total_days / count_days) if count_days > 0 else None

    # 2. Renovacions crítiques
    renovacions_query = base_query.filter(
        models.Contrato.alerta_finalitzacio == True
    ).order_by(models.Contrato.data_finalitzacio_calculada.asc()).limit(10).all()
    
    renovacions_critiques = [
        {
            "id": r.id,
            "codi_expedient": r.codi_expedient,
            "objecte": r.objecte_contracte,
            "adjudicatari": r.adjudicatari_nom,
            "data_finalitzacio": r.data_finalitzacio_calculada.isoformat() if r.data_finalitzacio_calculada else None,
            "importe": float(r.import_adjudicacio_amb_iva or 0)
        }
        for r in renovacions_query
    ]

    # 3. Licitadors únics
    json_data_query = base_query.filter(models.Contrato.datos_json.isnot(None)).with_entities(models.Contrato.datos_json).limit(5000).all()
    licitadors_unics = 0
    for j in json_data_query:
        try:
            js = j.datos_json or {}
            num = str(js.get('numero_de_licitadores_participantes', js.get('numero_ofertas_recibidas', '')))
            if num == '1' or num == '1.0':
                licitadors_unics += 1
        except Exception:
            pass


    return schemas.DashboardStats(
        total_contratos=total_contratos,
        contratos_por_estado=contratos_por_estado,
        pendientes_aprobacion=pendientes,
        total_importe=float(total_importe),
        ultima_sincronizacion=ultima_sync.fecha_hora_fin if ultima_sync else None,
        contratos_este_mes=contratos_mes,
        top_adjudicatarios=top_adjudicatarios,
        contratos_proximos_finalizar=contratos_proximos,
        contratos_posiblemente_finalizados=contratos_finalizados,
        total_contratos_menores=total_menores,
        total_importe_menores=float(total_importe_menores),
        contratos_por_departamento=contratos_por_departamento,
        temps_mitja_tramitacio_dies=temps_mitja_tramitacio_dies,
        licitadors_unics=licitadors_unics,
        renovacions_critiques=renovacions_critiques
    )


@router.get("/filtros")
def get_filtro_opciones(db: Session = Depends(get_db)):
    """Obtiene las opciones disponibles para los filtros"""
    estados = db.query(models.Contrato.estat_actual).distinct().all()
    tipos = db.query(models.Contrato.tipus_contracte).distinct().all()
    procedimientos = db.query(models.Contrato.procediment).distinct().all()
    
    return {
        "estados": [e[0] for e in estados if e[0]],
        "tipos_contrato": [t[0] for t in tipos if t[0]],
        "procedimientos": [p[0] for p in procedimientos if p[0]]
    }


@router.get("/cpv-info", response_model=Dict[str, str])
async def get_cpv_info(codes: str = Query("")):
    """Obtiene las descripciones de una lista de códigos CPV separados por comas"""
    from services.cpv_service import get_cpv_descriptions
    
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if not code_list:
        return {}
        
    return await get_cpv_descriptions(code_list)


@router.get("/export/csv")
def export_contratos_csv(
    busqueda: Optional[str] = None,
    te_prorroga: Optional[bool] = None,
    alerta_finalitzacio: Optional[bool] = None,
    possiblement_finalitzat: Optional[bool] = None,
    sense_departament: Optional[bool] = None,
    departamento_id: Optional[int] = None,
    estat_actual: Optional[str] = None,
    tipus_contracte: Optional[str] = None,
    estado_interno: Optional[str] = None,
    adjudicatari_nom: Optional[str] = None,
    fecha_inicio_desde: Optional[str] = None,
    fecha_inicio_hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user)
):
    from fastapi.responses import StreamingResponse
    import csv
    import io
    
    query = db.query(models.Contrato)
    
    # Reutilitzem exactament la mateixa lògica de filtratge que el GET /
    from services.access_control import apply_department_filter
    query = apply_department_filter(query, models.Contrato, current_user, "admin") # CSV sempre és admin view o filtrem? Millor respectar permisos
    
    if estat_actual:
        query = query.filter(models.Contrato.estat_actual == estat_actual)
    if tipus_contracte:
        query = query.filter(models.Contrato.tipus_contracte == tipus_contracte)
    if estado_interno:
        query = query.filter(models.Contrato.estado_interno == estado_interno)
    if adjudicatari_nom:
        query = query.filter(models.Contrato.adjudicatari_nom.ilike(f"%{adjudicatari_nom}%"))
    if departamento_id:
        query = query.filter(models.Contrato.departamentos.any(models.Departamento.id == departamento_id))
    if alerta_finalitzacio is not None:
        query = query.filter(models.Contrato.alerta_finalitzacio == alerta_finalitzacio)
    if possiblement_finalitzat is not None:
        query = query.filter(models.Contrato.possiblement_finalitzat == possiblement_finalitzat)
    if te_prorroga is not None:
        query = query.filter(models.Contrato.te_prorroga == te_prorroga)
    if sense_departament is not None:
        if sense_departament:
            query = query.filter(~models.Contrato.departamentos.any())
        else:
            query = query.filter(models.Contrato.departamentos.any())
    
    if fecha_inicio_desde:
        query = query.filter(models.Contrato.data_inici >= fecha_inicio_desde)
    if fecha_inicio_hasta:
        query = query.filter(models.Contrato.data_inici <= fecha_inicio_hasta)
            
    if busqueda:
        search_term = f"%{busqueda}%"
        query = query.filter(
            or_(
                models.Contrato.codi_expedient.ilike(search_term),
                models.Contrato.objecte_contracte.ilike(search_term),
                models.Contrato.adjudicatari_nom.ilike(search_term)
            )
        )
    
    contratos = query.all()
    
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_ALL)
    
    # Header
    writer.writerow(["Expedient", "Objecte", "Tipus", "Adjudicatari", "Import amb IVA", "Data Inici", "Estat", "Estat Intern"])
    
    for c in contratos:
        writer.writerow([
            c.codi_expedient,
            c.objecte_contracte,
            c.tipus_contracte,
            c.adjudicatari_nom,
            c.import_adjudicacio_amb_iva,
            c.data_inici,
            c.estat_actual,
            c.estado_interno
        ])
    
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contractes.csv"}
    )


@router_public.get("/enrich/stream")
def enrich_batch_stream(
    force: bool = False,
    token: str = Query(..., description="JWT token for authentication (EventSource can't send headers)"),
    db: Session = Depends(get_db)
):
    """Enriqueix tots els contractes en batch via SSE."""
    from core.security import decode_access_token
    from jose import JWTError
    import json
    
    try:
        payload = decode_access_token(token)
        email: str = payload.get("sub")
        if email is None:
            return StreamingResponse(
                iter([f'data: {json.dumps({"msg": "Token invàlid", "progress": 100, "error": True})}\n\n']),
                media_type="text/event-stream"
            )
        current_user = db.query(models.Empleado).filter(models.Empleado.email == email).first()
        if not current_user or not current_user.activo:
            return StreamingResponse(
                iter([f'data: {json.dumps({"msg": "Usuari no trobat o inactiu", "progress": 100, "error": True})}\n\n']),
                media_type="text/event-stream"
            )
    except JWTError:
        return StreamingResponse(
            iter([f'data: {json.dumps({"msg": "Token invàlid o expirat", "progress": 100, "error": True})}\n\n']),
            media_type="text/event-stream"
        )

    if current_user.rol not in ["admin", "responsable_contratacion"]:
        return StreamingResponse(
            iter([f'data: {json.dumps({"msg": "No tens permissos per enriquir contractes", "progress": 100, "error": True})}\n\n']),
            media_type="text/event-stream"
        )
    
    return StreamingResponse(
        EnrichmentService.enrich_batch_stream(db, force=force),
        media_type="text/event-stream"
    )


@router.get("/{contrato_id}", response_model=schemas.ContratoDetallat)
def get_contrato(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.query(models.Contrato).options(
        joinedload(models.Contrato.criteris_adjudicacio),
        joinedload(models.Contrato.membres_mesa),
        joinedload(models.Contrato.documents_fase),
        joinedload(models.Contrato.prorrogues),
        joinedload(models.Contrato.modificacions),
    ).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    return contrato


@router.post("/{contrato_id}/enrich")
def enrich_contrato(
    contrato_id: int,
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user)
):
    """Enriqueix un contracte descarregant les dades de les fases."""
    contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contracte no trobat")
    
    result = EnrichmentService.enrich_contract(db, contrato_id)
    return {"message": "Contracte enriquit correctament", "stats": result}


@router.get("/{contrato_id}/lots", response_model=List[schemas.Contrato])
def get_contrato_lots(contrato_id: int, db: Session = Depends(get_db)):
    """Retorna tots els lots del mateix expedient (contractes amb el mateix codi_expedient)"""
    contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    lots = db.query(models.Contrato).filter(
        models.Contrato.codi_expedient == contrato.codi_expedient,
        models.Contrato.id != contrato_id
    ).order_by(models.Contrato.lots).all()
    
    return lots


@router.put("/{contrato_id}", response_model=schemas.Contrato)
def update_contrato(
    contrato_id: int,
    contrato: schemas.ContratoUpdate,
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user)
):
    db_contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not db_contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    # Permission check: Only admin and responsable_contratacion can update contracts generally
    # 'responsable' can only update meses_aviso_vencimiento
    is_admin = current_user.rol in ["admin", "responsable_contratacion"]
    is_responsable = current_user.rol == "responsable"
    
    if not is_admin and not is_responsable:
        raise HTTPException(status_code=403, detail="No tens permissos per modificar contractes")
    
    update_data = contrato.model_dump(exclude_unset=True)
    
    if "departamentos_ids" in update_data:
        dept_ids = update_data.pop("departamentos_ids")
        if not is_admin:
            raise HTTPException(status_code=403, detail="Només els administradors poden assignar departaments")
        if dept_ids is not None:
            depts = db.query(models.Departamento).filter(models.Departamento.id.in_(dept_ids)).all()
            old_dept_ids = [d.id for d in db_contrato.departamentos]
            db_contrato.departamentos = depts
            
            historial = models.HistorialContrato(
                contrato_id=contrato_id,
                campo_modificado='departamentos',
                valor_anterior=str(old_dept_ids),
                valor_nuevo=str(dept_ids),
                tipo_cambio='manual',
                usuario_id=current_user.id
            )
            db.add(historial)
    
    if is_responsable and not is_admin:
        allowed_keys = {"meses_aviso_vencimiento"}
        if not set(update_data.keys()).issubset(allowed_keys):
            raise HTTPException(status_code=403, detail="Només pots modificar els mesos d'avís de venciment")
            
    if "responsables_ids" in update_data:
        resp_ids = update_data.pop("responsables_ids")
        if not is_admin:
            raise HTTPException(status_code=403, detail="Només els administradors poden assignar responsables")
        
        nuevos_responsables = db.query(models.Empleado).filter(models.Empleado.id.in_(resp_ids)).all()
        old_ids = [r.id for r in db_contrato.responsables]
        db_contrato.responsables = nuevos_responsables
        
        historial = models.HistorialContrato(
            contrato_id=contrato_id,
            campo_modificado='responsables',
            valor_anterior=str(old_ids),
            valor_nuevo=str(resp_ids),
            tipo_cambio='manual',
            usuario_id=current_user.id
        )
        db.add(historial)
    
    # Log changes
    for field, value in update_data.items():
        old_value = getattr(db_contrato, field)
        if old_value != value:
            historial = models.HistorialContrato(
                contrato_id=contrato_id,
                campo_modificado=field,
                valor_anterior=str(old_value) if old_value else None,
                valor_nuevo=str(value) if value else None,
                tipo_cambio='manual',
                usuario_id=current_user.id
            )
            db.add(historial)
        setattr(db_contrato, field, value)
    db.commit()
    
    # Recalculate alerts in case meses_aviso_vencimiento changed
    import services.alerta_service as alerta_service
    alerta_service.update_and_notify_expirations(db)
    
    db.refresh(db_contrato)
    return db_contrato


@router.post("/asignar_masivo")
def asignar_masivo(
    asignacion: schemas.ContratoMassAssign,
    db: Session = Depends(get_db),
    current_user: models.Empleado = Depends(get_current_user)
):
    if current_user.rol not in ["admin", "responsable_contratacion"]:
        raise HTTPException(status_code=403, detail="No tens permissos per assignar contractes massivament")
    
    contratos = db.query(models.Contrato).filter(
        models.Contrato.id.in_(asignacion.contrato_ids)
    ).all()
    
    for c in contratos:
        old_value = [d.id for d in c.departamentos]
        if asignacion.departamentos_ids is not None and sorted(old_value) != sorted(asignacion.departamentos_ids):
            historial = models.HistorialContrato(
                contrato_id=c.id,
                campo_modificado='departamentos',
                valor_anterior=str(old_value),
                valor_nuevo=str(asignacion.departamentos_ids),
                tipo_cambio='manual',
                usuario_id=current_user.id
            )
            db.add(historial)
            depts = db.query(models.Departamento).filter(models.Departamento.id.in_(asignacion.departamentos_ids)).all()
            c.departamentos = depts
        
    db.commit()
    return {"message": f"{len(contratos)} contractes assignats correctament"}



@router.get("/{contrato_id}/historial")
def get_contrato_historial(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    historial = db.query(models.HistorialContrato).filter(
        models.HistorialContrato.contrato_id == contrato_id
    ).order_by(models.HistorialContrato.fecha_modificacion.desc()).all()
    
    return historial


@router.get("/{contrato_id}/prorrogues", response_model=List[schemas.Prorroga])
def get_contrato_prorrogues(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    prorrogues = db.query(models.Prorroga).filter(
        models.Prorroga.contrato_id == contrato_id
    ).order_by(models.Prorroga.numero_prorroga).all()
    
    return prorrogues


@router.get("/{contrato_id}/modificacions", response_model=List[schemas.Modificacion])
def get_contrato_modificacions(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    modificacions = db.query(models.Modificacion).filter(
        models.Modificacion.contrato_id == contrato_id
    ).order_by(models.Modificacion.numero_modificacio).all()
    
    return modificacions
