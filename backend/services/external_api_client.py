"""
Client HTTP centralitzat per a totes les crides a APIs externes.
Totes les crides passen pel rate limiter extern corresponent.
"""
import httpx
import logging
from typing import Any, Optional, Dict
from urllib.parse import urlparse

from core.rate_limiter import sync_api_limiter, ai_api_limiter, proxy_api_limiter

logger = logging.getLogger(__name__)

ALLOWED_PROXY_DOMAINS = [
    "analisi.transparenciacatalunya.cat",
    "governobert.gencat.cat",
    "contractaciopublica.cat",
    "contractaciopublica.gencat.cat",
]

DEFAULT_TIMEOUT = 30.0
DEFAULT_HEADERS = {"User-Agent": "LicitIA/2.0"}


class ExternalAPIClient:
    """Client per a crides a APIs externes amb rate limiting."""

    @staticmethod
    async def fetch_transparencia(url: str, params: Optional[Dict] = None) -> Any:
        """GET a l'API de Transparència amb rate limit."""
        async with sync_api_limiter:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                response = await client.get(
                    url, params=params, headers=DEFAULT_HEADERS, follow_redirects=True
                )
                response.raise_for_status()
                return response.json()

    @staticmethod
    async def fetch_transparencia_sync(url: str, params: Optional[Dict] = None) -> Any:
        """GET síncron a l'API de Transparència amb rate limit (per syncservice)."""
        # For sync contexts, use regular httpx
        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            response = client.get(
                url, params=params, headers=DEFAULT_HEADERS, follow_redirects=True
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def fetch_ollama(base_url: str, endpoint: str, payload: dict = None, method: str = 'POST') -> Any:
        """Peticions HTTP a Ollama amb rate limit."""
        from core.rate_limiter import ai_api_limiter
        async with ai_api_limiter:
            url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
            async with httpx.AsyncClient(timeout=120.0) as client:
                if method.upper() == 'GET':
                    response = await client.get(url)
                else:
                    response = await client.post(url, json=payload or {})
                response.raise_for_status()
                return response.json()

    @staticmethod
    async def fetch_gemini(model: str, api_key: str, payload: dict) -> Any:
        """POST a Gemini API amb rate limit. API key al HEADER (no a la URL)."""
        async with ai_api_limiter:
            url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent"
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                return response.json()

    @staticmethod
    async def proxy_fetch(url: str) -> Any:
        """Proxy JSON amb whitelist de dominis i rate limit."""
        parsed = urlparse(url)

        if parsed.hostname not in ALLOWED_PROXY_DOMAINS:
            raise ValueError(
                f"Domini no permès: {parsed.hostname}. "
                f"Dominis permesos: {', '.join(ALLOWED_PROXY_DOMAINS)}"
            )

        async with proxy_api_limiter:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                response = await client.get(
                    url, headers=DEFAULT_HEADERS, follow_redirects=True
                )
                # Verificar redirecció
                final_host = urlparse(str(response.url)).hostname
                if final_host not in ALLOWED_PROXY_DOMAINS:
                    raise ValueError(f"Redirecció a domini no permès: {final_host}")
                response.raise_for_status()
                return response.json()
