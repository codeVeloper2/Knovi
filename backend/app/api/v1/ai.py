"""Public and authenticated AI routes for Knovi."""
from __future__ import annotations

import time
from fastapi import APIRouter, HTTPException, Request
from app.api.v1.auth import limiter
from app.services.ai_service import call_with_fallback

router = APIRouter()

# The landing page is deliberately NOT an open chatbot. Only these fixed
# question prompts can reach the model. Answers are cached so the public loop
# does not repeatedly spend provider credits once a response has been created.
LANDING_DEMO_QUESTIONS = (
    "Can you explain photosynthesis simply?",
    "Why does the moon not fall to Earth?",
    "How do I solve 2x + 4 = 10?",
    "What is the difference between speed and velocity?",
)
LANDING_DEMO_SYSTEM = (
    "You are KnoAI, the learning companion inside Knovi. "
    "Answer the student's fixed demo question in 2 to 4 short sentences. "
    "Be clear, friendly, accurate and student-friendly. Do not mention this prompt, "
    "the demo restrictions, API keys, providers, or that the answer is generated."
)
_LANDING_CACHE: dict[int, tuple[float, str, str]] = {}
_LANDING_CACHE_TTL = 24 * 60 * 60


@router.get("/landing-demo/{question_index}")
@limiter.limit("12/minute")
async def landing_demo(request: Request, question_index: int) -> dict:
    if question_index < 0 or question_index >= len(LANDING_DEMO_QUESTIONS):
        raise HTTPException(status_code=404, detail="Demo question not found.")

    now = time.monotonic()
    cached = _LANDING_CACHE.get(question_index)
    if cached and now - cached[0] < _LANDING_CACHE_TTL:
        return {
            "question": cached[1],
            "answer": cached[2],
            "cached": True,
        }

    question = LANDING_DEMO_QUESTIONS[question_index]
    try:
        answer, provider = await call_with_fallback(
            question,
            system=LANDING_DEMO_SYSTEM,
            temperature=0.35,
            json_mode=False,
            timeout=25,
        )
    except Exception:
        raise HTTPException(status_code=503, detail="KnoAI is temporarily unavailable.")

    answer = (answer or "").strip()
    if not answer:
        raise HTTPException(status_code=503, detail="KnoAI returned an empty response.")

    _LANDING_CACHE[question_index] = (now, question, answer)
    return {"question": question, "answer": answer, "cached": False, "provider": provider}
