"""Sync (peer-to-peer verification) API — /api/sync/"""
from __future__ import annotations

import json
import logging
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.security import current_user, decode_token
from app.models.curriculum import Concept, Question, Topic
from app.models.solo_learning import (
    ConceptProgress, SyncGap, SyncQuizExchange, SyncSession, SyncWarmupAnswer,
)
from app.models.user import User
from app.services import progress_service
from app.services.learning_session_ws_manager import LearningSessionConnectionManager

router = APIRouter()
logger = logging.getLogger(__name__)

sync_manager = LearningSessionConnectionManager()

_SESSION_DURATION_MINUTES = 15
_MAX_WARMUP_QUESTIONS = 2
_XP_SYNC_COMPLETE = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_code() -> str:
    return "SYNC-" + "".join(random.choices(string.digits, k=4))


def _user_brief(u: User) -> dict:
    return {
        "id": u.id,
        "displayName": u.full_name or u.email.split("@")[0],
        "photoURL": u.photo_url or "",
        "grade": u.grade or "",
        "xp": u.xp or 0,
    }


def _is_correct_answer(question: Question, response: str) -> bool:
    correct = (question.answer or "").strip().lower()
    resp = response.strip().lower()
    if question.question_type == "multiple_choice" and question.options:
        for opt in question.options:
            label = opt.get("label", "").lower()
            text = opt.get("text", "").lower()
            if resp in (label, text) and text == correct:
                return True
            if resp == label and label == correct:
                return True
        return resp == correct
    if question.question_type == "numeric":
        try:
            return abs(float(resp) - float(correct)) < 1e-6
        except ValueError:
            return False
    return resp == correct


async def _get_session_or_404(db: AsyncSession, session_id: int) -> SyncSession:
    ss = (await db.execute(
        select(SyncSession)
        .where(SyncSession.id == session_id)
        .options(
            selectinload(SyncSession.initiator),
            selectinload(SyncSession.partner),
            selectinload(SyncSession.warmup_answers),
            selectinload(SyncSession.quiz_exchanges),
            selectinload(SyncSession.gaps),
        )
    )).scalar_one_or_none()
    if ss is None:
        raise HTTPException(404, "Sync session not found.")
    return ss


async def _assert_participant(ss: SyncSession, user_id: int) -> None:
    if user_id not in (ss.initiator_id, ss.partner_id):
        raise HTTPException(403, "You are not a participant in this sync session.")


# ── 1. Eligible concepts ──────────────────────────────────────────────────────

@router.get("/sync/eligible")
async def get_sync_eligible(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    eligible = (await db.execute(
        select(ConceptProgress)
        .where(
            ConceptProgress.user_id == user.id,
            ConceptProgress.sync_eligible == True,    # noqa: E712
            ConceptProgress.sync_completed == False,  # noqa: E712
        )
        .order_by(ConceptProgress.checkpoint_passed_at.desc())
    )).scalars().all()

    result = []
    for cp in eligible:
        concept = (await db.execute(
            select(Concept).where(Concept.id == cp.concept_id)
        )).scalar_one_or_none()
        topic = (await db.execute(
            select(Topic).where(Topic.id == cp.topic_id)
            .options(selectinload(Topic.subject))
        )).scalar_one_or_none()
        if concept and topic:
            partner_count = (await db.execute(
                select(func.count(ConceptProgress.id)).where(
                    ConceptProgress.concept_id == cp.concept_id,
                    ConceptProgress.sync_eligible == True,    # noqa: E712
                    ConceptProgress.sync_completed == False,  # noqa: E712
                    ConceptProgress.user_id != user.id,
                )
            )).scalar_one()
            result.append({
                "conceptId": cp.concept_id,
                "conceptName": concept.name,
                "topicId": cp.topic_id,
                "topicName": topic.name,
                "subjectName": topic.subject.name if topic.subject else "",
                "checkpointPassedAt": cp.checkpoint_passed_at.isoformat() if cp.checkpoint_passed_at else None,
                "availablePartners": partner_count,
            })
    return result


# ── 2. Available partners ─────────────────────────────────────────────────────

@router.get("/sync/partners/{concept_id}")
async def get_sync_partners(
    concept_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    eligible_user_ids = (await db.execute(
        select(ConceptProgress.user_id).where(
            ConceptProgress.concept_id == concept_id,
            ConceptProgress.sync_eligible == True,    # noqa: E712
            ConceptProgress.sync_completed == False,  # noqa: E712
            ConceptProgress.user_id != user.id,
        )
    )).scalars().all()

    if not eligible_user_ids:
        return []

    users = (await db.execute(
        select(User).where(User.id.in_(eligible_user_ids))
    )).scalars().all()

    concept = (await db.execute(
        select(Concept).where(Concept.id == concept_id)
    )).scalar_one_or_none()

    result = []
    for u in users:
        cp = (await db.execute(
            select(ConceptProgress).where(
                ConceptProgress.user_id == u.id,
                ConceptProgress.concept_id == concept_id,
            )
        )).scalar_one_or_none()
        result.append({
            **_user_brief(u),
            "checkpointPassedAt": cp.checkpoint_passed_at.isoformat() if cp and cp.checkpoint_passed_at else None,
            "conceptName": concept.name if concept else "",
        })
    return result


# ── 3. Create sync session ────────────────────────────────────────────────────

class CreateSyncRequest(BaseModel):
    concept_id: int
    partner_id: Optional[int] = None


@router.post("/sync/sessions")
async def create_sync_session(
    body: CreateSyncRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    cp = (await db.execute(
        select(ConceptProgress).where(
            ConceptProgress.user_id == user.id,
            ConceptProgress.concept_id == body.concept_id,
            ConceptProgress.sync_eligible == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if cp is None:
        raise HTTPException(400, "You must pass the checkpoint before starting a sync.")

    concept = (await db.execute(
        select(Concept).where(Concept.id == body.concept_id)
    )).scalar_one_or_none()
    if concept is None:
        raise HTTPException(404, "Concept not found.")

    if body.partner_id:
        partner_cp = (await db.execute(
            select(ConceptProgress).where(
                ConceptProgress.user_id == body.partner_id,
                ConceptProgress.concept_id == body.concept_id,
                ConceptProgress.sync_eligible == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if partner_cp is None:
            raise HTTPException(400, "The selected partner has not passed this checkpoint.")

    code = _generate_code()
    for _ in range(10):
        if not (await db.execute(
            select(SyncSession).where(SyncSession.session_code == code)
        )).scalar_one_or_none():
            break
        code = _generate_code()

    ss = SyncSession(
        initiator_id=user.id,
        partner_id=body.partner_id,
        topic_id=concept.topic_id,
        concept_id=body.concept_id,
        phase="LOBBY",
        session_code=code,
        expires_at=_now() + timedelta(hours=2),
    )
    db.add(ss)
    await db.flush()
    await db.commit()

    ss_full = await _get_session_or_404(db, ss.id)
    return ss_full.serialize(user_id=user.id)


# ── 4. Validate join code ─────────────────────────────────────────────────────

@router.get("/sync/sessions/join/{code}")
async def validate_sync_code(
    code: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = (await db.execute(
        select(SyncSession)
        .where(SyncSession.session_code == code.upper())
        .options(selectinload(SyncSession.initiator))
    )).scalar_one_or_none()
    if ss is None:
        raise HTTPException(404, "Invalid sync code.")
    if ss.phase != "LOBBY":
        raise HTTPException(400, "This session has already started.")

    concept = (await db.execute(
        select(Concept).where(Concept.id == ss.concept_id)
    )).scalar_one_or_none()
    topic = (await db.execute(
        select(Topic).where(Topic.id == ss.topic_id)
        .options(selectinload(Topic.subject))
    )).scalar_one_or_none()

    return {
        "sessionId": ss.id,
        "sessionCode": ss.session_code,
        "conceptName": concept.name if concept else "",
        "topicName": topic.name if topic else "",
        "subjectName": topic.subject.name if topic and topic.subject else "",
        "initiator": _user_brief(ss.initiator) if ss.initiator else None,
        "phase": ss.phase,
    }


# ── 5. Join by code ───────────────────────────────────────────────────────────

@router.post("/sync/sessions/join/{code}")
async def join_sync_by_code(
    code: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = (await db.execute(
        select(SyncSession)
        .where(SyncSession.session_code == code.upper())
        .options(selectinload(SyncSession.initiator), selectinload(SyncSession.partner))
    )).scalar_one_or_none()
    if ss is None:
        raise HTTPException(404, "Invalid sync code.")
    if ss.phase != "LOBBY":
        raise HTTPException(400, "This session has already started.")
    if ss.initiator_id == user.id:
        raise HTTPException(400, "You cannot join your own session.")

    cp = (await db.execute(
        select(ConceptProgress).where(
            ConceptProgress.user_id == user.id,
            ConceptProgress.concept_id == ss.concept_id,
            ConceptProgress.sync_eligible == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if cp is None:
        raise HTTPException(400, "You must pass this checkpoint before joining the sync.")

    ss.partner_id = user.id
    await db.commit()

    ss_full = await _get_session_or_404(db, ss.id)
    await sync_manager.broadcast(ss.id, "partner_joined", {"partner": _user_brief(user)})
    return ss_full.serialize(user_id=user.id)


# ── 6. Get session ────────────────────────────────────────────────────────────

@router.get("/sync/sessions/{session_id}")
async def get_sync_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)

    concept = (await db.execute(
        select(Concept).where(Concept.id == ss.concept_id)
    )).scalar_one_or_none()
    topic = (await db.execute(
        select(Topic).where(Topic.id == ss.topic_id)
        .options(selectinload(Topic.subject))
    )).scalar_one_or_none()

    data = ss.serialize(user_id=user.id)
    data["concept"] = concept.serialize() if concept else None
    data["topic"] = topic.serialize() if topic else None
    data["subjectName"] = topic.subject.name if topic and topic.subject else ""
    return data


# ── 7. Mark ready ─────────────────────────────────────────────────────────────

@router.post("/sync/sessions/{session_id}/ready")
async def mark_sync_ready(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)
    if ss.phase != "LOBBY":
        raise HTTPException(400, "Not in lobby.")
    if ss.partner_id is None:
        raise HTTPException(400, "Waiting for a partner to join.")

    if user.id == ss.initiator_id:
        ss.initiator_ready = True
    else:
        ss.partner_ready = True

    if ss.initiator_ready and ss.partner_ready:
        ss.phase = "WARMUP"
        ss.started_at = _now()
        ss.expires_at = _now() + timedelta(minutes=_SESSION_DURATION_MINUTES)

    await db.commit()
    ss = await _get_session_or_404(db, session_id)
    await sync_manager.broadcast(session_id, "session_updated", ss.serialize(user_id=user.id))
    return ss.serialize(user_id=user.id)


# ── 8. Get warmup questions ───────────────────────────────────────────────────

@router.get("/sync/sessions/{session_id}/warmup")
async def get_warmup_questions(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)

    questions = (await db.execute(
        select(Question)
        .where(
            Question.topic_id == ss.topic_id,
            Question.question_type.in_(["multiple_choice", "short_answer"]),
        )
        .order_by(Question.id)
        .limit(_MAX_WARMUP_QUESTIONS)
    )).scalars().all()

    answered = (await db.execute(
        select(SyncWarmupAnswer).where(
            SyncWarmupAnswer.session_id == session_id,
            SyncWarmupAnswer.user_id == user.id,
        )
    )).scalars().all()
    answered_map = {a.question_id: a for a in answered}

    qs_out = []
    for q in questions:
        qd = q.serialize()
        qd.pop("answer", None)
        ans = answered_map.get(q.id)
        qd["userAnswer"] = ans.response if ans else None
        qd["isCorrect"] = ans.is_correct if ans else None
        qd["answered"] = ans is not None
        qs_out.append(qd)

    return {
        "questions": qs_out,
        "totalQuestions": len(questions),
        "answeredCount": len(answered),
        "allAnswered": len(answered) >= len(questions),
    }


# ── 9. Submit warmup answer ───────────────────────────────────────────────────

class WarmupAnswerRequest(BaseModel):
    question_id: int
    response: str


@router.post("/sync/sessions/{session_id}/warmup/answer")
async def submit_warmup_answer(
    session_id: int,
    body: WarmupAnswerRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)
    if ss.phase != "WARMUP":
        raise HTTPException(400, "Not in warmup phase.")

    question = (await db.execute(
        select(Question).where(Question.id == body.question_id)
    )).scalar_one_or_none()
    if question is None:
        raise HTTPException(404, "Question not found.")

    is_correct = _is_correct_answer(question, body.response)

    existing = (await db.execute(
        select(SyncWarmupAnswer).where(
            SyncWarmupAnswer.session_id == session_id,
            SyncWarmupAnswer.user_id == user.id,
            SyncWarmupAnswer.question_id == body.question_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.response = body.response
        existing.is_correct = is_correct
    else:
        db.add(SyncWarmupAnswer(
            session_id=session_id,
            user_id=user.id,
            question_id=body.question_id,
            response=body.response,
            is_correct=is_correct,
        ))
    await db.flush()

    # Check if both done
    all_qs = (await db.execute(
        select(Question)
        .where(
            Question.topic_id == ss.topic_id,
            Question.question_type.in_(["multiple_choice", "short_answer"]),
        )
        .limit(_MAX_WARMUP_QUESTIONS)
    )).scalars().all()
    qids = {q.id for q in all_qs}

    all_ans = (await db.execute(
        select(SyncWarmupAnswer).where(SyncWarmupAnswer.session_id == session_id)
    )).scalars().all()

    initiator_done = all(any(a.question_id == qid and a.user_id == ss.initiator_id for a in all_ans) for qid in qids)
    partner_done = (
        all(any(a.question_id == qid and a.user_id == ss.partner_id for a in all_ans) for qid in qids)
        if ss.partner_id else False
    )

    if initiator_done and partner_done:
        ss.phase = "EXPLAIN"
        ss.explain_turn = "initiator"
        await db.commit()
        await sync_manager.broadcast(session_id, "phase_changed", {"phase": "EXPLAIN", "explainTurn": "initiator"})
    else:
        await db.commit()

    await sync_manager.broadcast(session_id, "warmup_answered", {
        "userId": user.id,
        "questionId": body.question_id,
        "isCorrect": is_correct,
        "initiatorDone": initiator_done,
        "partnerDone": partner_done,
    })

    return {
        "questionId": body.question_id,
        "isCorrect": is_correct,
        "correctAnswer": question.answer,
        "explanation": question.explanation,
        "initiatorDone": initiator_done,
        "partnerDone": partner_done,
        "phaseAdvanced": initiator_done and partner_done,
    }


# ── 10. Submit explanation ────────────────────────────────────────────────────

class ExplainSubmitRequest(BaseModel):
    explanation: str


@router.post("/sync/sessions/{session_id}/explain")
async def submit_sync_explanation(
    session_id: int,
    body: ExplainSubmitRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)
    if ss.phase != "EXPLAIN":
        raise HTTPException(400, "Not in explain phase.")

    my_role = "initiator" if user.id == ss.initiator_id else "partner"
    if my_role != ss.explain_turn:
        raise HTTPException(400, "It is not your turn to explain.")

    if my_role == "initiator":
        ss.initiator_explained = True
        ss.explain_turn = "partner"
    else:
        ss.partner_explained = True
        ss.explain_turn = None

    await sync_manager.broadcast(session_id, "explanation_submitted", {
        "userId": user.id,
        "role": my_role,
        "explanation": body.explanation,
    })

    if ss.initiator_explained and ss.partner_explained:
        ss.phase = "QUIZ"
        ss.explain_turn = None
        await db.commit()
        await sync_manager.broadcast(session_id, "phase_changed", {"phase": "QUIZ"})
    else:
        await db.commit()

    ss = await _get_session_or_404(db, session_id)
    return ss.serialize(user_id=user.id)


# ── 11. Explain reaction ──────────────────────────────────────────────────────

class ExplainReactRequest(BaseModel):
    understood: bool


@router.post("/sync/sessions/{session_id}/explain/react")
async def react_to_explanation(
    session_id: int,
    body: ExplainReactRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)

    my_role = "initiator" if user.id == ss.initiator_id else "partner"
    if my_role == "initiator":
        ss.initiator_understood = body.understood
    else:
        ss.partner_understood = body.understood

    await db.commit()
    await sync_manager.broadcast(session_id, "explanation_reaction", {
        "userId": user.id,
        "role": my_role,
        "understood": body.understood,
    })
    return {"understood": body.understood, "role": my_role}


# ── 12. Ask quiz question ─────────────────────────────────────────────────────

class QuizQuestionRequest(BaseModel):
    question_text: str
    question_id: Optional[int] = None


@router.post("/sync/sessions/{session_id}/quiz/question")
async def ask_quiz_question(
    session_id: int,
    body: QuizQuestionRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)
    if ss.phase != "QUIZ":
        raise HTTPException(400, "Not in quiz phase.")

    answerer_id = ss.partner_id if user.id == ss.initiator_id else ss.initiator_id

    exchange = SyncQuizExchange(
        session_id=session_id,
        asker_id=user.id,
        answerer_id=answerer_id,
        question_id=body.question_id,
        question_text=body.question_text.strip(),
    )
    db.add(exchange)
    await db.flush()
    await db.commit()
    await db.refresh(exchange)

    await sync_manager.broadcast(session_id, "quiz_question_asked", exchange.serialize())
    return exchange.serialize()


# ── 13. Answer quiz question ──────────────────────────────────────────────────

class QuizAnswerRequest(BaseModel):
    answer_text: str
    is_correct: Optional[bool] = None


@router.post("/sync/sessions/{session_id}/quiz/{exchange_id}/answer")
async def answer_quiz_question(
    session_id: int,
    exchange_id: int,
    body: QuizAnswerRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)

    exchange = (await db.execute(
        select(SyncQuizExchange).where(
            SyncQuizExchange.id == exchange_id,
            SyncQuizExchange.session_id == session_id,
        )
    )).scalar_one_or_none()
    if exchange is None:
        raise HTTPException(404, "Quiz exchange not found.")

    exchange.answer_text = body.answer_text.strip()
    if body.is_correct is not None:
        exchange.is_correct = body.is_correct

    await db.commit()
    await db.refresh(exchange)
    await sync_manager.broadcast(session_id, "quiz_answered", exchange.serialize())
    return exchange.serialize()


# ── 14. Quiz suggestions ──────────────────────────────────────────────────────

@router.get("/sync/sessions/{session_id}/quiz/suggestions")
async def get_quiz_suggestions(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)

    questions = (await db.execute(
        select(Question)
        .where(Question.topic_id == ss.topic_id)
        .order_by(Question.id)
        .limit(6)
    )).scalars().all()

    return [{"id": q.id, "text": q.question, "type": q.question_type} for q in questions]


# ── 15. Gap check ─────────────────────────────────────────────────────────────

@router.post("/sync/sessions/{session_id}/gap-check")
async def run_gap_check(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)
    if ss.phase not in ("QUIZ", "GAP_CHECK"):
        raise HTTPException(400, "Must be in quiz or gap-check phase.")

    ss.phase = "GAP_CHECK"

    concept = (await db.execute(
        select(Concept).where(Concept.id == ss.concept_id)
    )).scalar_one_or_none()

    warmup = ss.warmup_answers
    quiz = ss.quiz_exchanges

    def warmup_score(uid: int) -> tuple[int, int]:
        answers = [a for a in warmup if a.user_id == uid]
        return sum(1 for a in answers if a.is_correct), len(answers)

    init_correct, init_total = warmup_score(ss.initiator_id)
    part_correct, part_total = warmup_score(ss.partner_id or 0)

    wrong = [e for e in quiz if e.is_correct is False]

    gaps_init, gaps_part = [], []
    for e in wrong:
        gap = {"gapType": "incorrect", "description": f"Missed: {e.question_text[:80]}"}
        if e.answerer_id == ss.initiator_id:
            gaps_init.append(gap)
        elif e.answerer_id == ss.partner_id:
            gaps_part.append(gap)

    if ss.initiator_understood is False:
        gaps_init.append({"gapType": "unclear", "description": "Indicated confusion during explain phase."})
    if ss.partner_understood is False:
        gaps_part.append({"gapType": "unclear", "description": "Indicated confusion during explain phase."})

    str_init, str_part = [], []
    if init_total and init_correct == init_total:
        str_init.append("Answered all warmup questions correctly")
    if part_total and part_correct == part_total:
        str_part.append("Answered all warmup questions correctly")
    if ss.partner_understood is True:
        str_init.append("Explained the concept clearly to peer")
    if ss.initiator_understood is True:
        str_part.append("Explained the concept clearly to peer")

    gap_summary = {
        "conceptId": ss.concept_id,
        "conceptName": concept.name if concept else "",
        "initiator": {"userId": ss.initiator_id, "strengths": str_init, "gaps": gaps_init},
        "partner": {"userId": ss.partner_id, "strengths": str_part, "gaps": gaps_part},
    }
    ss.gap_summary = gap_summary

    for g in gaps_init:
        db.add(SyncGap(session_id=session_id, user_id=ss.initiator_id, concept_id=ss.concept_id, **g))
    if ss.partner_id:
        for g in gaps_part:
            db.add(SyncGap(session_id=session_id, user_id=ss.partner_id, concept_id=ss.concept_id, **g))

    await db.commit()
    ss = await _get_session_or_404(db, session_id)
    await sync_manager.broadcast(session_id, "phase_changed", {"phase": "GAP_CHECK", "gapSummary": gap_summary})
    return {"gapSummary": gap_summary, "session": ss.serialize(user_id=user.id)}


# ── 16. Complete session ──────────────────────────────────────────────────────

@router.post("/sync/sessions/{session_id}/complete")
async def complete_sync_session(
    session_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    ss = await _get_session_or_404(db, session_id)
    await _assert_participant(ss, user.id)
    if ss.phase not in ("GAP_CHECK", "QUIZ"):
        raise HTTPException(400, "Complete gap check first.")

    ss.phase = "COMPLETED"
    ss.completed_at = _now()

    for uid in [ss.initiator_id, ss.partner_id]:
        if uid is None:
            continue
        cp = (await db.execute(
            select(ConceptProgress).where(
                ConceptProgress.user_id == uid,
                ConceptProgress.concept_id == ss.concept_id,
            )
        )).scalar_one_or_none()
        if cp:
            cp.sync_completed = True
            cp.stage = "passed"
            my_gaps = [g for g in ss.gaps if g.user_id == uid]
            if my_gaps:
                cp.needs_review = True

    for uid in [ss.initiator_id, ss.partner_id]:
        if uid is None:
            continue
        u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
        if u:
            u.xp = (u.xp or 0) + _XP_SYNC_COMPLETE
            await progress_service.record_activity(db, uid)

    await db.commit()
    ss = await _get_session_or_404(db, session_id)
    await sync_manager.broadcast(session_id, "session_completed", ss.serialize(user_id=user.id))
    return ss.serialize(user_id=user.id)


# ── 17. History ───────────────────────────────────────────────────────────────

@router.get("/sync/history")
async def get_sync_history(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list:
    sessions = (await db.execute(
        select(SyncSession)
        .where(or_(
            SyncSession.initiator_id == user.id,
            SyncSession.partner_id == user.id,
        ))
        .options(
            selectinload(SyncSession.initiator),
            selectinload(SyncSession.partner),
            selectinload(SyncSession.gaps),
        )
        .order_by(SyncSession.created_at.desc())
        .limit(20)
    )).scalars().all()

    result = []
    for ss in sessions:
        concept = (await db.execute(
            select(Concept).where(Concept.id == ss.concept_id)
        )).scalar_one_or_none()
        topic = (await db.execute(
            select(Topic).where(Topic.id == ss.topic_id)
            .options(selectinload(Topic.subject))
        )).scalar_one_or_none()
        my_gaps = [g for g in ss.gaps if g.user_id == user.id]
        partner = ss.partner if user.id == ss.initiator_id else ss.initiator
        result.append({
            "sessionId": ss.id,
            "phase": ss.phase,
            "conceptId": ss.concept_id,
            "conceptName": concept.name if concept else "",
            "topicName": topic.name if topic else "",
            "subjectName": topic.subject.name if topic and topic.subject else "",
            "partner": _user_brief(partner) if partner else None,
            "gapCount": len(my_gaps),
            "gaps": [g.serialize() for g in my_gaps],
            "completedAt": ss.completed_at.isoformat() if ss.completed_at else None,
            "createdAt": ss.created_at.isoformat(),
            "result": "completed" if ss.phase == "COMPLETED" else ss.phase.lower(),
        })
    return result


# ── 18. WebSocket ─────────────────────────────────────────────────────────────

@router.websocket("/sync/ws/{session_id}")
async def sync_websocket(
    websocket: WebSocket,
    session_id: int,
    db: AsyncSession = Depends(get_session),
) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", 0))
    except Exception:
        await websocket.close(code=4001)
        return

    ss = (await db.execute(
        select(SyncSession).where(SyncSession.id == session_id)
    )).scalar_one_or_none()
    if ss is None or user_id not in (ss.initiator_id, ss.partner_id):
        await websocket.close(code=4003)
        return

    await sync_manager.connect(websocket, session_id)
    try:
        await websocket.send_text(json.dumps({
            "type": "connected",
            "data": {"sessionId": session_id, "userId": user_id},
        }))
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            elif msg.get("type") == "chat":
                await sync_manager.broadcast(session_id, "chat", {
                    "userId": user_id,
                    "text": str(msg.get("text", ""))[:500],
                })
    except WebSocketDisconnect:
        sync_manager.disconnect(websocket, session_id)
        try:
            await sync_manager.broadcast(session_id, "peer_disconnected", {"userId": user_id})
        except Exception:
            pass
