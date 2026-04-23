"""
Servei d'enriquiment de contractes.
Descarrega els JSON de cada fase (licitació, avaluació, adjudicació, formalització)
i pobla els camps enriquits del model Contrato + taules relacionades.

Rate-limiting: pausa entre peticions per evitar ser bloquejat.
"""
import httpx
import time
import logging
from datetime import datetime
from typing import Optional, Generator
from sqlalchemy.orm import Session
import json

import models

logger = logging.getLogger(__name__)

# Rate limiting config
REQUEST_DELAY_SECONDS = 2.0  # Pausa entre peticions HTTP
BATCH_SIZE = 5  # Contractes per batch
BATCH_DELAY_SECONDS = 5.0  # Pausa extra entre batches
HTTP_TIMEOUT = 30.0  # Timeout per petició


class EnrichmentService:
    """Servei per enriquir contractes amb dades dels JSON de fases."""

    DOWNLOAD_BASE_URL = "https://contractaciopublica.cat/portal-api/descarrega-document"

    @staticmethod
    def _safe_get_ca(obj: dict, *keys) -> Optional[str]:
        """Navega un dict JSON i retorna el valor .ca d'un camp multiidioma."""
        current = obj
        for key in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        if isinstance(current, dict):
            return current.get("ca") or current.get("es") or current.get("en")
        if isinstance(current, str):
            return current
        return None

    @staticmethod
    def _safe_get(obj: dict, *keys):
        """Navega un dict JSON i retorna el valor."""
        current = obj
        for key in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    @staticmethod
    def _fetch_json(url: str) -> Optional[dict]:
        """Descarrega un JSON des d'una URL amb timeout."""
        if not url:
            return None
        try:
            response = httpx.get(url, timeout=HTTP_TIMEOUT, follow_redirects=True)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(f"Error descarregant JSON {url[:80]}...: {e}")
            return None

    @staticmethod
    def _extract_documents(data: dict, fase: str) -> list:
        """Extreu tots els documents d'un JSON de fase."""
        documents = []
        
        def find_docs(obj, tipus_doc=""):
            if not obj or not isinstance(obj, (dict, list)):
                return
            if isinstance(obj, list):
                for item in obj:
                    find_docs(item, tipus_doc)
                return
            # Si és un document (té id, titol, hash)
            if obj.get("id") and obj.get("titol") and obj.get("hash"):
                doc_id = obj["id"]
                doc_hash = obj["hash"]
                documents.append({
                    "fase": fase,
                    "tipus_document": tipus_doc or "document",
                    "titol": obj["titol"],
                    "document_id": doc_id,
                    "hash_document": doc_hash,
                    "mida": obj.get("mida"),
                    "url_descarrega": f"{EnrichmentService.DOWNLOAD_BASE_URL}/{doc_id}/{doc_hash}"
                })
                return
            # Recursius per claus conegudes
            for key, value in obj.items():
                label = key
                if key in ("plecsDeClausulesAdministratives", "PCAP"):
                    label = "PCAP"
                elif key in ("plecsDePrescripcionsTecniques", "PPT"):
                    label = "PPT"
                elif key in ("memoriaJustificativaContracte",):
                    label = "Memòria Justificativa"
                elif key in ("documentsAprovacio",):
                    label = "Document d'Aprovació"
                elif key in ("resolucioAdjudicacio",):
                    label = "Resolució Adjudicació"
                elif key in ("documentFormalitzacio",):
                    label = "Contracte Formalitzat"
                elif key in ("informesActesMesesContractacio",):
                    label = "Acta Mesa"
                elif key in ("altresDocuments", "altraDocumentacio"):
                    label = "Altre Document"
                else:
                    label = tipus_doc  # Mantenir el context del pare
                find_docs(value, label)
        
        if data.get("publicacio"):
            pub = data["publicacio"]
            # Buscar en dadesPublicacio
            find_docs(pub.get("dadesPublicacio", {}))
            # Buscar en dadesPublicacioLot
            lots = pub.get("dadesPublicacioLot", [])
            for lot in lots:
                find_docs(lot)
        
        return documents

    @staticmethod
    def _extract_mesa_members(data: dict) -> list:
        """Extreu els membres de la mesa d'un JSON (normalment avaluació)."""
        members = []
        mesa = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacio", "membresMesa")
        if not mesa or not isinstance(mesa, list):
            return members
        for m in mesa:
            nom = m.get("nom", "")
            cognoms = m.get("cognoms", "")
            carrec_obj = m.get("carrec", {})
            carrec = ""
            if isinstance(carrec_obj, dict):
                carrec = carrec_obj.get("ca") or carrec_obj.get("es") or carrec_obj.get("en") or ""
            elif isinstance(carrec_obj, str):
                carrec = carrec_obj
            if nom or cognoms:
                members.append({
                    "nom": nom,
                    "cognoms": cognoms,
                    "carrec": carrec
                })
        return members

    @staticmethod
    def _extract_criteris(data: dict) -> list:
        """Extreu els criteris d'adjudicació d'un JSON de fase."""
        criteris = []
        
        # 1. Intentar extreure dels lots (més comú)
        lots = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacioLot")
        if isinstance(lots, list):
            for lot in lots:
                criteris_raw = lot.get("criterisAdjudicacio", [])
                if isinstance(criteris_raw, list):
                    for c in criteris_raw:
                        nom = EnrichmentService._safe_get_ca(c, "criteri")
                        if not nom:
                            criteri_obj = c.get("criteri", {})
                            if isinstance(criteri_obj, dict):
                                nom = criteri_obj.get("es") or criteri_obj.get("en") or "Sense nom"
                        
                        criteris.append({
                            "index": c.get("index", 0),
                            "criteri_nom": nom,
                            "ponderacio": c.get("ponderacio"),
                            "desglossament_json": c.get("desglossament", [])
                        })
        
        # 2. Si no n'hem trobat, provar a nivell global (dadesPublicacio)
        if not criteris:
            criteris_raw = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacio", "criterisAdjudicacio")
            if isinstance(criteris_raw, list):
                for c in criteris_raw:
                    nom = EnrichmentService._safe_get_ca(c, "criteri")
                    if not nom:
                        criteri_obj = c.get("criteri", {})
                        if isinstance(criteri_obj, dict):
                            nom = criteri_obj.get("es") or criteri_obj.get("en") or "Sense nom"
                    
                    criteris.append({
                        "index": c.get("index", 0),
                        "criteri_nom": nom,
                        "ponderacio": c.get("ponderacio"),
                        "desglossament_json": c.get("desglossament", [])
                    })
                    
        return criteris

    @staticmethod
    def _extract_scalar_fields(licitacio: dict, avaluacio: dict, 
                                adjudicacio: dict, formalitzacio: dict) -> dict:
        """Extreu els camps escalars nous de tots els JSON de fases."""
        fields = {}
        
        # Prioritzem licitació per la info bàsica (és la fase més completa)
        for data in [licitacio, adjudicacio, formalitzacio, avaluacio]:
            if not data:
                continue
            basics = EnrichmentService._safe_get(data, "publicacio", "dadesBasiquesPublicacio") or {}
            pub = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacio") or {}
            lot_list = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacioLot") or []
            lot = lot_list[0] if lot_list else {}

            # Info bàsica (només si no s'ha omplert encara)
            if not fields.get("normativa_aplicable"):
                fields["normativa_aplicable"] = EnrichmentService._safe_get_ca(basics, "normativaAplicable")
            if not fields.get("tipus_publicacio_expedient"):
                fields["tipus_publicacio_expedient"] = EnrichmentService._safe_get_ca(basics, "tipusPublicacioExpedient")
            if not fields.get("procediment_adjudicacio"):
                fields["procediment_adjudicacio"] = EnrichmentService._safe_get_ca(basics, "procedimentAdjudicacio")
            if fields.get("acces_exclusiu") is None:
                fields["acces_exclusiu"] = basics.get("accesExclusiu")
            if not fields.get("tipus_oferta_electronica"):
                fields["tipus_oferta_electronica"] = EnrichmentService._safe_get_ca(basics, "tipusOfertaElectronica")
            if fields.get("compra_publica_innovacio") is None:
                fields["compra_publica_innovacio"] = basics.get("compraPublicaInnovacio")
            if fields.get("contracte_mixt") is None:
                fields["contracte_mixt"] = basics.get("contracteMixt")
            
            # Te lots
            te_lots_val = EnrichmentService._safe_get(data, "publicacio", "teLots")
            if fields.get("te_lots") is None and te_lots_val is not None:
                fields["te_lots"] = te_lots_val
        
        # Camps específics de licitació
        if licitacio:
            pub = EnrichmentService._safe_get(licitacio, "publicacio", "dadesPublicacio") or {}
            lot_list = EnrichmentService._safe_get(licitacio, "publicacio", "dadesPublicacioLot") or []
            lot = lot_list[0] if lot_list else {}
            
            if fields.get("contracte_harmonitzat") is None:
                fields["contracte_harmonitzat"] = pub.get("contracteHarmonitzat")
            
            termini = pub.get("dataTerminiPresentacioOSolicitud")
            if termini and not fields.get("data_termini_presentacio"):
                try:
                    fields["data_termini_presentacio"] = datetime.fromisoformat(termini.replace("Z", "+00:00"))
                except Exception:
                    pass
            
            if fields.get("preveuen_modificacions") is None:
                fields["preveuen_modificacions"] = pub.get("preveuenModificacionsAlsPlecs")
            if fields.get("preveuen_prorrogues") is None:
                fields["preveuen_prorrogues"] = pub.get("preveuenProrroguesAlsPlecs")
            
            if not fields.get("causa_habilitant"):
                fields["causa_habilitant"] = EnrichmentService._safe_get_ca(pub, "causaHabilitant")
            if not fields.get("divisio_lots"):
                fields["divisio_lots"] = EnrichmentService._safe_get_ca(pub, "divisioEnLots")
            
            # Garanties (del lot)
            if fields.get("garantia_provisional") is None:
                fields["garantia_provisional"] = lot.get("garantiaProvisional")
            if fields.get("garantia_definitiva") is None:
                fields["garantia_definitiva"] = lot.get("garantiaDefinitiva")
            if not fields.get("percentatge_garantia_definitiva"):
                fields["percentatge_garantia_definitiva"] = lot.get("percentatgeGarantiaDefinitiva")
            if fields.get("reserva_social") is None:
                fields["reserva_social"] = lot.get("reservaSocial")
            
            # Peu de recurs
            if not fields.get("peu_recurs"):
                fields["peu_recurs"] = EnrichmentService._safe_get_ca(pub, "peuRecurs")
        
        # Camps d'adjudicació/formalització
        for data in [adjudicacio, formalitzacio]:
            if not data:
                continue
            lot_list = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacioLot") or []
            lot = lot_list[0] if lot_list else {}
            pub = EnrichmentService._safe_get(data, "publicacio", "dadesPublicacio") or {}
            
            if not fields.get("total_ofertes_rebudes"):
                fields["total_ofertes_rebudes"] = lot.get("totalOfertesRebudes")
            
            # IVA i imports
            if not fields.get("iva_percentatge"):
                fields["iva_percentatge"] = lot.get("ivaAdjudicacio") or lot.get("iva")
            if not fields.get("import_adjudicacio_sense_iva"):
                val = lot.get("importAdjudicacio") or lot.get("importAdjudicacioSenseIva")
                if val is None:
                    # Buscar a empresaContractista
                    empreses = lot.get("empresaContractista", []) or lot.get("empresesAdjudicataries", [])
                    if empreses and isinstance(empreses, list):
                        val = empreses[0].get("importAdjudicacioSenseIva")
                fields["import_adjudicacio_sense_iva"] = val
            if not fields.get("valor_estimat_contracte"):
                fields["valor_estimat_contracte"] = lot.get("valorEstimatContracte") or pub.get("valorEstimatContracte")
            if not fields.get("revisio_preus"):
                fields["revisio_preus"] = EnrichmentService._safe_get_ca(lot, "revisioPreus")
            
            # Durada detallada
            durada = lot.get("duradaTermini", {})
            if durada and isinstance(durada, dict):
                if fields.get("durada_anys") is None:
                    fields["durada_anys"] = durada.get("anys")
                if fields.get("durada_mesos") is None:
                    fields["durada_mesos"] = durada.get("mesos")
                if fields.get("durada_dies") is None:
                    fields["durada_dies"] = durada.get("dies")
            
            # Subcontractació
            if fields.get("subcontractacio_permesa") is None:
                fields["subcontractacio_permesa"] = lot.get("subcontractacio")
            
            # Peu de recurs (fallback)
            if not fields.get("peu_recurs"):
                fields["peu_recurs"] = EnrichmentService._safe_get_ca(lot, "peuDeRecurs")
        
        # Formalització: dates d'execució i detalls adjudicatari
        if formalitzacio:
            lot_list = EnrichmentService._safe_get(formalitzacio, "publicacio", "dadesPublicacioLot") or []
            lot = lot_list[0] if lot_list else {}
            
            inici = lot.get("iniciTerminiExecucio")
            fi = lot.get("fiTerminiExecucio")
            if inici and not fields.get("data_inici_execucio"):
                try:
                    fields["data_inici_execucio"] = datetime.fromisoformat(inici.replace("Z", "+00:00")).date()
                except Exception:
                    pass
            if fi and not fields.get("data_fi_execucio"):
                try:
                    fields["data_fi_execucio"] = datetime.fromisoformat(fi.replace("Z", "+00:00")).date()
                except Exception:
                    pass
            
            # Empresa contractista detallada
            empreses = lot.get("empresaContractista", [])
            if empreses and isinstance(empreses, list) and len(empreses) > 0:
                emp = empreses[0]
                if not fields.get("adjudicatari_tipus_empresa"):
                    fields["adjudicatari_tipus_empresa"] = EnrichmentService._safe_get_ca(emp, "tipusEmpresa")
                if not fields.get("adjudicatari_tercer_sector"):
                    fields["adjudicatari_tercer_sector"] = EnrichmentService._safe_get_ca(emp, "tercerSector")
                if not fields.get("adjudicatari_telefon"):
                    fields["adjudicatari_telefon"] = emp.get("telefon")
                if not fields.get("adjudicatari_email"):
                    fields["adjudicatari_email"] = emp.get("email")
        
        # Adjudicació: fallback per empresa adjudicatària
        if adjudicacio and not fields.get("adjudicatari_tipus_empresa"):
            lot_list = EnrichmentService._safe_get(adjudicacio, "publicacio", "dadesPublicacioLot") or []
            lot = lot_list[0] if lot_list else {}
            empreses = lot.get("empresesAdjudicataries", [])
            if empreses and isinstance(empreses, list) and len(empreses) > 0:
                emp = empreses[0]
                if not fields.get("adjudicatari_tipus_empresa"):
                    fields["adjudicatari_tipus_empresa"] = EnrichmentService._safe_get_ca(emp, "tipusEmpresa")
                if not fields.get("adjudicatari_tercer_sector"):
                    fields["adjudicatari_tercer_sector"] = EnrichmentService._safe_get_ca(emp, "tercerSector")
        
        # Filtrar None values
        return {k: v for k, v in fields.items() if v is not None}

    @staticmethod
    def enrich_contract(db: Session, contrato_id: int) -> dict:
        """Enriqueix un sol contracte descarregant els seus JSON de fases."""
        contrato = db.query(models.Contrato).filter(models.Contrato.id == contrato_id).first()
        if not contrato:
            return {"error": "Contracte no trobat"}
        
        stats = {"fases_descarregades": 0, "camps_actualitzats": 0, 
                 "criteris": 0, "membres_mesa": 0, "documents": 0, "errors": []}
        
        # Descarregar cada fase amb pausa
        fases = {
            "licitacio": contrato.url_json_licitacio,
            "avaluacio": contrato.url_json_avaluacio,
            "adjudicacio": contrato.url_json_adjudicacio,
            "formalitzacio": contrato.url_json_formalitzacio,
        }
        
        fase_data = {}
        for fase_nom, url in fases.items():
            if url:
                data = EnrichmentService._fetch_json(url)
                if data:
                    fase_data[fase_nom] = data
                    stats["fases_descarregades"] += 1
                time.sleep(REQUEST_DELAY_SECONDS)
        
        if not fase_data:
            stats["errors"].append("Cap JSON de fase disponible")
            return stats
        
        # 1. Extreure i aplicar camps escalars
        scalar_fields = EnrichmentService._extract_scalar_fields(
            fase_data.get("licitacio"),
            fase_data.get("avaluacio"),
            fase_data.get("adjudicacio"),
            fase_data.get("formalitzacio")
        )
        
        for field, value in scalar_fields.items():
            if hasattr(contrato, field):
                setattr(contrato, field, value)
                stats["camps_actualitzats"] += 1
        
        # 2. Criteris d'adjudicació (buscar a la fase amb més info)
        criteris = []
        for fase_nom in ["licitacio", "adjudicacio", "formalitzacio"]:
            if fase_nom in fase_data:
                criteris = EnrichmentService._extract_criteris(fase_data[fase_nom])
                if criteris:
                    break
        
        if criteris:
            # Esborrar els anteriors i crear-ne de nous
            db.query(models.CriteriAdjudicacio).filter(
                models.CriteriAdjudicacio.contrato_id == contrato.id
            ).delete()
            for c in criteris:
                db.add(models.CriteriAdjudicacio(
                    contrato_id=contrato.id,
                    index=c["index"],
                    criteri_nom=c["criteri_nom"],
                    ponderacio=c["ponderacio"],
                    desglossament_json=c["desglossament_json"]
                ))
            stats["criteris"] = len(criteris)
        
        # 3. Membres de la Mesa (normalment a avaluació)
        members = []
        if "avaluacio" in fase_data:
            members = EnrichmentService._extract_mesa_members(fase_data["avaluacio"])
        
        if members:
            db.query(models.MembreMesa).filter(
                models.MembreMesa.contrato_id == contrato.id
            ).delete()
            for m in members:
                db.add(models.MembreMesa(
                    contrato_id=contrato.id,
                    nom=m["nom"],
                    cognoms=m["cognoms"],
                    carrec=m["carrec"]
                ))
            stats["membres_mesa"] = len(members)
        
        # 4. Documents de totes les fases
        all_docs = []
        for fase_nom, data in fase_data.items():
            docs = EnrichmentService._extract_documents(data, fase_nom)
            all_docs.extend(docs)
        
        if all_docs:
            db.query(models.DocumentFase).filter(
                models.DocumentFase.contrato_id == contrato.id
            ).delete()
            for d in all_docs:
                db.add(models.DocumentFase(
                    contrato_id=contrato.id,
                    fase=d["fase"],
                    tipus_document=d["tipus_document"],
                    titol=d["titol"],
                    document_id=d.get("document_id"),
                    hash_document=d.get("hash_document"),
                    mida=d.get("mida"),
                    url_descarrega=d.get("url_descarrega")
                ))
            stats["documents"] = len(all_docs)
        
        # Marcar com a enriquit
        contrato.fecha_enriquiment = datetime.now()
        db.commit()
        
        logger.info(f"Contracte {contrato.codi_expedient} enriquit: {stats}")
        return stats

    @staticmethod
    def enrich_batch_stream(db: Session, contrato_ids: list = None, 
                            force: bool = False) -> Generator:
        """
        Enriqueix múltiples contractes en batch, retornant progrés com a SSE.
        
        Args:
            db: Sessió de BD
            contrato_ids: IDs específics, o None per tots els que tenen URLs
            force: Si True, re-enriqueix inclús si ja s'ha fet
        """
        import json as json_mod
        
        query = db.query(models.Contrato)
        
        if contrato_ids:
            query = query.filter(models.Contrato.id.in_(contrato_ids))
        else:
            # Només contractes que tenen almenys un URL de fase
            query = query.filter(
                (models.Contrato.url_json_licitacio != None) |
                (models.Contrato.url_json_avaluacio != None) |
                (models.Contrato.url_json_adjudicacio != None) |
                (models.Contrato.url_json_formalitzacio != None)
            )
        
        if not force:
            query = query.filter(models.Contrato.fecha_enriquiment == None)
        
        contratos = query.all()
        total = len(contratos)
        
        if total == 0:
            yield f'data: {json_mod.dumps({"msg": "No hi ha contractes per enriquir.", "progress": 100, "done": True})}\n\n'
            return
        
        yield f'data: {json_mod.dumps({"msg": f"Iniciant enriquiment de {total} contractes...", "progress": 0})}\n\n'
        
        enriched = 0
        errors = 0
        
        for i, contrato in enumerate(contratos):
            try:
                progress = int(100 * i / total)
                yield f'data: {json_mod.dumps({"msg": f"Enriquint {contrato.codi_expedient} ({i+1}/{total})...", "progress": progress})}\n\n'
                
                result = EnrichmentService.enrich_contract(db, contrato.id)
                
                if result.get("error"):
                    errors += 1
                else:
                    enriched += 1
                    fases = result.get("fases_descarregades", 0)
                    docs = result.get("documents", 0)
                    yield f'data: {json_mod.dumps({"msg": f"✅ {contrato.codi_expedient}: {fases} fases, {docs} documents", "progress": progress})}\n\n'
                
                # Pausa extra entre batches
                if (i + 1) % BATCH_SIZE == 0 and i < total - 1:
                    yield f'data: {json_mod.dumps({"msg": f"⏳ Pausa de {BATCH_DELAY_SECONDS}s per evitar bloqueig...", "progress": progress})}\n\n'
                    time.sleep(BATCH_DELAY_SECONDS)
                    
            except Exception as e:
                errors += 1
                logger.error(f"Error enriquint {contrato.codi_expedient}: {e}")
                yield f'data: {json_mod.dumps({"msg": f"❌ Error en {contrato.codi_expedient}: {str(e)[:100]}", "progress": progress})}\n\n'
                db.rollback()
        
        summary = f"Enriquiment completat: {enriched} correctes, {errors} errors de {total} total"
        yield f'data: {json_mod.dumps({"msg": summary, "progress": 100, "done": True, "enriched": enriched, "errors": errors, "total": total})}\n\n'
