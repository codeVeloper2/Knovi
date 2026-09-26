"""User feedback and AI-response flagging — emailed to the product team."""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.core.security import current_user
from app.models.user import User
from app.schemas.feedback import FeedbackRequest
from app.services import email_service

logger = logging.getLogger(__name__)
router = APIRouter()

FEEDBACK_TO = os.getenv("FEEDBACK_TO_EMAIL", "codeveloper95@gmail.com")


def _esc(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


@router.post("/feedback")
async def submit_feedback(
    body: FeedbackRequest,
    user: User = Depends(current_user),
) -> dict:
    """Accept product feedback or an AI flag and email the team."""
    kind = (body.kind or "").strip().lower()
    if kind not in ("general", "ai_flag"):
        raise HTTPException(422, "kind must be 'general' or 'ai_flag'")

    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(422, "message is required")

    user_label = (
        getattr(user, "full_name", None)
        or getattr(user, "email", None)
        or f"user#{user.id}"
    )
    user_email = getattr(user, "email", "") or ""

    subject = (
        f"[Knovi] AI response flagged by {user_label}"
        if kind == "ai_flag"
        else f"[Knovi] Feedback from {user_label}"
    )

    lines = [
        f"Kind: {kind}",
        f"From: {user_label} <{user_email}> (id={user.id})",
        f"Page: {body.page or '—'}",
        "",
        "Message:",
        msg,
    ]

    if kind == "ai_flag":
        lines.extend(
            [
                "",
                "── Session context ──",
                f"Session ID: {body.session_id or '—'}",
                f"Subject: {body.subject_name or '—'}",
                f"Topic: {body.topic_name or '—'}",
                f"Concept: {body.concept_name or '—'}",
                f"Task index: {body.task_index if body.task_index is not None else '—'}",
                f"Task title: {body.task_title or '—'}",
                f"AI message id: {body.ai_message_id or '—'}",
                "",
                "Student message:",
                (body.student_message or "—")[:4000],
                "",
                "AI response:",
                (body.ai_message or "—")[:8000],
            ]
        )

    text_body = "\n".join(lines)
    html_parts = [
        "<div style='font-family:system-ui,sans-serif;line-height:1.5;color:#111'>",
        f"<h2 style='margin:0 0 12px'>{'AI response flagged' if kind == 'ai_flag' else 'Product feedback'}</h2>",
        f"<p><b>From:</b> {_esc(user_label)} &lt;{_esc(user_email)}&gt; (id={user.id})</p>",
        f"<p><b>Page:</b> {_esc(body.page or '—')}</p>",
        "<p><b>Message:</b></p>",
        f"<pre style='white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:8px'>{_esc(msg)}</pre>",
    ]
    if kind == "ai_flag":
        html_parts.extend(
            [
                "<hr/>",
                (
                    f"<p><b>Session:</b> {body.session_id or '—'}<br/>"
                    f"<b>Subject:</b> {_esc(body.subject_name or '—')} · "
                    f"<b>Topic:</b> {_esc(body.topic_name or '—')} · "
                    f"<b>Concept:</b> {_esc(body.concept_name or '—')}<br/>"
                    f"<b>Task:</b> #{body.task_index if body.task_index is not None else '—'} "
                    f"{_esc(body.task_title or '')}</p>"
                ),
                "<p><b>Student message:</b></p>",
                f"<pre style='white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:8px'>{_esc(body.student_message or '—')}</pre>",
                "<p><b>AI response:</b></p>",
                f"<pre style='white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:8px'>{_esc((body.ai_message or '—')[:8000])}</pre>",
            ]
        )
    html_parts.append("</div>")
    html_body = "".join(html_parts)

    if not email_service.smtp_configured():
        logger.warning(
            "Feedback received but SMTP not configured. to=%s kind=%s user=%s",
            FEEDBACK_TO,
            kind,
            user.id,
        )
        logger.info("FEEDBACK_PAYLOAD\n%s", text_body)
        return {
            "ok": True,
            "delivered": False,
            "detail": "Feedback recorded. Email delivery is not configured on this server.",
        }

    try:
        await run_in_threadpool(
            email_service.send_email,
            FEEDBACK_TO,
            subject,
            html_body,
            text_body,
        )
    except Exception as exc:
        logger.exception("Failed to send feedback email: %s", exc)
        raise HTTPException(
            502, "Could not deliver feedback right now. Please try again."
        ) from exc

    return {"ok": True, "delivered": True}
