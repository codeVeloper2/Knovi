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
    json_mode: bool = True,
    timeout: float | None = None,
) -> str:
    """Async Groq call. Returns raw response text.

    GPT-OSS models spend part of their completion budget on reasoning. The old
    SDK default is too small for PeerUP's JSON tutor payloads, which can cause
    Groq to stop before a complete JSON document is emitted. Use low reasoning
    effort and an explicit completion budget, with one larger retry if Groq
    still reports an incomplete/invalid JSON completion.
    """
    from app.core.config import settings
    from groq import AsyncGroq

    _timeout = timeout or float(settings.AI_REQUEST_TIMEOUT)
    client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=_timeout)

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    is_gpt_oss = str(settings.GROQ_MODEL).startswith("openai/gpt-oss-")
    budgets = (4096, 8192) if json_mode else (2048, 4096)
    last_exc: Exception | None = None

    for max_completion_tokens in budgets:
        kwargs: dict[str, Any] = {
            "model": settings.GROQ_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens": max_completion_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        if is_gpt_oss:
            kwargs["reasoning_effort"] = "low"
            kwargs["reasoning_format"] = "hidden"

        try:
            response = await client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""
            if content.strip():
                return content
            raise ValueError("Groq returned an empty response")
        except Exception as exc:
            last_exc = exc
            # Retry once with a larger completion budget. This specifically
            # handles GPT-OSS responses that exhaust the JSON completion budget.
            if max_completion_tokens != budgets[-1]:
                logger.warning(
                    "Groq completion failed at %s tokens; retrying with %s: %s",
                    max_completion_tokens, budgets[-1], exc,
                )
                continue
            raise

    raise last_exc or RuntimeError("Groq returned no response")


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
                json_mode=json_mode,
                timeout=timeout,
            )
            return text, "groq"
        except Exception as exc:
            logger.warning("Groq call failed: %s", exc)

    raise RuntimeError("All AI providers failed — check API keys and network.")
