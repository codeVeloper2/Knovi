"""AI verification service for PeerUP Peer Teaching sessions.

Primary provider:  Google Gemini (gemini-1.5-flash)
Fallback provider: Groq      (llama-3.1-8b-instant)

Configure via environment variables:
  GEMINI_API_KEY, GEMINI_MODEL
  GROQ_API_KEY,   GROQ_MODEL
  AI_REQUEST_TIMEOUT (seconds, default 30)

Returns structured JSON — never passes raw AI output to the frontend.
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# System prompt
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are PeerUP's learning verification assistant.

Your job is to evaluate whether a student's explanation demonstrates understanding of a curriculum concept.

Rules:
- Evaluate ONLY against the supplied curriculum context
- Do NOT invent curriculum facts
- Do NOT judge grammar, writing style, or intelligence
- Focus purely on conceptual understanding
- Never say the student "learned" or "mastered" something
- Say "your explanation demonstrates understanding" if correct
- Say "an important part is missing" if partial
- Give a hint that guides without giving away the answer
- Keep feedback concise, encouraging, and specific
- Detect known misconceptions from the supplied list only

Return ONLY valid JSON. No prose outside the JSON."""


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_concepts(concepts: list[dict]) -> str:
    lines = []
    for c in concepts:
        lines.append(f"• {c.get('name', '')}: {c.get('explanation', '')}")
        for kp in c.get("key_points") or c.get("keyPoints") or []:
            lines.append(f"  - {kp}")
    return "\n".join(lines) if lines else "(none)"


def _fmt_misconceptions(misconceptions: list[dict]) -> str:
    lines = []
    for m in misconceptions:
        text = m.get("misconception", "")
        correction = m.get("correction", "")
        lines.append(f"• Misconception: \"{text}\"\n  Correction: {correction}")
    return "\n".join(lines) if lines else "(none)"


def _fmt_objectives(objectives: list[dict]) -> str:
    lines = [f"• {o.get('title', '')}" for o in objectives]
    return "\n".join(lines) if lines else "(none)"


def _fmt_previous(attempts: list[dict]) -> str:
    if not attempts:
        return "(none)"
    lines = []
    for i, a in enumerate(attempts, 1):
        lines.append(f"Attempt {i}: \"{a.get('response', '')}\"")
    return "\n".join(lines)


def _build_prompt(
    student_response: str,
    topic_name: str,
    subject_name: str,
    activity_prompt: str,
    concepts: list[dict],
    misconceptions: list[dict],
    learning_objectives: list[dict],
    previous_attempts: list[dict],
) -> str:
    return f"""Topic: {topic_name} ({subject_name})
Activity: {activity_prompt}

Concepts the student should demonstrate:
{_fmt_concepts(concepts)}

Known misconceptions to watch for:
{_fmt_misconceptions(misconceptions)}

Learning objectives:
{_fmt_objectives(learning_objectives)}

Previous attempts: {len(previous_attempts)}
{_fmt_previous(previous_attempts)}

Student's explanation:
"{student_response}"

Evaluate and return JSON:
{{
  "verdict": "correct" | "partial" | "incorrect",
  "score": 0-100,
  "confidence": 0.0-1.0,
  "demonstrated_understanding": true/false,
  "correct_points": ["..."],
  "missing_points": ["..."],
  "incorrect_points": ["..."],
  "misconceptions_detected": [{{"name": "...", "correction": "..."}}],
  "feedback": "...",
  "hint": "..." or null,
  "should_retry": true/false
}}"""


# ─────────────────────────────────────────────────────────────────────────────
# Result validation
# ─────────────────────────────────────────────────────────────────────────────

def _validate(raw: dict) -> dict:
    assert raw.get("verdict") in ("correct", "partial", "incorrect"), "invalid verdict"
    score = raw.get("score", 0)
    assert 0 <= float(score) <= 100, "score out of range"
    confidence = raw.get("confidence", 0.0)
    assert 0.0 <= float(confidence) <= 1.0, "confidence out of range"
    assert isinstance(raw.get("should_retry"), bool), "should_retry must be bool"
    feedback = raw.get("feedback", "")
    assert isinstance(feedback, str) and len(feedback) > 0, "feedback must be non-empty string"
    return {
        "verdict": raw["verdict"],
        "score": int(float(score)),
        "confidence": float(confidence),
        "demonstrated_understanding": bool(raw.get("demonstrated_understanding", False)),
        "correct_points": list(raw.get("correct_points") or []),
        "missing_points": list(raw.get("missing_points") or []),
        "incorrect_points": list(raw.get("incorrect_points") or []),
        "misconceptions_detected": list(raw.get("misconceptions_detected") or []),
        "feedback": feedback,
        "hint": raw.get("hint") or None,
        "should_retry": raw["should_retry"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Gemini call
# ─────────────────────────────────────────────────────────────────────────────

async def _call_gemini(prompt: str, timeout: int) -> dict:
    from app.core.config import settings
    from google import genai
    from google.genai import types
    import asyncio

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    config = types.GenerateContentConfig(
        temperature=0.2,
        response_mime_type="application/json",
        system_instruction=_SYSTEM_PROMPT,
    )
    
    def _sync_call():
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=config,
        )
        return response.text.strip()
    
    text = await asyncio.wait_for(
        asyncio.to_thread(_sync_call),
        timeout=float(timeout),
    )
    
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)


# ─────────────────────────────────────────────────────────────────────────────
# Groq call
# ─────────────────────────────────────────────────────────────────────────────

async def _call_groq(prompt: str, timeout: int) -> dict:
    from app.core.config import settings
    from groq import AsyncGroq  # type: ignore

    client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=float(timeout))
    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


# ─────────────────────────────────────────────────────────────────────────────
# Public interface
# ─────────────────────────────────────────────────────────────────────────────

_FALLBACK_RESPONSE: dict[str, Any] = {
    "success": False,
    "error": {
        "code": "AI_UNAVAILABLE",
        "message": "AI verification is temporarily unavailable. Please try again.",
    },
}


async def verify_explanation(
    student_response: str,
    topic_name: str,
    subject_name: str,
    activity_prompt: str,
    concepts: list[dict],
    misconceptions: list[dict],
    learning_objectives: list[dict],
    previous_attempts: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Evaluate a student's explanation against the topic curriculum.

    Returns on success:
    {
      "success": True,
      "provider": "gemini" | "groq",
      "result": { verdict, score, confidence, ... }
    }

    Returns on failure:
    {
      "success": False,
      "error": { "code": "AI_UNAVAILABLE", "message": "..." }
    }
    """
    from app.core.config import settings

    previous_attempts = previous_attempts or []
    prompt = _build_prompt(
        student_response=student_response,
        topic_name=topic_name,
        subject_name=subject_name,
        activity_prompt=activity_prompt,
        concepts=concepts,
        misconceptions=misconceptions,
        learning_objectives=learning_objectives,
        previous_attempts=previous_attempts,
    )
    timeout = settings.AI_REQUEST_TIMEOUT

    # 1. Try Gemini
    if settings.GEMINI_API_KEY:
        try:
            raw = await _call_gemini(prompt, timeout)
            validated = _validate(raw)
            return {"success": True, "provider": "gemini", "result": validated}
        except Exception as exc:
            logger.warning("Gemini call failed: %s", exc)

    # 2. Try Groq
    if settings.GROQ_API_KEY:
        try:
            raw = await _call_groq(prompt, timeout)
            validated = _validate(raw)
            return {"success": True, "provider": "groq", "result": validated}
        except Exception as exc:
            logger.warning("Groq call failed: %s", exc)

    # 3. Both failed
    logger.error("All AI providers failed for session explanation verification.")
    return _FALLBACK_RESPONSE
