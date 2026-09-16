"""Centralized AI service for PeerUP.

Primary provider:  Google Gemini
Fallback provider: Groq

This module exposes the low-level call primitives used by all AI-powered
endpoints. Higher-level learning session logic lives in dedicated service
modules (e.g. learning_session_service.py) built around the new workflow.

Public API
----------
call_gemini(prompt, *, system, temperature, json_mode, timeout)
call_groq(prompt, *, system, temperature, timeout)
call_with_fallback(prompt, *, system, temperature, json_mode, timeout)
    → (raw_text: str, provider: str)
parse_json(text) → dict | list
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    """Remove markdown code fences from an AI response."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```", 2)
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
    return text.strip()


def parse_json(text: str) -> dict | list:
    """Strip markdown fences then parse JSON. Raises json.JSONDecodeError on failure."""
    return json.loads(_strip_fences(text))


# ─────────────────────────────────────────────────────────────────────────────
# Gemini
# ─────────────────────────────────────────────────────────────────────────────

def _call_gemini_sync(
    prompt: str,
    system: str | None,
    temperature: float,
    json_mode: bool,
) -> str:
    """Synchronous Gemini call — runs in a thread via asyncio.to_thread."""
    from app.core.config import settings
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    cfg_kwargs: dict[str, Any] = {"temperature": temperature}
    if json_mode:
        cfg_kwargs["response_mime_type"] = "application/json"
    if system:
        cfg_kwargs["system_instruction"] = system

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(**cfg_kwargs),
    )
    return response.text.strip()


async def call_gemini(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    json_mode: bool = True,
    timeout: float | None = None,
) -> str:
    """Async Gemini call. Returns raw response text."""
    import asyncio
    from app.core.config import settings

    _timeout = timeout or float(settings.AI_REQUEST_TIMEOUT)
    return await asyncio.wait_for(
        asyncio.to_thread(_call_gemini_sync, prompt, system, temperature, json_mode),
        timeout=_timeout,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Groq
# ─────────────────────────────────────────────────────────────────────────────

async def call_groq(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    timeout: float | None = None,
) -> str:
    """Async Groq call. Returns raw response text."""
    from app.core.config import settings
    from groq import AsyncGroq

    _timeout = timeout or float(settings.AI_REQUEST_TIMEOUT)
    client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=_timeout)

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


# ─────────────────────────────────────────────────────────────────────────────
# Gemini → Groq fallback
# ─────────────────────────────────────────────────────────────────────────────

async def call_with_fallback(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    json_mode: bool = True,
    timeout: float | None = None,
) -> tuple[str, str]:
    """Try Gemini; fall back to Groq if Gemini fails.

    Returns
    -------
    (raw_text, provider_name)  where provider_name is "gemini" or "groq".

    Raises RuntimeError if both providers fail.
    """
    from app.core.config import settings

    if settings.GEMINI_API_KEY:
        try:
            text = await call_gemini(
                prompt,
                system=system,
                temperature=temperature,
                json_mode=json_mode,
                timeout=timeout,
            )
            return text, "gemini"
        except Exception as exc:
            logger.warning("Gemini call failed: %s", exc)

    if settings.GROQ_API_KEY:
        try:
            text = await call_groq(
                prompt,
                system=system,
                temperature=temperature,
                timeout=timeout,
            )
            return text, "groq"
        except Exception as exc:
            logger.warning("Groq call failed: %s", exc)

    raise RuntimeError("All AI providers failed — check API keys and network.")
