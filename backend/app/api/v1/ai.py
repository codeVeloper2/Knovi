"""Public AI showcase endpoints and authenticated AI helpers."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.ai_service import call_with_fallback

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class DemoMessage(BaseModel):
    message: str = Field(min_length=1, max_length=500)


@router.post("/demo")
@limiter.limit("8/minute")
async def ai_demo(request: Request, body: DemoMessage) -> dict:
    """Small public AI demo used by the Knovi landing page.

    It intentionally has a tight input limit and a focused tutor prompt so the
    landing page can demonstrate the real Knovi AI stack without exposing the
    authenticated learning-session endpoints.
    """
    prompt = body.message.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a question.")

    system = (
        "You are KnoAI, the AI learning companion inside Knovi. "
        "Answer like a warm, patient tutor for secondary-school students. "
        "Be concise but genuinely helpful. Explain the idea in simple steps, "
        "use a small example when useful, and never pretend to know the student's "
        "personal progress. This is a public product demo, so do not ask for or "
        "repeat personal information. Return plain text only."
    )

    try:
        answer, provider = await call_with_fallback(
            prompt,
            system=system,
            temperature=0.65,
            json_mode=False,
            timeout=30,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail="KnoAI is taking a short break. Please try the demo again.",
        ) from exc

    return {"reply": answer.strip(), "provider": provider}
