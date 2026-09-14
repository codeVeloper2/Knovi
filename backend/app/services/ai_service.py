"""AI helper logic for PeerUP Learning Sessions.

Provides verify_explanation() which evaluates a student's explanation
against the topic's curriculum (concepts, key_points, misconceptions).

Supports OpenAI-compatible APIs. Configure via environment:
  AI_API_KEY    — your OpenAI (or compatible) API key
  AI_MODEL      — model to use (default: gpt-4o-mini)
  AI_API_BASE   — base URL override (default: https://api.openai.com/v1)

If AI_API_KEY is not set, a graceful fallback is returned instead of crashing.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_AI_KEY   = os.getenv("AI_API_KEY", "")
_AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
_AI_BASE  = os.getenv("AI_API_BASE", "https://api.openai.com/v1").rstrip("/")

# ─────────────────────────────────────────────────────────────────────────────
# Graceful fallback (returned when AI is not configured)
# ─────────────────────────────────────────────────────────────────────────────

_FALLBACK: dict[str, Any] = {
    "is_correct": True,
    "score": 0.7,
    "feedback": "Your explanation has been noted. AI verification is not configured — please ask your study partner to review your answer.",
    "hint": None,
    "misconception_detected": None,
}


# ─────────────────────────────────────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────────────────────────────────────

def _build_prompt(
    student_response: str,
    topic_name: str,
    activity_prompt: str,
    concepts: list[dict],
    misconceptions: list[dict],
) -> str:
    concept_lines = []
    for c in concepts:
        concept_lines.append(f"• {c['name']}: {c['explanation']}")
        for kp in (c.get("key_points") or []):
            concept_lines.append(f"  - {kp}")

    misc_lines = []
    for m in misconceptions:
        misc_lines.append(
            f"• Misconception: \"{m['misconception']}\"\n"
            f"  Correction: {m['correction']}"
        )

    concepts_block = "\n".join(concept_lines) if concept_lines else "(no concepts defined)"
    misc_block = "\n".join(misc_lines) if misc_lines else "(no misconceptions defined)"

    return f"""You are an educational AI evaluating a student's explanation.

Topic: {topic_name}
Activity: {activity_prompt}

Key Concepts the student should demonstrate:
{concepts_block}

Common Misconceptions to watch for:
{misc_block}

Student's explanation:
"{student_response}"

Evaluate whether this explanation demonstrates understanding of the topic.

Respond ONLY with valid JSON (no markdown, no code fences):
{{
  "is_correct": true or false,
  "score": a decimal between 0.0 and 1.0,
  "feedback": "specific feedback about what was good or what is missing",
  "hint": "a helpful hint if incorrect, null if correct",
  "misconception_detected": "if a known misconception was found, null otherwise"
}}

Use careful language. Do NOT say "you mastered" or "you learned".
Say "your explanation demonstrates understanding" or "an important part is missing"."""


# ─────────────────────────────────────────────────────────────────────────────
# Main function
# ─────────────────────────────────────────────────────────────────────────────

async def verify_explanation(
    student_response: str,
    topic_name: str,
    activity_prompt: str,
    concepts: list[dict],
    misconceptions: list[dict],
) -> dict[str, Any]:
    """
    Evaluate a student's explanation against the topic curriculum.

    Returns a dict with:
        is_correct: bool
        score: float (0.0 – 1.0)
        feedback: str
        hint: str | None
        misconception_detected: str | None
    """
    if not _AI_KEY:
        logger.warning("AI_API_KEY not configured — returning fallback verification result.")
        return _FALLBACK

    prompt = _build_prompt(
        student_response, topic_name, activity_prompt, concepts, misconceptions
    )

    payload = {
        "model": _AI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You are a precise educational evaluator. Always respond with valid JSON only.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "temperature": 0.3,
        "max_tokens": 512,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {_AI_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{_AI_BASE}/chat/completions",
                json=payload,
                headers=headers,
            )
        resp.raise_for_status()
        raw = resp.json()
        content = raw["choices"][0]["message"]["content"]
        result = json.loads(content)

        # Normalise fields — ensure expected keys are present
        return {
            "is_correct": bool(result.get("is_correct", False)),
            "score": float(result.get("score", 0.0)),
            "feedback": str(result.get("feedback", "")),
            "hint": result.get("hint") or None,
            "misconception_detected": result.get("misconception_detected") or None,
        }

    except httpx.HTTPStatusError as exc:
        logger.error("AI API HTTP error %s: %s", exc.response.status_code, exc.response.text[:200])
        return _FALLBACK
    except (httpx.RequestError, KeyError, json.JSONDecodeError, ValueError) as exc:
        logger.error("AI API call failed: %s", exc)
        return _FALLBACK
