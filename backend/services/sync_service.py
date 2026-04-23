import httpx
import hashlib
import json
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from core.database import SessionLocal
import models
import services.alerta_service as alerta_service
from services.enrichment_service import EnrichmentService

logger = logging.getLogger(__name__)


class SyncService:
    DEFAULT_API_BASE_URL = "https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json"
    DEFAULT_PRORROGUES_API_URL = "https://analisi.transparenciacatalunya.cat/resource/hb6v-jcbf.json"
    DEFAULT_INE10 = "4305160009"

    @staticmethod
    def get_config_val(db: Session, clave: str, default: str) -> str:
        cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == clave).first()
        return cfg.valor if cfg else default
    
    @staticmethod
    def calculate_hash(data: dict) -> str:
        """Calculate MD5 hash of the record"""
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.md5(json_str.encode()).hexdigest()
    
    @staticmethod
    def parse_date(date_str: Optional[str]) -> Optional[datetime]:
        """Parse date from API format"""
        if not date_str:
            return None
        try:
            # Try different formats
            for fmt in ["%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]:
                try:
                    return datetime.strptime(date_str[:26], fmt)
                except ValueError:
                    continue
            return None
        except Exception:
            return None
    
    @staticmethod
    def parse_float(value: Optional[str]) -> Optional[float]:
        """Parse float from API"""
        if not value:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def fetch_data(db: Session, codi_ine10: str, limit: int = 50000, offset: int = 0) -> list:
        """Fetch data from the external API"""
        base_url = SyncService.get_config_val(db, "sync_api_url", SyncService.DEFAULT_API_BASE_URL)
        url = f"{base_url}?codi_ine10={codi_ine10}&$limit={limit}&$offset={offset}"
        response = httpx.get(url, timeout=120.0)
        response.raise_for_status()
        return response.json()
    
    @staticmethod
    def parse_int(value) -> Optional[int]:
        """Parse integer from API"""
        if not value:
            return None
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def parse_duration(value) -> Optional[int]:
        """Parse duration text like '1 anys 0 mesos 0 dies' to total months"""
        if not value:
            return None
        try:
            # Try direct int first
            return int(float(value))
        except (ValueError, TypeError):
            pass
        try:
            import re
            anys = mesos = dies = 0
            m = re.search(r'(\d+)\s*any', str(value))
            if m:
                anys = int(m.group(1))
            m = re.search(r'(\d+)\s*mes', str(value))
            if m:
                mesos = int(m.group(1))
            m = re.search(r'(\d+)\s*di', str(value))
            if m:
                dies = int(m.group(1))
            total_months = anys * 12 + mesos + (1 if dies > 15 else 0)
            return total_months if total_months > 0 else None
        except Exception:
            return None
    
    @staticmethod
    def calculate_end_date(data_formalitzacio, durada_mesos):
        """Calculate end date: day after formalitzacio + durada in months"""
        from dateutil.relativedelta import relativedelta
        if not data_formalitzacio or not durada_mesos:
            return None
        try:
            # Add months and then add 1 day
            end_date = data_formalitzacio + relativedelta(months=int(durada_mesos)) + relativedelta(days=1)
            return end_date
        except Exception:
            return None
    
    @staticmethod
    def map_api_to_model(data: dict, aliases: dict = None) -> dict:
        """Map API fields to model fields"""
        from datetime import date
        from dateutil.relativedelta import relativedelta
        
        # ... (dates logic remains the same)
        data_formalitzacio = SyncService.parse_date(data.get("data_formalitzacio_contracte"))
        durada = SyncService.parse_duration(data.get("durada_contracte"))
        
        data_finalitzacio = None
        alerta = False
        possiblement_finalitzat = False
        
        if data_formalitzacio and durada:
            data_finalitzacio = SyncService.calculate_end_date(data_formalitzacio, durada)
            if data_finalitzacio:
                if hasattr(data_finalitzacio, 'date'):
                    data_finalitzacio = data_finalitzacio.date()
                today = date.today()
                six_months_later = today + relativedelta(months=6)
                if today <= data_finalitzacio <= six_months_later:
                    alerta = True
                if data_finalitzacio < today:
                    possiblement_finalitzat = True
        
        if data_formalitzacio and hasattr(data_formalitzacio, 'date'):
            data_formalitzacio = data_formalitzacio.date()
        
        data_inici_calc = None
        if data_formalitzacio:
            from dateutil.relativedelta import relativedelta
            data_inici_calc = data_formalitzacio + relativedelta(days=1)

        # Apply adjudicator alias if exists
        adj_nom = data.get("denominacio_adjudicatari")
        if aliases and adj_nom in aliases:
            adj_nom = aliases[adj_nom]
        
        return {
            "codi_expedient": data.get("codi_expedient", ""),
            "codi_ine10": data.get("codi_ine10"),
            "codi_dir3": data.get("codi_dir3"),
            "objecte_contracte": data.get("objecte_contracte"),
            "tipus_contracte": data.get("tipus_contracte"),
            "procediment": data.get("procediment"),
            "estat_actual": data.get("resultat") or data.get("fase_publicacio"),
            "adjudicatari_nom": adj_nom,
            "adjudicatari_nif": data.get("identificacio_adjudicatari"),  # API field: identificacio_adjudicatari
            "adjudicatari_nacionalitat": data.get("adjudicatari_nacionalitat"),
            "organisme_adjudicador": data.get("nom_organ"),  # API field: nom_organ
            "departament_adjudicador": data.get("departament_adjudicador"),
            "preu_licitar": SyncService.parse_float(data.get("valor_estimat_contracte")),
            "preu_adjudicar": SyncService.parse_float(data.get("import_adjudicacio_sense")),  # API: import_adjudicacio_sense
            "import_adjudicacio_amb_iva": SyncService.parse_float(data.get("import_adjudicacio_amb_iva")),
            "import_licitar_sense_iva": SyncService.parse_float(data.get("import_adjudicacio_sense")),  # API: import_adjudicacio_sense
            "pressupost_licitacio_sense_iva": SyncService.parse_float(data.get("pressupost_licitacio_sense")),  # API: pressupost_licitacio_sense
            "pressupost_licitacio_sense_iva_expedient": SyncService.parse_float(data.get("pressupost_licitacio_sense_1")),  # API: pressupost_licitacio_sense_1
            "pressupost_licitacio_amb_iva": SyncService.parse_float(data.get("pressupost_licitacio_amb")),  # API: pressupost_licitacio_amb
            "pressupost_licitacio_amb_iva_expedient": SyncService.parse_float(data.get("pressupost_licitacio_amb_1")),  # API: pressupost_licitacio_amb_1
            "valor_estimat_expedient": SyncService.parse_float(data.get("valor_estimat_expedient")),
            "data_publicacio": SyncService.parse_date(data.get("data_publicacio_anunci")),  # API field: data_publicacio_anunci
            "data_actualitzacio": SyncService.parse_date(data.get("data_actualitzacio")),
            "data_inici": data_inici_calc,  # Calculated: day after formalitzacio
            "data_final": data_finalitzacio,  # Calculated: formalitzacio + durada
            "data_formalitzacio": data_formalitzacio,  # API field: data_formalitzacio_contracte
            "durada_contracte": durada,  # API field: durada_contracte
            "data_finalitzacio_calculada": data_finalitzacio,  # Calculated (same as data_final)
            "alerta_finalitzacio": alerta,  # True if ends within 6 months
            "possiblement_finalitzat": possiblement_finalitzat,  # True if already passed
            "data_anunci_previ": SyncService.parse_date(data.get("data_anunci_previ")),
            "data_anunci_licitacio": SyncService.parse_date(data.get("data_anunci_licitacio")),
            "data_anunci_adjudicacio": SyncService.parse_date(data.get("data_adjudicacio_contracte")),  # API field: data_adjudicacio_contracte
            "data_anunci_formalitzacio": SyncService.parse_date(data.get("data_anunci_formalitzacio")),
            "cpv_principal_codi": data.get("codi_cpv"),  # API field: codi_cpv
            "cpv_principal_descripcio": data.get("cpv_principal_descripcio"),
            "enllac_anunci_previ": data.get("enllac_anunci_previ"),
            "enllac_licitacio": data.get("enllac_licitacio"),
            "enllac_adjudicacio": data.get("enllac_adjudicacio"),
            "enllac_formalitzacio": data.get("enllac_formalitzacio"),
            "enllac_perfil_contractant": data.get("enllac_perfil_contractant"),
            "enllac_publicacio": data.get("enllac_publicacio", {}).get("url") if isinstance(data.get("enllac_publicacio"), dict) else data.get("enllac_publicacio"),  # API returns dict with 'url' key
            "url_plataforma_contractacio": data.get("url_plataforma_contractacio"),
            "url_json_futura": data.get("url_json_futura", {}).get("url") if isinstance(data.get("url_json_futura"), dict) else data.get("url_json_futura"),
            "url_json_agregada": data.get("url_json_agregada", {}).get("url") if isinstance(data.get("url_json_agregada"), dict) else data.get("url_json_agregada"),
            "url_json_cpm": data.get("url_json_cpm", {}).get("url") if isinstance(data.get("url_json_cpm"), dict) else data.get("url_json_cpm"),
            "url_json_previ": data.get("url_json_previ", {}).get("url") if isinstance(data.get("url_json_previ"), dict) else data.get("url_json_previ"),
            "url_json_licitacio": data.get("url_json_licitacio", {}).get("url") if isinstance(data.get("url_json_licitacio"), dict) else data.get("url_json_licitacio"),
            "url_json_avaluacio": data.get("url_json_avaluacio", {}).get("url") if isinstance(data.get("url_json_avaluacio"), dict) else data.get("url_json_avaluacio"),
            "url_json_adjudicacio": data.get("url_json_adjudicacio", {}).get("url") if isinstance(data.get("url_json_adjudicacio"), dict) else data.get("url_json_adjudicacio"),
            "url_json_formalitzacio": data.get("url_json_formalitzacio", {}).get("url") if isinstance(data.get("url_json_formalitzacio"), dict) else data.get("url_json_formalitzacio"),
            "url_json_anulacio": data.get("url_json_anulacio", {}).get("url") if isinstance(data.get("url_json_anulacio"), dict) else data.get("url_json_anulacio"),
            "lots": data.get("numero_lot"),  # API field: numero_lot
            "tipus_tramitacio": data.get("tipus_tramitacio"),
            "codi_nuts": data.get("codi_nuts"),
            "descripcio_nuts": data.get("descripcio_nuts"),
            "forma_financament": data.get("forma_financament"),
            "data_anulacio": SyncService.parse_date(data.get("data_publicacio_anul")),  # API field: data_publicacio_anul
            # "datos_json": data,  # Temporarily disabled for debugging
        }
    
    @staticmethod
    def apply_association_rules(db: Session, contrato: models.Contrato) -> Optional[int]:
        """Apply association rules to assign department"""
        reglas = db.query(models.ReglaAsociacion).filter(
            models.ReglaAsociacion.activa == True
        ).order_by(models.ReglaAsociacion.prioridad.desc()).all()
        
        for regla in reglas:
            campo_valor = None
            if regla.campo_origen == "departament_adjudicador":
                campo_valor = contrato.departament_adjudicador
            elif regla.campo_origen == "organisme_adjudicador":
                campo_valor = contrato.organisme_adjudicador
            elif regla.campo_origen == "objecte_contracte":
                campo_valor = contrato.objecte_contracte
            elif regla.campo_origen == "cpv_principal_codi":
                campo_valor = contrato.cpv_principal_codi
            
            if not campo_valor:
                continue
            
            match = False
            if regla.operador == "igual":
                match = campo_valor == regla.valor_buscar
            elif regla.operador == "contiene":
                match = regla.valor_buscar.lower() in campo_valor.lower()
            elif regla.operador == "comienza_con":
                match = campo_valor.lower().startswith(regla.valor_buscar.lower())
            
            if match:
                return regla.departamento_id
        
        return None
    
    @staticmethod
    def detect_duplicates(db: Session, contrato: models.Contrato) -> None:
        """Detect and register duplicates"""
        # Find contracts with same expedient, state and lot
        duplicados = db.query(models.Contrato).filter(
            models.Contrato.codi_expedient == contrato.codi_expedient,
            models.Contrato.estat_actual == contrato.estat_actual,
            models.Contrato.lots == contrato.lots,
            models.Contrato.id != contrato.id
        ).all()
        
        for dup in duplicados:
            # Check if this pair already exists
            existing = db.query(models.Duplicado).filter(
                ((models.Duplicado.contrato_id_1 == contrato.id) & (models.Duplicado.contrato_id_2 == dup.id)) |
                ((models.Duplicado.contrato_id_1 == dup.id) & (models.Duplicado.contrato_id_2 == contrato.id))
            ).first()
            
            if not existing:
                # Create new duplicate record
                duplicado = models.Duplicado(
                    contrato_id_1=min(contrato.id, dup.id),
                    contrato_id_2=max(contrato.id, dup.id),
                    campo_duplicado="codi_expedient+estat_actual+lots",
                    valor_duplicado=f"{contrato.codi_expedient}|{contrato.estat_actual}|{contrato.lots}",
                    motivo_duplicado="Mateix Codi d'Expedient, Estat i Lot"
                )
                db.add(duplicado)
                
                # Mark both as pending approval
                contrato.estado_interno = 'pendiente_aprobacion'
                dup.estado_interno = 'pendiente_aprobacion'
    
    @staticmethod
    def run_sync_stream(sync_id: int, codi_ine10: str):
        """Run the synchronization process yielding progress as SSE"""
        db = SessionLocal()
        sync = db.query(models.Sincronizacion).filter(models.Sincronizacion.id == sync_id).first()
        
        if not sync:
            db.close()
            yield f'data: {json.dumps({"msg": "Sincronització no trobada", "progress": 100, "error": True})}\n\n'
            return
            
        try:
            yield f'data: {json.dumps({"msg": "Iniciant sincronització...", "progress": 5})}\n\n'
            
            # Load aliases
            aliases = {a.nombre_original: a.nombre_canonico for a in db.query(models.AliasAdjudicatario).all()}
            
            yield f'data: {json.dumps({"msg": "Descarregant contractes del registre públic...", "progress": 10})}\n\n'
            data = SyncService.fetch_data(db, codi_ine10)
            
            total_records = len(data)
            sync.total_registros_api = total_records
            yield f'data: {json.dumps({"msg": f"Processant {total_records} contractes...", "progress": 20})}\n\n'
            
            nuevos = 0
            actualizados = 0
            sin_cambios = 0
            errores = []
            detalles_log = []
            
            for i, record in enumerate(data):
                prog = 20 + int(70 * (i / max(1, total_records)))
                
                if i % 100 == 0:
                    msg = f"Sincronitzant contractes ({i}/{total_records})..."
                    yield f'data: {json.dumps({"msg": msg, "progress": prog})}\n\n'
                
                try:
                    expedient = record.get("codi_expedient")
                    estat = record.get("resultat") or record.get("fase_publicacio")
                    lot = record.get("numero_lot")
                    if not expedient:
                        continue
                        
                    record_hash = SyncService.calculate_hash(record)
                    mapped_data = SyncService.map_api_to_model(record, aliases=aliases)
                    mapped_data["hash_contenido"] = record_hash
                    
                    existing = db.query(models.Contrato).filter(
                        models.Contrato.codi_expedient == expedient,
                        models.Contrato.estat_actual == estat,
                        models.Contrato.lots == lot
                    ).first()
                    
                    if not existing:
                        contrato = models.Contrato(**mapped_data)
                        dept_id = SyncService.apply_association_rules(db, contrato)
                        if dept_id:
                            dept = db.query(models.Departamento).filter(models.Departamento.id == dept_id).first()
                            if dept:
                                contrato.departamentos = [dept]

                        db.add(contrato)
                        db.commit()
                        db.refresh(contrato)
                        
                        SyncService.detect_duplicates(db, contrato)
                        db.commit()
                        
                        nuevos += 1
                        
                        # Automatic enrichment for new contracts
                        if any([contrato.url_json_licitacio, contrato.url_json_avaluacio, 
                               contrato.url_json_adjudicacio, contrato.url_json_formalitzacio]):
                            try:
                                yield f'data: {json.dumps({"msg": f"Enriquint nou contracte {expedient}...", "progress": prog})}\n\n'
                                EnrichmentService.enrich_contract(db, contrato.id)
                            except Exception as ee:
                                logger.warning(f"Error en enriquiment automàtic per {expedient}: {ee}")
                        
                        if contrato.estado_interno == 'pendiente_aprobacion':
                            msg_d = f"Nou expedient {expedient} descarregat i guardat com a possible duplicat."
                            detalles_log.append({"tipo": "duplicat", "expedient": expedient, "missatge": msg_d})
                            yield f'data: {json.dumps({"msg": f"⚠️ Duplicat: {expedient}", "progress": prog})}\n\n'
                        else:
                            detalles_log.append({"tipo": "nou", "expedient": expedient, "missatge": "Creació de nou expedient completada."})
                            yield f'data: {json.dumps({"msg": f"✨ Nou contracte: {expedient}", "progress": prog})}\n\n'
                    elif existing.hash_contenido != record_hash:
                        canvis = []
                        for field, value in mapped_data.items():
                            if field == 'hash_contenido':
                                continue
                            if getattr(existing, field) != value:
                                canvis.append(field)
                                setattr(existing, field, value)
                                
                        existing.hash_contenido = record_hash
                        existing.fecha_ultima_sincronizacion = datetime.now()
                        db.commit()

                        # Re-enrich if updated
                        if any([existing.url_json_licitacio, existing.url_json_avaluacio, 
                               existing.url_json_adjudicacio, existing.url_json_formalitzacio]):
                            try:
                                yield f'data: {json.dumps({"msg": f"Re-enriquint contracte {expedient}...", "progress": prog})}\n\n'
                                EnrichmentService.enrich_contract(db, existing.id)
                            except Exception as ee:
                                logger.warning(f"Error en enriquiment automàtic per {expedient}: {ee}")

                        actualizados += 1
                        
                        msg_u = f"Actualitzat {expedient}"
                        if canvis:
                            c_str = ", ".join(canvis)
                            detalles_log.append({"tipo": "actualitzat", "expedient": expedient, "missatge": f"S'han alterat els següents camps: {c_str}"})
                            msg_u = f"🔄 Actualitzat {expedient}: {c_str[:40]}..."
                            
                        yield f'data: {json.dumps({"msg": msg_u, "progress": prog})}\n\n'
                    else:
                        sin_cambios += 1
                except Exception as e:
                    db.rollback()
                    errores.append(f"Error en {expedient}: {str(e)}")
                    
            yield f'data: {json.dumps({"msg": "Sincronitzant pròrrogues i dades addicionals...", "progress": 90})}\n\n'
            SyncService.sync_prorrogues(db, codi_ine10)
            
            yield f'data: {json.dumps({"msg": "Calculant alertes de venciment...", "progress": 95})}\n\n'
            alerta_service.update_and_notify_expirations(db)
            
            yield f'data: {json.dumps({"msg": "Finalitzant...", "progress": 98})}\n\n'
            
            sync.registros_nuevos = nuevos
            sync.registros_actualizados = actualizados
            sync.registros_sin_cambios = sin_cambios
            sync.estado = 'exitosa' if not errores else 'parcial'
            log_data = {
                "errores": errores[:50] if errores else [],
                "detalles": detalles_log[:1000] # Limitem per no saturar la BD
            }
            sync.log_errores = json.dumps(log_data)
            sync.fecha_hora_fin = datetime.now()
            db.commit()
            
            yield f'data: {json.dumps({"msg": "Sincronització completada amb èxit!", "progress": 100, "done": True})}\n\n'
            
        except Exception as e:
            sync.estado = 'fallida'
            sync.log_errores = str(e)
            sync.fecha_hora_fin = datetime.now()
            db.commit()
            yield f'data: {json.dumps({"msg": f"Error general: {str(e)}", "progress": 100, "error": True})}\n\n'
        finally:
            db.close()

    @staticmethod
    def run_sync(sync_id: int, codi_ine10: str) -> None:
        """Run the synchronization process"""
        logger.info(f"Starting sync {sync_id} with codi_ine10={codi_ine10}")
        db = SessionLocal()
        sync = db.query(models.Sincronizacion).filter(models.Sincronizacion.id == sync_id).first()
        
        if not sync:
            logger.warning(f"Sync {sync_id} not found!")
            db.close()
            return
        
        try:
            logger.info("Fetching data from API...")
            data = SyncService.fetch_data(db, codi_ine10)
            logger.info(f"Fetched {len(data)} records")
            sync.total_registros_api = len(data)
            
            # Load aliases
            aliases = {a.nombre_original: a.nombre_canonico for a in db.query(models.AliasAdjudicatario).all()}
            
            nuevos = 0
            actualizados = 0
            sin_cambios = 0
            errores = []
            
            for record in data:
                try:
                    expedient = record.get("codi_expedient")
                    estat = record.get("resultat") or record.get("fase_publicacio")  # Same fallback as map_api_to_model
                    lot = record.get("numero_lot")
                    
                    if not expedient:
                        continue
                    
                    record_hash = SyncService.calculate_hash(record)
                    mapped_data = SyncService.map_api_to_model(record, aliases=aliases)
                    mapped_data["hash_contenido"] = record_hash
                    
                    # Look for existing contract
                    existing = db.query(models.Contrato).filter(
                        models.Contrato.codi_expedient == expedient,
                        models.Contrato.estat_actual == estat,
                        models.Contrato.lots == lot
                    ).first()
                    
                    if not existing:
                        # New contract
                        contrato = models.Contrato(**mapped_data)
                        
                        # Inheritance: if another record for SAME expedient/lot already has departments, copy them
                        pre_existing = db.query(models.Contrato).filter(
                            models.Contrato.codi_expedient == expedient,
                            models.Contrato.lots == lot,
                            models.Contrato.departamentos.any()
                        ).first()
                        
                        if pre_existing:
                            contrato.departamentos = pre_existing.departamentos
                        else:
                            # If no inheritance, apply association rules
                            dept_id = SyncService.apply_association_rules(db, contrato)
                            if dept_id:
                                dept = db.query(models.Departamento).filter(models.Departamento.id == dept_id).first()
                                if dept:
                                    contrato.departamentos = [dept]
                        
                        db.add(contrato)
                        db.commit()  # Commit immediately
                        
                        # Automatic enrichment for new contracts
                        if any([contrato.url_json_licitacio, contrato.url_json_avaluacio, 
                               contrato.url_json_adjudicacio, contrato.url_json_formalitzacio]):
                            try:
                                EnrichmentService.enrich_contract(db, contrato.id)
                            except Exception as ee:
                                logger.warning(f"Error en enriquiment automàtic per {expedient}: {ee}")
                                
                        nuevos += 1
                    elif existing.hash_contenido != record_hash:
                        # Update existing - skip historial for performance
                        for field, value in mapped_data.items():
                            setattr(existing, field, value)
                        existing.fecha_ultima_sincronizacion = datetime.now()
                        db.commit()  # Commit immediately
                        
                        # Re-enrich if updated
                        if any([existing.url_json_licitacio, existing.url_json_avaluacio, 
                               existing.url_json_adjudicacio, existing.url_json_formalitzacio]):
                            try:
                                EnrichmentService.enrich_contract(db, existing.id)
                            except Exception as ee:
                                logger.warning(f"Error en enriquiment automàtic per {expedient}: {ee}")
                                
                        actualizados += 1
                    else:
                        sin_cambios += 1
                
                except Exception as e:
                    db.rollback()  # Roll back failed record
                    errores.append(f"Error en {expedient}: {str(e)}")
            
            # Final commit
            sync.registros_nuevos = nuevos
            sync.registros_actualizados = actualizados
            sync.registros_sin_cambios = sin_cambios
            sync.estado = 'exitosa' if not errores else 'parcial'
            
            # Recalculate alerts
            alerta_service.update_and_notify_expirations(db)
            
            # Guardem com a JSON per consistència amb la versió stream
            log_data = {
                "errores": errores[:50] if errores else [],
                "detalles": [] # En versió no-stream no guardem detalls per ara
            }
            sync.log_errores = json.dumps(log_data)
            sync.fecha_hora_fin = datetime.now()
            
            db.commit()
            
        except Exception as e:
            sync.estado = 'fallida'
            sync.log_errores = str(e)
            sync.fecha_hora_fin = datetime.now()
            db.commit()
        finally:
            db.close()
    
    @staticmethod
    def sync_prorrogues(db: Session, codi_ine10: str, codi_expedient: Optional[str] = None) -> dict:
        """Sync prorrogues (extensions) and modifications for contracts in bulk or individually"""
        stats = {
            "total_consultats": 0, 
            "prorrogues_noves": 0, 
            "prorrogues_actualitzades": 0,
            "modificacions_noves": 0,
            "modificacions_actualitzades": 0,
            "errors": []
        }
        
        try:
            # Query the prorrogues API
            query_params = f"id_organisme_contractant={codi_ine10}"
            if codi_expedient:
                # SoQL needs single quotes for strings that might have slashes
                query_params += f"&codi_expedient='{codi_expedient}'"
            
            api_url = SyncService.get_config_val(db, "prorrogues_api_url", SyncService.DEFAULT_PRORROGUES_API_URL)
            url = f"{api_url}?{query_params}&$limit=20000"
            response = httpx.get(url, timeout=60.0)
            response.raise_for_status()
            all_records = response.json()
            
            if not all_records:
                return stats
            
            # Group records by codi_expedient
            records_by_exp = {}
            for record in all_records:
                exp = record.get("codi_expedient")
                if not exp: continue
                if exp not in records_by_exp:
                    records_by_exp[exp] = []
                records_by_exp[exp].append(record)
            
            # Get only expedients we have in our DB to minimize work
            db_expedients = [e[0] for e in db.query(models.Contrato.codi_expedient).distinct().all()]
            
            from datetime import date as date_type
            today = date_type.today()
            from dateutil.relativedelta import relativedelta
            six_months = today + relativedelta(months=6)

            for exp in db_expedients:
                if exp not in records_by_exp:
                    continue
                    
                records = records_by_exp[exp]
                try:
                    # Find matching contracts in our DB
                    contratos = db.query(models.Contrato).filter(models.Contrato.codi_expedient == exp).all()
                    if not contratos: continue
                    
                    for contrato in contratos:
                        stats["total_consultats"] += 1
                        for record in records:
                            situacio = record.get("situaci_contractual", "").lower()
                            
                            if situacio == "pròrroga":
                                num_prorroga = SyncService.parse_int(record.get("numero_prorroga"))
                                if num_prorroga is None: continue
                                
                                d_inici = SyncService.parse_date(record.get("data_inici_prorroga"))
                                d_fi = SyncService.parse_date(record.get("data_fi_prorroga"))
                                import_adj = SyncService.parse_float(record.get("import_adjudicacio"))
                                exercici = SyncService.parse_int(record.get("exercici"))
                                
                                # Normalize dates
                                if d_inici and hasattr(d_inici, 'date'): d_inici = d_inici.date()
                                if d_fi and hasattr(d_fi, 'date'): d_fi = d_fi.date()

                                existing = db.query(models.Prorroga).filter(
                                    models.Prorroga.contrato_id == contrato.id,
                                    models.Prorroga.numero_prorroga == num_prorroga
                                ).first()
                                
                                if existing:
                                    existing.data_inici_prorroga = d_inici
                                    existing.data_fi_prorroga = d_fi
                                    existing.import_adjudicacio = import_adj
                                    existing.exercici = exercici
                                    existing.situaci_contractual = record.get("situaci_contractual")
                                    existing.fecha_sincronizacion = datetime.now()
                                    stats["prorrogues_actualitzades"] += 1
                                else:
                                    prorroga = models.Prorroga(
                                        contrato_id=contrato.id,
                                        numero_prorroga=num_prorroga,
                                        data_inici_prorroga=d_inici,
                                        data_fi_prorroga=d_fi,
                                        import_adjudicacio=import_adj,
                                        exercici=exercici,
                                        situaci_contractual=record.get("situaci_contractual"),
                                    )
                                    db.add(prorroga)
                                    stats["prorrogues_noves"] += 1
                                    
                                # Update contract's calculated end date
                                if d_fi:
                                    cf = contrato.data_fi_execucio or contrato.data_final
                                    if cf and hasattr(cf, 'date'): cf = cf.date()
                                    
                                    # Si la prorroga estén el contracte, actualitzem les dates i alertes
                                    if cf is None or d_fi > cf:
                                        contrato.data_final = d_fi
                                        contrato.data_fi_execucio = d_fi
                                        contrato.data_finalitzacio_calculada = d_fi
                                        
                                        # Recalcular alertes
                                        today = date_type.today()
                                        six_months_later = today + relativedelta(months=6)
                                        
                                        contrato.possiblement_finalitzat = d_fi < today
                                        contrato.alerta_finalitzacio = today <= d_fi <= six_months_later
                            elif "modificaci" in situacio:
                                num_mod = SyncService.parse_int(record.get("numero_modificacio"))
                                if num_mod is None: continue
                                
                                d_aprov = SyncService.parse_date(record.get("data_aprovacio_modificacio"))
                                tipus_mod = record.get("tipus_modificacio")
                                imp_mod = SyncService.parse_float(record.get("import_modificacio"))
                                
                                anys = SyncService.parse_int(record.get("anys_termini_modificacio"))
                                mesos = SyncService.parse_int(record.get("mesos_termini_modificacio"))
                                dies = SyncService.parse_int(record.get("dies_termini_modificacio"))

                                if d_aprov and hasattr(d_aprov, 'date'): d_aprov = d_aprov.date()

                                existing = db.query(models.Modificacion).filter(
                                    models.Modificacion.contrato_id == contrato.id,
                                    models.Modificacion.numero_modificacio == num_mod
                                ).first()
                                
                                if existing:
                                    existing.data_aprovacio_modificacio = d_aprov
                                    existing.tipus_modificacio = tipus_mod
                                    existing.import_modificacio = imp_mod
                                    existing.anys_termini_modificacio = anys
                                    existing.mesos_termini_modificacio = mesos
                                    existing.dies_termini_modificacio = dies
                                    existing.fecha_sincronizacion = datetime.now()
                                    stats["modificacions_actualitzades"] += 1
                                else:
                                    modificacion = models.Modificacion(
                                        contrato_id=contrato.id,
                                        numero_modificacio=num_mod,
                                        data_aprovacio_modificacio=d_aprov,
                                        tipus_modificacio=tipus_mod,
                                        import_modificacio=imp_mod,
                                        anys_termini_modificacio=anys,
                                        mesos_termini_modificacio=mesos,
                                        dies_termini_modificacio=dies,
                                        datos_json=record
                                    )
                                    db.add(modificacion)
                                    stats["modificacions_noves"] += 1
                        
                        # Recalculate alerts
                        if contrato.data_final:
                            df = contrato.data_final
                            if hasattr(df, 'date'): df = df.date()
                            contrato.possiblement_finalitzat = df < today
                            contrato.alerta_finalitzacio = (today <= df <= six_months)
                        
                    db.commit()
                except Exception as e:
                    db.rollback()
                    stats["errors"].append(f"Error en {exp}: {str(e)}")
        except Exception as e:
            stats["errors"].append(f"Error general pròrrogues: {str(e)}")
        finally:
            # We don't close DB if it was passed as argument (wait, I should be careful about SessionLocal vs db argument)
            pass
        return stats

    @staticmethod
    def sync_menores(db: Session, codi_ine10: str) -> dict:
        """Sync minor contracts (menors) and their liquidations"""
        stats = {
            "total_consultats": 0,
            "menors_nous": 0,
            "menors_actualitzats": 0,
            "errors": []
        }
        
        try:
            api_url = SyncService.get_config_val(db, "prorrogues_api_url", SyncService.DEFAULT_PRORROGUES_API_URL)
            # Fetch all menors and liquidacions for this INE10
            # SoQL uses single quotes for strings that might have spaces
            where_clause = f"id_organisme_contractant='{codi_ine10}' AND procediment_adjudicacio='Menor'"
            url = f"{api_url}?$where={where_clause}&$limit=50000"
            response = httpx.get(url, timeout=120.0)
            response.raise_for_status()
            records = response.json()
            
            if not records:
                return stats
                
            # Load aliases
            aliases = {a.nombre_original: a.nombre_canonico for a in db.query(models.AliasAdjudicatario).all()}
            
            stats["total_consultats"] = len(records)
            
            # Group by codi_expedient
            grouped = {}
            for r in records:
                exp = r.get("codi_expedient")
                if not exp: continue
                if exp not in grouped:
                    grouped[exp] = {"menor": None, "liquidacio": None}
                
                sit = r.get("situaci_contractual", "").lower()
                if sit == "menor":
                    grouped[exp]["menor"] = r
                elif "liquidaci" in sit:
                    grouped[exp]["liquidacio"] = r
            
            for exp, data in grouped.items():
                try:
                    menor_record = data["menor"]
                    liq_record = data["liquidacio"]
                    
                    # If we don't have the original menor data, we might only have liquidacio
                    base_record = menor_record or liq_record
                    if not base_record:
                        continue
                        
                    existing = db.query(models.ContratoMenor).filter(models.ContratoMenor.codi_expedient == exp).first()
                    
                    # Prepare update data
                    update_data = {
                        "fecha_ultima_sincronizacion": datetime.now()
                    }
                    
                    if menor_record:
                        adj_nom = menor_record.get("adjudicatari")
                        if aliases and adj_nom in aliases:
                            adj_nom = aliases[adj_nom]
                            
                        d_adj = SyncService.parse_date(menor_record.get("data_adjudicacio"))
                        if d_adj and hasattr(d_adj, 'date'): d_adj = d_adj.date()
                        
                        update_data.update({
                            "tipus_contracte": menor_record.get("tipus_contracte"),
                            "descripcio_expedient": menor_record.get("descripcio_expedient"),
                            "adjudicatari": adj_nom,
                            "import_adjudicacio": SyncService.parse_float(menor_record.get("import_adjudicacio")),
                            "data_adjudicacio": d_adj,
                            "exercici": SyncService.parse_int(menor_record.get("exercici")),
                            "dies_durada": SyncService.parse_int(menor_record.get("dies_durada")),
                            "mesos_durada": SyncService.parse_int(menor_record.get("mesos_durada")),
                            "anys_durada": SyncService.parse_int(menor_record.get("anys_durada")),
                            "datos_json_menor": menor_record
                        })
                        
                    if liq_record:
                        d_liq = SyncService.parse_date(liq_record.get("data_liquidacio"))
                        if d_liq and hasattr(d_liq, 'date'): d_liq = d_liq.date()
                        
                        update_data.update({
                            "tipus_liquidacio": liq_record.get("tipus_liquidacio"),
                            "data_liquidacio": d_liq,
                            "import_liquidacio": SyncService.parse_float(liq_record.get("import_liquidacio")),
                            "datos_json_liquidacio": liq_record
                        })
                        
                        # Fallback for base info if menor_record is missing
                        if not menor_record:
                            if not update_data.get("descripcio_expedient"): update_data["descripcio_expedient"] = liq_record.get("descripcio_expedient")
                            if not update_data.get("adjudicatari"): update_data["adjudicatari"] = liq_record.get("adjudicatari")
                            if not update_data.get("tipus_contracte"): update_data["tipus_contracte"] = liq_record.get("tipus_contracte")

                    if existing:
                        for k, v in update_data.items():
                            setattr(existing, k, v)
                        stats["menors_actualitzats"] += 1
                    else:
                        update_data["codi_expedient"] = exp
                        nou = models.ContratoMenor(**update_data)
                        db.add(nou)
                        stats["menors_nous"] += 1
                    
                    db.commit()
                except Exception as e:
                    db.rollback()
                    stats["errors"].append(f"Error parsejant menor {exp}: {str(e)}")
                    
        except Exception as e:
            stats["errors"].append(f"Error general sincronitzant menors: {str(e)}")
            
        return stats

    @staticmethod
    def sync_menores_stream(db: Session, codi_ine10: str):
        """Sync minor contracts (menors) and their liquidations using SSE"""
        import json
        try:
            api_url = SyncService.get_config_val(db, "prorrogues_api_url", SyncService.DEFAULT_PRORROGUES_API_URL)
            where_clause = f"id_organisme_contractant='{codi_ine10}' AND procediment_adjudicacio='Menor'"
            url = f"{api_url}?$where={where_clause}&$limit=50000"
            
            yield f'data: {json.dumps({"msg": "Connectant amb API de Contractes Menors...", "progress": 5})}\n\n'
            response = httpx.get(url, timeout=120.0)
            response.raise_for_status()
            records = response.json()
            
            if not records:
                yield f'data: {json.dumps({"msg": "No hi ha contractes menors per aquest organisme.", "progress": 100, "done": True, "nous": 0, "actualitzats": 0})}\n\n'
                return
                
            yield f'data: {json.dumps({"msg": f"Descarregats {len(records)} registres. Agrupant...", "progress": 15})}\n\n'
            
            aliases = {a.nombre_original: a.nombre_canonico for a in db.query(models.AliasAdjudicatario).all()}
            
            grouped = {}
            for r in records:
                exp = r.get("codi_expedient")
                if not exp: continue
                if exp not in grouped:
                    grouped[exp] = {"menor": None, "liquidacio": None}
                
                sit = r.get("situaci_contractual", "").lower()
                if sit == "menor":
                    grouped[exp]["menor"] = r
                elif "liquidaci" in sit:
                    grouped[exp]["liquidacio"] = r
            
            total_exps = len(grouped)
            yield f'data: {json.dumps({"msg": f"Trobats {total_exps} expedients. Processant...", "progress": 20})}\n\n'
            
            menors_nous = 0
            menors_actualitzats = 0
            
            for i, (exp, data) in enumerate(grouped.items()):
                try:
                    menor_record = data["menor"]
                    liq_record = data["liquidacio"]
                    
                    base_record = menor_record or liq_record
                    if not base_record:
                        continue
                        
                    existing = db.query(models.ContratoMenor).filter(models.ContratoMenor.codi_expedient == exp).first()
                    
                    update_data = {
                        "fecha_ultima_sincronizacion": datetime.now()
                    }
                    
                    if menor_record:
                        adj_nom = menor_record.get("adjudicatari")
                        if aliases and adj_nom in aliases:
                            adj_nom = aliases[adj_nom]
                            
                        d_adj = SyncService.parse_date(menor_record.get("data_adjudicacio"))
                        if d_adj and hasattr(d_adj, 'date'): d_adj = d_adj.date()
                        
                        update_data.update({
                            "tipus_contracte": menor_record.get("tipus_contracte"),
                            "descripcio_expedient": menor_record.get("descripcio_expedient"),
                            "adjudicatari": adj_nom,
                            "import_adjudicacio": SyncService.parse_float(menor_record.get("import_adjudicacio")),
                            "data_adjudicacio": d_adj,
                            "exercici": SyncService.parse_int(menor_record.get("exercici")),
                            "dies_durada": SyncService.parse_int(menor_record.get("dies_durada")),
                            "mesos_durada": SyncService.parse_int(menor_record.get("mesos_durada")),
                            "anys_durada": SyncService.parse_int(menor_record.get("anys_durada")),
                            "datos_json_menor": menor_record
                        })
                        
                    if liq_record:
                        d_liq = SyncService.parse_date(liq_record.get("data_liquidacio"))
                        if d_liq and hasattr(d_liq, 'date'): d_liq = d_liq.date()
                        
                        update_data.update({
                            "tipus_liquidacio": liq_record.get("tipus_liquidacio"),
                            "data_liquidacio": d_liq,
                            "import_liquidacio": SyncService.parse_float(liq_record.get("import_liquidacio")),
                            "datos_json_liquidacio": liq_record
                        })
                        
                        if not menor_record:
                            if not update_data.get("descripcio_expedient"): update_data["descripcio_expedient"] = liq_record.get("descripcio_expedient")
                            if not update_data.get("adjudicatari"): update_data["adjudicatari"] = liq_record.get("adjudicatari")
                            if not update_data.get("tipus_contracte"): update_data["tipus_contracte"] = liq_record.get("tipus_contracte")

                    if existing:
                        for k, v in update_data.items():
                            setattr(existing, k, v)
                        menors_actualitzats += 1
                    else:
                        update_data["codi_expedient"] = exp
                        nou = models.ContratoMenor(**update_data)
                        db.add(nou)
                        menors_nous += 1
                    
                    if i % 50 == 0:
                        prog = 20 + int(75 * (i / max(1, total_exps)))
                        yield f'data: {json.dumps({"msg": f"Processant contracte menor {exp}...", "progress": prog})}\n\n'
                        db.commit()
                        
                except Exception as e:
                    db.rollback()
                    logger.warning(f"Error parsejant menor {exp}: {str(e)}")
            
            db.commit()
            yield f'data: {json.dumps({"msg": "Sincronització de menors completada!", "progress": 100, "done": True, "nous": menors_nous, "actualitzats": menors_actualitzats})}\n\n'
                    
        except Exception as e:
            db.rollback()
            yield f'data: {json.dumps({"msg": f"Error general sincronitzant menors: {str(e)}", "progress": 100, "error": True})}\n\n'

