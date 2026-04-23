import logging
import httpx
import fitz  # PyMuPDF
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import json

from services.ai_service import AIService
from services.gemini_service import GeminiService
from services.ollama_service import OllamaService
from services.external_api_client import DEFAULT_TIMEOUT, DEFAULT_HEADERS

logger = logging.getLogger(__name__)

class PPTService:
    @staticmethod
    async def download_and_extract_pdf(url: str, max_pages: int = 20) -> str:
        """Descarga un PDF i n'extreu els primers 'max_pages' de text per reduir mida de token."""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url, headers=DEFAULT_HEADERS, follow_redirects=True)
                response.raise_for_status()
                
                # Check if it's a PDF. If it's a ZIP or doc we can't extract easily with fitz, 
                # but standard contractaciopublica returns PDFs for pliegos.
                if b"%PDF" not in response.content[:10]:
                    logger.warning(f"URL did not return a valid PDF signature: {url}")
                    return "El document no és un PDF o no es pot llegir automàticament."
                
                # Load PDF from memory
                doc = fitz.open(stream=response.content, filetype="pdf")
                text_content = []
                pages_to_extract = min(len(doc), max_pages)
                
                for i in range(pages_to_extract):
                    page = doc.load_page(i)
                    text = page.get_text("text")
                    text_content.append(text)
                
                doc.close()
                raw_text = "\n\n".join(text_content)
                # Cleanup huge whitespaces
                import re
                raw_text = re.sub(r'\n{3,}', '\n\n', raw_text)
                return raw_text
                
        except Exception as e:
            logger.error(f"Error extracting PDF from {url}: {str(e)}")
            return f"[Error llegint document: {str(e)}]"

    @staticmethod
    async def extract_index_from_documents(db: Session, urls: List[str]) -> List[Dict[str, str]]:
        if not urls:
            return []
            
        # Per MVP: fem servir el text del primer document, o combinem els primers 5 fulls de cadascun
        # Massa text saturarà la finestra de memòria d'Ollama (Gemini aguanta fins a 1M tokens, però Ollama potser 4k-8k).
        extracted_texts = []
        for u in urls[:3]: # Limitem a max 3 docs per l'Index
            text = await PPTService.download_and_extract_pdf(u, max_pages=15)
            extracted_texts.append(f"--- DOCUMENT INIT ---\n{text}\n--- DOCUMENT END ---")
            
        full_context = "\n\n".join(extracted_texts)
        
        prompt = f"""
Ets un consultor expert en redacció de Plànols Tècnics (PPT) per administració pública.
Aquí tens l'extracció de les primeres pàgines d'un o més documents de referència:

{full_context[:10000]}  // Límitem els tokens inicials

A partir d'ells, dedueix i extreu l'ÍNDEX complet de seccions que hauria de tenir el nou document de Plec de Prescripcions Tècniques.
Retorna SOLAMENT un JSON vàlid, que sigui un array d'objectes on cada objecte tingui la clau "title" (el nom de l'apartat).
Exemple formatt:
[
  {{"title": "1. Objecte del Contracte"}},
  {{"title": "2. Necessitats a cobrir"}}
]
No escriguis cap altre comentari fora del JSON.
"""
        provider = AIService.get_provider(db)
        if provider == "disabled":
            raise ValueError("L'API de IA està desactivada.")
            
        try:
            if provider == "gemini":
                raw_ans = await GeminiService._call_gemini(db, prompt)
                content = GeminiService.clean_text_response(raw_ans)
            else:
                raw_ans = await OllamaService._call_ollama(db, prompt)
                content = OllamaService.clean_text_response(raw_ans)
                
            # Buscar on comença l'array (si el model no fa cas i escriu text abans)
            import re
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                return parsed
            else:
                parsed = json.loads(content)
                return parsed
        except Exception as e:
            logger.error(f"Failed to generate Index: {str(e)}")
            # Fallback
            return [
                {"title": "1. Introducció i Objecte"},
                {"title": "2. Pressupost i Terminis"},
                {"title": "3. Condicions Tècniques d'Execució"},
                {"title": "4. Control i Seguiment"},
                {"title": "5. Penalitzacions"}
            ]

    @staticmethod
    async def generate_section(db: Session, title: str, instructions: str, urls: List[str]) -> str:
        # Aquí teòricament s'analitzaria el chunk sencer dels documents i les instruccions específiques
        # Com a versió base asíncrona:
        prompt = f"""
Ets un redactor tècnic expert en sector públic (català).
Tasca: Genera l'apartat "{title}" per a un nou Plec Tècnic.
El usuari t'ha proveït aquestes instruccions addicionals concretes per adaptar-ho: "{instructions}"

Redacta de forma professional i objectiva aquesta clàusula usant markdown. Mantén to legal i ferm.
"""
        provider = AIService.get_provider(db)
        if provider == "disabled":
            return "⚠️ IA desactivada."
            
        if provider == "gemini":
            raw_ans = await GeminiService._call_gemini(db, prompt)
            return GeminiService.clean_text_response(raw_ans)
        else:
            raw_ans = await OllamaService._call_ollama(db, prompt)
            return OllamaService.clean_text_response(raw_ans)
