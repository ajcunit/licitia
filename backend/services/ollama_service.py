import httpx
import json
import logging
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple
import models

from core.config import settings
from services.external_api_client import ExternalAPIClient

logger = logging.getLogger(__name__)

class OllamaService:
    @staticmethod
    async def get_available_models(db: Session) -> List[str]:
        config = OllamaService.get_config(db)
        try:
            # We fetch from ollama API directly for available models
            data = await ExternalAPIClient.fetch_ollama(config['url'], 'api/tags', method='GET')
            if 'models' in data:
                return [m['name'] for m in data['models']]
        except Exception as e:
            logger.error(f"Could not load Ollama models from {config['url']}: {e}")
        return ["llama3", "mistral", "mixtral", "qwen"]

    @staticmethod
    async def _call_ollama(db: Session, prompt: str) -> str:
        config = OllamaService.get_config(db)
        think_val = OllamaService.get_think_param(db, config['model'])
        payload = {"model": config['model'], "prompt": prompt, "stream": False}
        if think_val is not None:
            payload["think"] = think_val

        try:
            data = await ExternalAPIClient.fetch_ollama(config['url'], 'api/generate', payload)
            return data.get("response", "")
        except Exception as e:
            logger.error(f"Error direct call to Ollama with payload {payload}: {str(e)}")
            return ""

    @staticmethod
    def get_config(db: Session, feature: str = "cpv") -> Dict[str, str]:
        url_cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == "ollama_url").first()
        model_clave = f"ollama_model_{feature}"
        model_cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == model_clave).first()
        
        # Fallback to general 'ollama_model' if the specific one is missing (legacy compat)
        if not model_cfg or not model_cfg.valor:
            model_cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == "ollama_model").first()
            
        think_cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == "ollama_think").first()
        
        return {
            "url": url_cfg.valor if url_cfg else "http://localhost:11434",
            "model": model_cfg.valor if model_cfg and model_cfg.valor else "llama3",
            "think": think_cfg.valor if think_cfg else "smart"
        }

    @staticmethod
    def get_think_param(db: Session, model_name: str):
        """Retorna el valor adequat per al paràmetre 'think' segons el model o la configuració."""
        config = OllamaService.get_config(db, feature="cpv") # Use cpv default for reading think setting
        think_conf = config.get("think", "smart").lower()
        
        if think_conf == "none":
            return None
        if think_conf == "false":
            return False
        if think_conf in ["low", "medium", "high"]:
            return think_conf
            
        # Logica 'smart' (per defecte)
        model_name = model_name.lower()
        if "gpt-oss" in model_name:
            return "low"
        if "deepseek-r1" in model_name or "qwen3" in model_name:
            return False
        return None

    @staticmethod
    def clean_json_response(content: str) -> str:
        """Neteja la resposta per extreure el JSON vālid, manejant blocs de 'thinking' i markdown."""
        content = content.strip()
        
        # 0. Eliminar blocs <think>...</think> (models Qwen/DeepSeek en mode think)
        import re
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        
        # 1. Eliminar blocs de <thought> o <thinking> si existeixen
        if "<thought>" in content and "</thought>" in content:
            content = content.split("</thought>")[-1].strip()
        if "<thinking>" in content and "</thinking>" in content:
            content = content.split("</thinking>")[-1].strip()
            
        # 2. Si el contingut encara sembla JSON però està dins de blocs markdown
        if "```" in content:
            parts = content.split("```")
            for part in parts:
                cleaned = part.strip()
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:].strip()
                if (cleaned.startswith("[") and cleaned.endswith("]")) or (cleaned.startswith("{") and cleaned.endswith("}")):
                    return cleaned
                    
        # 3. Intentar trobar el primer '[' i l'ultim ']' si no s'ha trobat res encara
        if not (content.startswith("[") or content.startswith("{")):
            start_bracket = content.find("[")
            end_bracket = content.rfind("]")
            if start_bracket != -1 and end_bracket != -1:
                return content[start_bracket:end_bracket+1]
                
        return content

    @staticmethod
    def clean_text_response(content: str) -> str:
        """Neteja la resposta per extreure text, manejant blocs de 'think' propis de certs models."""
        content = content.strip()
        
        while "<think>" in content and "</think>" in content:
            start = content.find("<think>")
            end = content.find("</think>") + len("</think>")
            content = content[:start] + content[end:]
            content = content.strip()
            
        if "<thought>" in content and "</thought>" in content:
            content = content.split("</thought>")[-1].strip()
        if "<thinking>" in content and "</thinking>" in content:
            content = content.split("</thinking>")[-1].strip()
            
        return content.strip()

    @staticmethod
    def get_prompt(db: Session, clave: str, default: str) -> str:
        cfg = db.query(models.Configuracion).filter(models.Configuracion.clave == clave).first()
        return cfg.valor if cfg and cfg.valor else default

    @staticmethod
    async def extract_keywords(db: Session, description: str) -> Tuple[List[str], List[str], List[str]]:
        default_prompt = """Ets un expert en CPV europeu. Per aquest objecte de contracte:
"{description}"

1. Extrau 4-6 paraules clau en català (noms o adjectius).
2. Identifica les 2 DIVISIONS (els 2 primers dígits) més probables.
3. Suggereix 3 CODIS CPV (8 dígits) concrets que podrien ser els correctes.

Respon NOMÉS amb aquest format:
Paraules: paraula1, paraula2...
Divisions: 00, 00
Codis: 00000000, 00000000..."""
        
        prompt_tmpl = OllamaService.get_prompt(db, "prompt_cpv_extract", default_prompt)
        prompt = prompt_tmpl.format(description=description)

        config = OllamaService.get_config(db, feature="cpv")
        
        think_val = OllamaService.get_think_param(db, config['model'])
        payload = {"model": config['model'], "prompt": prompt, "stream": False}
        if think_val is not None:
            payload["think"] = think_val

        try:
            data = await ExternalAPIClient.fetch_ollama(
                config['url'], 'api/generate', payload
            )
            raw_text = data.get("response", "")
            content = OllamaService.clean_text_response(raw_text)
            
            import re
            # Extraure paraules
            words_match = re.search(r'paraules:\s*(.*)', content, re.IGNORECASE)
            words_str = words_match.group(1) if words_match else content
            all_words = re.findall(r'[a-zàèòéíóúüç\d]{4,}', words_str.lower())
            
            # Extraure divisions
            divs_match = re.search(r'divisions:\s*(.*)', content, re.IGNORECASE)
            divs_str = divs_match.group(1) if divs_match else ""
            divisions = re.findall(r'\b\d{2}\b', divs_str)
            
            # Extraure codis suggerits
            codes_match = re.search(r'codis:\s*(.*)', content, re.IGNORECASE)
            codes_str = codes_match.group(1) if codes_match else ""
            suggested_codes = re.findall(r'\b\d{8}\b', codes_str)
            
            stopwords = {
                'aquest', 'aquesta', 'aquestes', 'aquells', 'aquelles', 'perquè', 'com', 'quan', 'on',
                'molt', 'poc', 'més', 'menys', 'estat', 'estan', 'sigui', 'seria', 'tenen', 'tenia',
                'sobre', 'entre', 'sota', 'fent', 'cada', 'segle', 'any', 'mes', 'dia', 'hores',
                'contracte', 'servei', 'serveis', 'subministrament', 'obra', 'obres', 'menor', 'major',
                'licitació', 'adjudicació', 'expedient', 'objecte', 'paraules'
            }
            
            keywords = [w for w in all_words if w not in stopwords and not re.search(r'\d', w)]
            return list(dict.fromkeys(keywords))[:10], list(dict.fromkeys(divisions))[:3], list(dict.fromkeys(suggested_codes))[:5]
        except Exception:
            return [], [], []

    @staticmethod
    def _stem_catalan(word: str) -> str:
        """Sufixos de plurals i derivats comuns en català per fer cerques més amples."""
        w = word.lower().strip()
        if len(w) < 4: return w
        
        # Plurals comuns
        if w.endswith('es'): return w[:-2] # festes -> fest
        if w.endswith('ons'): return w[:-2] # furgons -> furgon
        if w.endswith('ns'): return w[:-1] # gossos -> gosso (més avall es treu la o)
        if w.endswith('s') and not w.endswith('ss'): return w[:-1]
        
        # Masculí/Femení/Plural de derivats
        if w.endswith('iva'): return w[:-3] # administrativa -> admin
        if w.endswith('iu'): return w[:-2]
        
        return w
    @staticmethod
    async def rank_candidates(db: Session, description: str, candidates: List[models.CPV]) -> List[Dict[str, Any]]:
        config = OllamaService.get_config(db, feature="cpv")
        list_text = "\n".join([f"- {r.codigo}: {r.descripcion} ({r.nivel})" for r in candidates])
        
        default_prompt = """You are an expert in European public procurement, specialized in CPV classification (Reg. 213/2008). 
Your task is to rank the candidates provided below for the contract description. 
Select the most specific and accurate code.
Return a valid JSON array of objects with 'codigo', 'descripcion', 'score' (0.0-1.0), and 'justificacion' (short, in Catalan)."""

        prompt_tmpl = OllamaService.get_prompt(db, "prompt_cpv_rank", default_prompt)
        # Check if the prompt uses placeholders
        try:
            user_prompt = prompt_tmpl.format(description=description, candidates=list_text)
        except Exception:
            user_prompt = f"{prompt_tmpl}\n\n- OBJECT: \"{description}\"\n\n- CANDIDATE LIST:\n{list_text}"
        
        system_prompt = "You are an expert in CPV classification."
        
        think_val = OllamaService.get_think_param(db, config['model'])
        payload = {"model": config['model'], "prompt": f"{system_prompt}\n\n{user_prompt}", "stream": False, "format": "json"}
        if think_val is not None: payload["think"] = think_val

        try:
            data = await ExternalAPIClient.fetch_ollama(
                config['url'], 'api/generate', payload
            )
            raw_text = data.get("response", "")
            results = json.loads(OllamaService.clean_text_response(raw_text))
            
            if isinstance(results, dict) and "suggestions" in results:
                results = results["suggestions"]
            
            # Millorar descripcions
            code_map = {c.codigo: c.descripcion for c in candidates}
            for res in results[:5]:
                if res.get('codigo') in code_map:
                    res['descripcion'] = code_map[res['codigo']]
            return results[:5]
        except Exception as e:
            logger.error(f"Error ranking candidates with Ollama: {str(e)}")
            return [{"codigo": c.codigo, "descripcion": c.descripcion, "score": 0.5, "justificacion": "Error IA"} for c in candidates[:3]]

    @staticmethod
    async def analyze_auditoria(db: Session, data: Dict[str, Any], custom_prompt: Optional[str] = None) -> str:
        config = OllamaService.get_config(db, feature="auditoria")
        
        default_prompt = """Ets un auditor expert en contractació pública. Analitza aquestes dades de risc (redflags):
{data}

{custom_prompt}

Proporciona un informe executiu breu (en català) amb:
1. Resum de riscos detectats.
2. Recomanacions d'actuació.
Utilitza format Markdown."""

        prompt_tmpl = OllamaService.get_prompt(db, "prompt_auditoria", default_prompt)
        try:
            prompt = prompt_tmpl.format(data=json.dumps(data, indent=2, ensure_ascii=False), custom_prompt=custom_prompt or "")
        except Exception:
            prompt = f"{prompt_tmpl}\n\nDATA:\n{json.dumps(data, indent=2, ensure_ascii=False)}\n\n{custom_prompt or ''}"

        think_val = OllamaService.get_think_param(db, config['model'])
        payload = {"model": config['model'], "prompt": prompt, "stream": False}
        if think_val is not None: payload["think"] = think_val

        try:
            data = await ExternalAPIClient.fetch_ollama(
                config['url'], 'api/generate', payload
            )
            content = data.get("response", "")
            return OllamaService.clean_text_response(content)
        except Exception as e:
            return f"Error connectant amb IA: {str(e)}"

    @staticmethod
    def _clean_description(description: str) -> str:
        """Neteja prefixos administratius comuns per deixar l'objecte real."""
        desc = description.strip()
        prefixes = [
            "Contracte de", "Contractació de", "Contractació del", "Contractació de la", "Contractacio de",
            "Concessió demanial per", "Concessió demanial", "Concessió administrativa per", "Concessió de",
            "Atorgament d'autoritzacions per", "Atorgament de", "Autorització per", "Autoritzacions per",
            "Licitació per", "Servei de", "Serveis de", "Subministrament de", "Subministrament i instal·lació de",
            "Obra de", "Obres de", "Treballs de", "Adquisició de", "Compra de", "Lloguer de", "Arrendament de",
            "Contracte menor de", "Contracte menor", "Patrocini de", "Patrocini", "Subscripció a",
            "Servei per part d'una", "Servei per part d’una", "Servei per part de la", "Servei per part de", "Serveis per part de"
        ]
        
        lower_desc = desc.lower()
        for p in prefixes:
            if lower_desc.startswith(p.lower()):
                rest = desc[len(p):].strip()
                # Netejar articles inicials restants
                articles = ["de la ", "del ", "dels ", "de ", "la ", "el ", "els ", "les ", "l'"]
                for art in articles:
                    if rest.lower().startswith(art):
                        rest = rest[len(art):].strip()
                        break
                return rest
        return desc

    @staticmethod
    def _detect_contract_type(description: str) -> str:
        """Detecta el tipus de contracte per guiar la cerca CPV amb heurístiques millorades."""
        desc_lower = description.lower().strip()
        
        # 1. PRIORITAT A: Paraules clau definitives
        if any(w in desc_lower for w in ['concessió', 'autorització', 'explotació', 'gestió', 'direcció d\'obra', 'direcció facultativa']):
            if 'execució' not in desc_lower[:50]:
                return "servei"

        # 2. PRIORITAT B: Paraules al principi
        supply_keywords = ['subministrament', 'adquisició', 'compra', 'lliurament', 'equipament', 'gasoil', 'energia']
        service_keywords = ['manteniment', 'servei', 'reparació', 'consultoria', 'assessorament', 'gestió', 
                          'suport', 'assistència', 'dinamització', 'patrocini', 'assegurança', 'pòlissa',
                          'audit', 'revisió', 'neteja', 'vigilància', 'seguretat', 'formació', 'docència',
                          'transport', 'recollida', 'tractament', 'redacció', 'estudi', 'projecte de',
                          'gossera', 'recollida d\'animals', 'protectora']
        works_keywords = ['obra', 'obres', 'construcció', 'rehabilitació', 'urbanització',
                        'pavimentació', 'edificació', 'demolició', 'adequació', 'reforma', 
                        'asfaltat', 'voreres', 'renovació', 'reinstal·lació']
        
        for w in supply_keywords:
            if desc_lower.startswith(w): return "subministrament"
        for w in service_keywords:
            if desc_lower.startswith(w): return "servei"
        for w in works_keywords:
            if desc_lower.startswith(w): return "obra"
        
        # 3. FALLBACK: Scoring
        service_score = sum(2 for w in service_keywords if w in desc_lower)
        works_score = sum(2 for w in works_keywords if w in desc_lower)
        supply_score = sum(1 for w in supply_keywords if w in desc_lower)
        
        if "festa major" in desc_lower or "concert" in desc_lower or "espectacle" in desc_lower:
            service_score += 5
        if "redacció" in desc_lower or "projecte" in desc_lower:
            service_score += 3
        if "assegurança" in desc_lower or "renting" in desc_lower or "arrendament" in desc_lower:
            service_score += 4
            
        if "execució" in desc_lower and ("obra" in desc_lower or "treballs" in desc_lower):
            works_score += 4

        if works_score > service_score and works_score > supply_score:
            return "obra"
        elif service_score > works_score and service_score >= supply_score:
            return "servei"
        else:
            return "subministrament"

    @staticmethod
    async def suggest_cpvs(db: Session, description: str, provider: str = "ollama") -> List[Dict[str, Any]]:
        """
        Cerca CPV híbrida (Text + LLM) amb el Model Professional Europeu:
        1. Netejar i detectar tipus de contracte.
        2. Cerca textual forta a la BD per obtenir candidats.
        3. El LLM aplica les 5 passes del mètode (Object vs Purpose) sobre els candidats.
        """
        # IMPORT LOCAL per evitar circularitat
        from services.ai_service import AIService
        from services.gemini_service import GeminiService

        config = OllamaService.get_config(db, feature="cpv")
        think_val = OllamaService.get_think_param(db, config['model'])
        
        # 1. Netejar i detectar tipus
        cleaned_obj = OllamaService._clean_description(description)
        contract_type_ca = OllamaService._detect_contract_type(description)
        type_en = {"servei": "services", "subministrament": "supply", "obra": "works"}.get(contract_type_ca, "services")
        
        # 2. Extreure paraules clau, divisions i codis sugerits (delegat a AIService)
        keywords, divisions, suggested_codes = await AIService.extract_keywords(db, cleaned_obj)
        
        stopwords = {'de', 'del', 'la', 'les', 'el', 'els', 'per', 'pel', 'als', 'amb', 'una', 'un', 'uns', 'unes', 'que', 'com', 'més', 'des', 'dins', 'sobre', 'entre', 'fins', 'tot', 'seva', 'seus', 'ses', 'aquest', 'aquesta', 'servei', 'multi', 'tipus', 'dels', 'les', 'cunit'}
        
        # Si no hi ha keywords, fallback al split
        if not keywords: 
            keywords = [w for w in cleaned_obj.lower().split() if len(w) > 3 and w not in stopwords]
        
        # Afegir paraules de la pròpia descripció
        desc_words = [w for w in cleaned_obj.lower().split() if len(w) > 3 and w not in stopwords]
        for w in desc_words:
            if w not in keywords: keywords.append(w)
        keywords = list(dict.fromkeys(keywords))

        # Expansió de sinònims
        synonyms = {
            'furgoneta': ['furgons'], 'furgonetes': ['furgons'],
            'gossera': ['gossos', 'animals', 'veterinari', 'recollida'],
            'software': ['programari'], 'ordinador': ['equips informatics'],
            'platja': ['platges', 'plaja'], 'festa': ['festes', 'esdeveniments'],
            'jardins': ['jardineria', 'paisatgisme'],
            'aigues': ['aigua', 'distribucio'],
            'vela': ['tenda', 'carpa', 'marquesina', 'parasol'],
            'climatitzacio': ['calefaccio', 'ventilacio', 'aire condicionat', 'clima'],
            'vials': ['pavimentacio', 'asfaltat', 'voreres', 'vies'],
            'projecte': ['redaccio', 'estudi', 'disseny', 'projectes'],
            'grua': ['retirada', 'vehicles', 'remolc', 'diposit'],
            'patrocini': ['esdeveniments', 'publicitat', 'promocio']
        }
        
        import unicodedata
        desc_lower = cleaned_obj.lower()
        expanded_keywords = list(dict.fromkeys(keywords))
        for term, expansion in synonyms.items():
            term_norm = unicodedata.normalize('NFKD', term).encode('ASCII', 'ignore').decode('utf-8').lower()
            if term in desc_lower or term_norm in desc_lower or term in keywords:
                for syn in expansion:
                    if syn not in expanded_keywords: expanded_keywords.append(syn)
        
        keywords = list(dict.fromkeys(expanded_keywords))

        search_results = []
        seen_codes = set()
        match_scores = {}
        def add_result(cpv, score=1.0):
            if cpv.codigo not in seen_codes:
                search_results.append(cpv)
                seen_codes.add(cpv.codigo)
                match_scores[cpv.codigo] = score
            else: match_scores[cpv.codigo] = match_scores.get(cpv.codigo, 1.0) + score
        
        # --- CERCA DIRECTA (Codis sugerits per IA) ---
        for code in suggested_codes:
            # Buscar el codi exacte a la BD
            found_code = db.query(models.CPV).filter(models.CPV.codigo.startswith(code)).first()
            if found_code: add_result(found_code, score=10.0)

        # --- CERCA JERÀRQUICA (Divisions IA) ---
        for div in divisions:
            # 1. Codis arrel d'aquesta divisió (XX000000-8 etc)
            prefix_root = f"{div}000000"
            found_roots = db.query(models.CPV).filter(models.CPV.codigo.startswith(prefix_root)).limit(5).all()
            for f in found_roots: add_result(f, score=5.0)
            
            # 2. Cerca per prefixos de tipus
            prefix_broad = f"{div}%0000" 
            found_broad = db.query(models.CPV).filter(models.CPV.codigo.ilike(prefix_broad)).limit(10).all()
            for f in found_broad: add_result(f, score=2.0)
        
        # Cerca 1: Combinacions de paraules (AND) - Més pes
        significant_keywords = [k for k in keywords if len(k) > 3][:12]
        for i, k1 in enumerate(significant_keywords):
            s1 = OllamaService._stem_catalan(k1)
            for k2 in significant_keywords[i+1:]:
                s2 = OllamaService._stem_catalan(k2)
                # Usem el stem per trobar projecte/projectes, etc.
                found = db.query(models.CPV).filter(models.CPV.descripcion.ilike(f"%{s1}%"), models.CPV.descripcion.ilike(f"%{s2}%")).limit(10).all()
                for f in found: add_result(f, score=5.0)
        
        # Cerca 2: Paraules individuals amb stemming
        for k in keywords[:15]:
            if len(k) < 3: continue
            s = OllamaService._stem_catalan(k)
            found = db.query(models.CPV).filter(models.CPV.descripcion.ilike(f"%{s}%")).limit(15).all()
            for f in found: add_result(f, score=1.0)
        
        # Cerca 3: Fallback si tenim pocs candidats (Cerca fuzzy o per trossos)
        if len(search_results) < 10:
            for k in keywords[:10]:
                if len(k) > 4:
                    # Busquem només la meitat de la paraula per si hi ha plurals o derivats
                    stem = k[:int(len(k)*0.7)]
                    found = db.query(models.CPV).filter(models.CPV.descripcion.ilike(f"%{stem}%")).limit(10).all()
                    for f in found: add_result(f, score=0.5)
        
        type_prefixes = {
            "servei": ["serveis de", "manteniment de", "reparació de", "gestió de", "explotació de", "concessió de"],
            "obra": ["treballs de", "construcció de", "obres de", "reforma de", "rehabilitació de"],
            "subministrament": ["adquisició de", "compra de", "subministrament de"]
        }
        domain_keywords = [k for k in significant_keywords if k not in {'manteniment', 'servei', 'subministrament', 'obra', 'treballs', 'explotació'}]
        for prefix in type_prefixes.get(contract_type_ca, []):
            for dk in domain_keywords[:3]:
                found = db.query(models.CPV).filter(models.CPV.descripcion.ilike(f"%{prefix}%"), models.CPV.descripcion.ilike(f"%{dk}%")).limit(10).all()
                for f in found: add_result(f, score=5.0)
        
        if not search_results:
            for w in cleaned_obj.lower().split()[:8]:
                if len(w) < 4: continue
                found = db.query(models.CPV).filter(models.CPV.descripcion.ilike(f"%{w}%")).limit(5).all()
                for f in found: add_result(f, score=0.5)

        if not search_results: return []
        search_results.sort(key=lambda r: match_scores.get(r.codigo, 0), reverse=True)
        top_results = search_results[:60]
        # 3. Crida al Provider per fer el rànquing final
        if provider == "gemini":
            return await GeminiService.rank_candidates(db, description, top_results)
        
        return await OllamaService.rank_candidates(db, description, top_results)

    @staticmethod
    async def get_available_models(db: Session) -> List[str]:
        config = OllamaService.get_config(db)
        try:
            # GET endpoint - use httpx directly (fetch_ollama is POST-only)
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{config['url']}/api/tags", timeout=10.0)
                response.raise_for_status()
                data = response.json()
                
                # Manejar format de llista directa o diccionari amb clau 'models'
                if isinstance(data, list):
                    models_list = data
                else:
                    models_list = data.get("models", [])
                
                return [m["name"] for m in models_list]
        except Exception as e:
            logger.error(f"Error fetching Ollama models: {e}")
            return []

