"""AI Learning Session service for PeerUP.

Architecture: curriculum (WHAT) + Gemini (HOW) + persisted teaching content.
user_id always from auth dependency. subject->topic->concept chain validated.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_learning import (
    AILearningSession, AISessionAnswer, AISessionIntegrityEvent,
    AISessionMessage, AISessionQuestion, AISessionStudyPeriod,
    AISessionSummary, AISessionTeaching, AISessionTeachingAttempt,
)
from app.models.curriculum import Concept, Subject, Topic
from app.services.ai_service import call_with_fallback, parse_json

logger = logging.getLogger(__name__)

_STRATEGY_ROTATION = [
    "technical_explanation", "simple_explanation", "analogy",
    "real_world_example", "worked_example", "step_by_step",
    "comparison", "story_context", "visual_description",
    "misconception_correction", "socratic_questioning",
]

_VALID_TRANSITIONS = {
    "created": {"teaching", "abandoned"},
    "teaching": {"studying", "retrieval", "reteaching", "completed", "abandoned"},
    "studying": {"retrieval", "abandoned"},
    "retrieval": {"reteaching", "practice", "completed", "abandoned"},
    "reteaching": {"studying", "retrieval", "completed", "abandoned"},
    "practice": {"completed", "abandoned"},
    "completed": set(), "abandoned": set(),
    "paused": {"teaching", "studying", "retrieval", "reteaching", "practice", "abandoned"},
}

_CHAT_HISTORY_WINDOW = 12

def _now():
    return datetime.now(timezone.utc)

def _set_status(session, new_status):
    current = session.status
    allowed = _VALID_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise HTTPException(409, f"Cannot transition from '{current}' to '{new_status}'.")
    session.status = new_status

async def _get_session_owned(session_id, user_id, db, *, load_messages=False, load_teaching=False, load_questions=False, load_summary=False, load_attempts=False):
    opts = []
    if load_messages: opts.append(selectinload(AILearningSession.messages))
    if load_teaching: opts.append(selectinload(AILearningSession.teaching))
    if load_questions: opts.append(selectinload(AILearningSession.questions))
    if load_summary: opts.append(selectinload(AILearningSession.summary))
    if load_attempts: opts.append(selectinload(AILearningSession.teaching_attempts))
    stmt = select(AILearningSession).where(AILearningSession.id == session_id)
    if opts: stmt = stmt.options(*opts)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session: raise HTTPException(404, "Learning session not found.")
    if session.user_id != user_id: raise HTTPException(403, "Access denied.")
    return session

async def _next_sequence(session_id, db):
    result = await db.execute(select(AISessionMessage.sequence).where(AISessionMessage.session_id == session_id).order_by(AISessionMessage.sequence.desc()).limit(1))
    last = result.scalar_one_or_none()
    return (last or 0) + 1

async def _add_message(session_id, role, message_type, content, db, *, extra=None):
    seq = await _next_sequence(session_id, db)
    msg = AISessionMessage(session_id=session_id, role=role, message_type=message_type, content=content, sequence=seq, extra=extra)
    db.add(msg)
    await db.flush()
    return msg

async def _get_current_teaching(session_id, db):
    result = await db.execute(select(AISessionTeaching).where(AISessionTeaching.session_id == session_id, AISessionTeaching.is_current == True))
    return result.scalar_one_or_none()

async def _retire_current_teaching(session_id, db):
    await db.execute(update(AISessionTeaching).where(AISessionTeaching.session_id == session_id, AISessionTeaching.is_current == True).values(is_current=False))

def _build_curriculum_context(subject, topic, concept, session):
    objectives = "\\n".join(f"  {i+1}. {lo.title}: {lo.description}" for i, lo in enumerate(topic.learning_objectives or [])) or "  (none)"
    misconceptions = "\\n".join(f"  - {m.misconception}\\n    Correction: {m.correction}" for m in (concept.misconceptions or [])) or "  (none)"
    key_points = "\\n".join(f"  - {kp}" for kp in (concept.key_points or [])) or "  (none)"
    return (f"CURRICULUM CONTEXT\\nSubject: {subject.name}\\nTopic: {topic.name} (difficulty: {topic.difficulty or 'unspecified'})\\nTopic description: {topic.description or '(none)'}\\nConcept: {concept.name}\\nConcept explanation:\\n{concept.explanation}\\n\\nKey points:\\n{key_points}\\n\\nLearning objectives:\\n{objectives}\\n\\nKnown misconceptions:\\n{misconceptions}\\n\\nSTUDENT CONTEXT\\nFamiliarity: {session.student_familiarity}\\nIntent: {session.intent}\\nStudent note: {session.student_note or '(none)'}\\nCustom intent: {session.custom_intent_text or '(none)'}")

def _pick_next_strategy(used):
    used_set = set(used)
    for s in _STRATEGY_ROTATION:
        if s not in used_set: return s
    return _STRATEGY_ROTATION[1]

def _safe_list(v):
    return v if isinstance(v, list) else []

def _safe_str(v, fallback=""):
    return v.strip() if isinstance(v, str) else fallback

async def _load_curriculum_chain(subject_id, topic_id, concept_id, db):
    subj = (await db.execute(select(Subject).where(Subject.id == subject_id, Subject.is_active == True))).scalar_one_or_none()
    if not subj: raise HTTPException(404, f"Subject {subject_id} not found or inactive.")
    topic = (await db.execute(select(Topic).options(selectinload(Topic.learning_objectives), selectinload(Topic.misconceptions)).where(Topic.id == topic_id))).scalar_one_or_none()
    if not topic: raise HTTPException(404, f"Topic {topic_id} not found.")
    if topic.subject_id != subject_id: raise HTTPException(422, f"Topic {topic_id} does not belong to subject {subject_id}.")
    concept = (await db.execute(select(Concept).options(selectinload(Concept.misconceptions)).where(Concept.id == concept_id))).scalar_one_or_none()
    if not concept: raise HTTPException(404, f"Concept {concept_id} not found.")
    if concept.topic_id != topic_id: raise HTTPException(422, f"Concept {concept_id} does not belong to topic {topic_id}.")
    return subj, topic, concept


async def create_session(user_id, subject_id, topic_id, concept_id, student_familiarity, student_note, intent, custom_intent_text, db):
    await _load_curriculum_chain(subject_id, topic_id, concept_id, db)
    session = AILearningSession(user_id=user_id, subject_id=subject_id, topic_id=topic_id, concept_id=concept_id, student_familiarity=student_familiarity, student_note=student_note, intent=intent, custom_intent_text=custom_intent_text, status="created", started_at=_now())
    db.add(session)
    await db.flush()
    familiarity_labels = {"new": "completely new to this", "seen_before": "have seen this before", "know_basics": "know the basics", "know_well": "know it well", "need_help": "need help with something specific"}
    fam_label = familiarity_labels.get(student_familiarity, student_familiarity)
    welcome = f"Welcome to your learning session! You've selected this concept and indicated you {fam_label}. Your AI tutor is ready. Click **Start Teaching** whenever you're ready to begin."
    await _add_message(session.id, "system", "welcome", welcome, db)
    await db.commit()
    await db.refresh(session)
    return session

async def get_session(session_id, user_id, db):
    session = await _get_session_owned(session_id, user_id, db, load_messages=True, load_teaching=True, load_questions=True, load_summary=True, load_attempts=True)
    data = session.serialize()
    current_teaching = next((t for t in session.teaching if t.is_current), None)
    data["teaching"] = current_teaching.serialize() if current_teaching else None
    data["allTeaching"] = [t.serialize() for t in session.teaching]
    data["messages"] = [m.serialize() for m in session.messages]
    data["questions"] = [q.serialize() for q in session.questions]
    data["teachingAttempts"] = [a.serialize() for a in session.teaching_attempts]
    data["summary"] = session.summary.serialize() if session.summary else None
    return data

async def list_sessions(user_id, db, *, status=None, subject_id=None, limit=20, offset=0):
    stmt = select(AILearningSession).options(selectinload(AILearningSession.summary)).where(AILearningSession.user_id == user_id).order_by(AILearningSession.created_at.desc()).limit(limit).offset(offset)
    if status: stmt = stmt.where(AILearningSession.status == status)
    if subject_id: stmt = stmt.where(AILearningSession.subject_id == subject_id)
    rows = (await db.execute(stmt)).scalars().all()
    if not rows: return []
    subject_ids, topic_ids, concept_ids = list({r.subject_id for r in rows}), list({r.topic_id for r in rows}), list({r.concept_id for r in rows})
    subjects = {s.id: s.name for s in (await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()}
    topics = {t.id: t.name for t in (await db.execute(select(Topic).where(Topic.id.in_(topic_ids)))).scalars().all()}
    concepts = {c.id: c.name for c in (await db.execute(select(Concept).where(Concept.id.in_(concept_ids)))).scalars().all()}
    result = []
    for r in rows:
        d = r.serialize()
        d["subjectName"], d["topicName"], d["conceptName"] = subjects.get(r.subject_id), topics.get(r.topic_id), concepts.get(r.concept_id)
        d["overallScore"] = r.summary.overall_score if r.summary else None
        result.append(d)
    return result

async def abandon_session(session_id, user_id, db):
    session = await _get_session_owned(session_id, user_id, db)
    if session.status in ("completed", "abandoned"): return session.serialize()
    _set_status(session, "abandoned")
    await db.commit()
    await db.refresh(session)
    return session.serialize()

async def complete_session(session_id, user_id, db):
    session = await _get_session_owned(session_id, user_id, db)
    if session.status in ("completed", "abandoned"): return session.serialize()
    session.status, session.completed_at = "completed", _now()
    await db.commit()
    await db.refresh(session)
    return session.serialize()


async def teach_concept(session_id, user_id, db):
    session = await _get_session_owned(session_id, user_id, db, load_teaching=True, load_attempts=True)
    if session.status not in ("created", "teaching", "paused"): raise HTTPException(409, f"Cannot teach: session status is '{session.status}'.")
    subject, topic, concept = await _load_curriculum_chain(session.subject_id, session.topic_id, session.concept_id, db)
    used_strategies = [t.strategy for t in session.teaching]
    strategy, attempt_number = _pick_next_strategy(used_strategies), len(used_strategies) + 1
    curriculum_ctx = _build_curriculum_context(subject, topic, concept, session)
    system_prompt = "You are an expert AI tutor for PeerUP. Teach concepts clearly, adapting to the student's familiarity and intent. Always be encouraging, precise, and pedagogically sound. Return structured JSON only."
    prompt = f"""{curriculum_ctx}

TEACHING TASK
Strategy to use: {strategy}
Attempt number: {attempt_number}

Generate a complete teaching session for the concept above using the '{strategy}' strategy.
Adapt the depth and style to the student's familiarity level and intent.

Return JSON:
{{
  "explanation": "Main explanation text (markdown supported inside this string)",
  "key_points": ["point 1", "point 2", ...],
  "examples": ["example 1", "example 2", ...],
  "formulas": ["formula 1", ...],
  "analogies": ["analogy 1", ...],
  "worked_examples": ["step-by-step worked example 1", ...],
  "misconceptions": ["common mistake to avoid 1", ...],
  "summary": "One-paragraph summary the student can review",
  "study_prompt": "A short message telling the student what to focus on while studying"
}}

All array fields are required but may be empty []. explanation and summary are required non-empty strings. Keep explanation comprehensive but readable (400-800 words).
"""
    try:
        raw, provider = await call_with_fallback(prompt, system=system_prompt, temperature=0.7, json_mode=True)
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("AI teaching generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")
    explanation, summary_text, study_prompt = _safe_str(parsed.get("explanation"), "Teaching content unavailable."), _safe_str(parsed.get("summary"), ""), _safe_str(parsed.get("study_prompt"), "Take your time to read through the material above.")
    await _retire_current_teaching(session_id, db)
    teaching = AISessionTeaching(session_id=session_id, strategy=strategy, attempt_number=attempt_number, explanation=explanation, key_points=_safe_list(parsed.get("key_points")), examples=_safe_list(parsed.get("examples")), formulas=_safe_list(parsed.get("formulas")), analogies=_safe_list(parsed.get("analogies")), worked_examples=_safe_list(parsed.get("worked_examples")), misconceptions=_safe_list(parsed.get("misconceptions")), summary=summary_text, raw_content=raw, is_current=True)
    db.add(teaching)
    await db.flush()
    attempt = AISessionTeachingAttempt(session_id=session_id, attempt_number=attempt_number, strategy=strategy, reason="initial_teaching" if attempt_number == 1 else "reteach", teaching_snapshot_id=teaching.id)
    db.add(attempt)
    message_content = f"{explanation}\\n\\n---\\n*{study_prompt}*"
    await _add_message(session_id, "ai", "teaching", message_content, db, extra={"strategy": strategy, "teachingId": teaching.id, "provider": provider})
    if session.status == "created": _set_status(session, "teaching")
    await db.commit()
    await db.refresh(teaching)
    return teaching.serialize()

async def respond_to_student(session_id, user_id, content, db):
    session = await _get_session_owned(session_id, user_id, db, load_messages=True, load_teaching=True)
    if session.status in ("completed", "abandoned"): raise HTTPException(409, "Session is closed.")
    await _add_message(session_id, "student", "question", content, db)
    await db.flush()
    recent_msgs = sorted(session.messages, key=lambda m: m.sequence)[-_CHAT_HISTORY_WINDOW:]
    history_text = "\\n".join(f"{'Student' if m.role == 'student' else 'Tutor'}: {m.content[:400]}" for m in recent_msgs if m.message_type not in ("welcome", "system", "timer_start", "timer_end"))
    current_teaching = await _get_current_teaching(session_id, db)
    teaching_context = f"\\nCurrent teaching snapshot (strategy: {current_teaching.strategy}):\\n{(current_teaching.explanation or '')[:600]}" if current_teaching else ""
    subject, topic, concept = await _load_curriculum_chain(session.subject_id, session.topic_id, session.concept_id, db)
    curriculum_ctx = _build_curriculum_context(subject, topic, concept, session)
    system_prompt = "You are an AI tutor in an active learning session on PeerUP. Answer the student's question helpfully, staying on topic. Be concise but thorough. Return JSON only."
    prompt = f"""{curriculum_ctx}
{teaching_context}

RECENT CONVERSATION:
{history_text}

Student just asked: {content}

Respond as the AI tutor. Return JSON:
{{
  "response": "Your tutor response here (markdown supported)"
}}
"""
    try:
        raw, provider = await call_with_fallback(prompt, system=system_prompt, temperature=0.7, json_mode=True)
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("AI respond failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")
    response_text = _safe_str(parsed.get("response"), "I'm sorry, I couldn't generate a response.")
    msg = await _add_message(session_id, "ai", "teaching", response_text, db, extra={"provider": provider, "inResponseTo": content[:100]})
    await db.commit()
    await db.refresh(msg)
    return msg.serialize()


async def start_study_period(session_id, user_id, duration_seconds, db):
    session = await _get_session_owned(session_id, user_id, db)
    if session.status not in ("teaching", "reteaching"): raise HTTPException(409, f"Cannot start study period: session is '{session.status}'. Must be teaching or reteaching.")
    started = _now()
    period = AISessionStudyPeriod(session_id=session_id, duration_seconds=duration_seconds, started_at=started, expected_end_at=started + timedelta(seconds=duration_seconds), timer_status="active")
    db.add(period)
    await db.flush()
    _set_status(session, "studying")
    await _add_message(session_id, "system", "timer_start", f"Study timer started: {duration_seconds} seconds.", db, extra={"studyPeriodId": period.id, "durationSeconds": duration_seconds})
    await db.commit()
    await db.refresh(period)
    return period.serialize()

async def finish_study_period(session_id, user_id, study_period_id, db, *, interrupted=False):
    session = await _get_session_owned(session_id, user_id, db)
    result = await db.execute(select(AISessionStudyPeriod).where(AISessionStudyPeriod.id == study_period_id, AISessionStudyPeriod.session_id == session_id))
    period = result.scalar_one_or_none()
    if not period: raise HTTPException(404, "Study period not found.")
    if period.timer_status != "active": raise HTTPException(409, "Study period is not active.")
    period.ended_at, period.timer_status = _now(), "interrupted" if interrupted else "completed"
    _set_status(session, "retrieval")
    await _add_message(session_id, "system", "timer_end", "Study time complete. Time for a quick retrieval check!", db, extra={"studyPeriodId": study_period_id})
    await db.commit()
    await db.refresh(period)
    return period.serialize()

async def generate_retrieval_questions(session_id, user_id, db, *, count=3):
    session = await _get_session_owned(session_id, user_id, db, load_teaching=True)
    if session.status not in ("retrieval", "practice"): raise HTTPException(409, f"Cannot generate questions: session is '{session.status}'.")
    current_teaching = await _get_current_teaching(session_id, db)
    if not current_teaching: raise HTTPException(409, "No teaching content found. Teach the concept first.")
    subject, topic, concept = await _load_curriculum_chain(session.subject_id, session.topic_id, session.concept_id, db)
    teaching_summary = f"Strategy used: {current_teaching.strategy}\\nExplanation: {(current_teaching.explanation or '')[:800]}\\nKey points: {', '.join(current_teaching.key_points or [])}\\nExamples covered: {', '.join((current_teaching.examples or [])[:3])}"
    system_prompt = "You are an expert AI tutor generating retrieval practice questions. Questions must test understanding of what was actually taught, not generic knowledge. Return JSON only."
    prompt = f"""CURRICULUM CONTEXT
Subject: {subject.name} | Topic: {topic.name} | Concept: {concept.name}

WHAT WAS TAUGHT (ground questions in this):
{teaching_summary}

STUDENT CONTEXT
Familiarity: {session.student_familiarity} | Intent: {session.intent}

Generate exactly {count} retrieval questions that test understanding of the teaching content above. Mix question types for variety. At least one should be short_answer or explanation type.

Return JSON:
{{
  "questions": [
    {{
      "question": "Question text here",
      "question_type": "short_answer|multiple_choice|calculation|explanation|true_false|application",
      "options": null,
      "expected_answer": "Model answer for AI evaluation",
      "rubric": "What to look for when marking"
    }},
    ...
  ]
}}

For multiple_choice, options must be: [{{"label": "A", "text": "..."}}, ...]. For all other types, options must be null.
"""
    try:
        raw, _ = await call_with_fallback(prompt, system=system_prompt, temperature=0.6, json_mode=True)
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Question generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")
    raw_questions = _safe_list(parsed.get("questions"))
    if not raw_questions: raise HTTPException(502, "AI returned no questions.")
    existing_count_result = await db.execute(select(AISessionQuestion.sequence).where(AISessionQuestion.session_id == session_id).order_by(AISessionQuestion.sequence.desc()).limit(1))
    last_seq = existing_count_result.scalar_one_or_none() or 0
    created = []
    for i, q in enumerate(raw_questions[:count], 1):
        question_type = q.get("question_type", "short_answer")
        if question_type not in ("short_answer", "multiple_choice", "calculation", "explanation", "true_false", "application"): question_type = "short_answer"
        obj = AISessionQuestion(session_id=session_id, question=_safe_str(q.get("question"), "Question unavailable."), question_type=question_type, options=q.get("options") if question_type == "multiple_choice" else None, expected_answer=_safe_str(q.get("expected_answer")), rubric=_safe_str(q.get("rubric")), sequence=last_seq + i)
        db.add(obj)
        await db.flush()
        created.append(obj)
    await db.commit()
    for obj in created: await db.refresh(obj)
    return [q.serialize() for q in created]

async def submit_answer(session_id, user_id, question_id, student_answer, response_time_seconds, db):
    session = await _get_session_owned(session_id, user_id, db)
    q_result = await db.execute(select(AISessionQuestion).where(AISessionQuestion.id == question_id, AISessionQuestion.session_id == session_id))
    question = q_result.scalar_one_or_none()
    if not question: raise HTTPException(404, "Question not found in this session.")
    prev_result = await db.execute(select(AISessionAnswer.attempt_number).where(AISessionAnswer.session_id == session_id, AISessionAnswer.question_id == question_id).order_by(AISessionAnswer.attempt_number.desc()).limit(1))
    prev_attempt, attempt_number = prev_result.scalar_one_or_none() or 0, (prev_result.scalar_one_or_none() or 0) + 1
    answer = AISessionAnswer(session_id=session_id, question_id=question_id, student_answer=student_answer, attempt_number=attempt_number, response_time_seconds=response_time_seconds)
    db.add(answer)
    await db.flush()
    system_prompt = "You are an AI tutor evaluating a student's answer. Be fair, constructive, and encouraging. Return JSON only."
    prompt = f"""QUESTION: {question.question}
QUESTION TYPE: {question.question_type}
EXPECTED ANSWER: {question.expected_answer or '(use your knowledge)'}
MARKING RUBRIC: {question.rubric or '(assess understanding and accuracy)'}

STUDENT'S ANSWER: {student_answer}

Evaluate the student's answer fairly and constructively.

Return JSON:
{{
  "is_correct": true/false,
  "score": 0-100,
  "feedback": "Constructive feedback explaining what was right/wrong and how to improve",
  "key_insight": "The most important thing the student should take away"
}}
"""
    try:
        raw, provider = await call_with_fallback(prompt, system=system_prompt, temperature=0.4, json_mode=True)
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Answer evaluation failed: %s", exc)
        parsed = {"is_correct": None, "score": None, "feedback": "Evaluation unavailable. Your answer has been recorded.", "key_insight": ""}
        provider = "none"
    answer.is_correct, score_val = parsed.get("is_correct"), parsed.get("score")
    answer.score = int(score_val) if isinstance(score_val, (int, float)) else None
    answer.feedback, answer.ai_evaluation = _safe_str(parsed.get("feedback")), {"keyInsight": _safe_str(parsed.get("key_insight")), "provider": provider}
    feedback_content = f"**{'Correct!' if answer.is_correct else 'Not quite.'}** (Score: {answer.score}/100)\\n\\n{answer.feedback}"
    await _add_message(session_id, "ai", "feedback", feedback_content, db, extra={"questionId": question_id, "answerId": answer.id, "score": answer.score})
    await db.commit()
    await db.refresh(answer)
    return answer.serialize()


async def generate_adaptive_reteach(session_id, user_id, reason, db):
    session = await _get_session_owned(session_id, user_id, db, load_teaching=True, load_attempts=True)
    if session.status not in ("retrieval", "reteaching", "teaching"): raise HTTPException(409, f"Cannot reteach: session is '{session.status}'.")
    subject, topic, concept = await _load_curriculum_chain(session.subject_id, session.topic_id, session.concept_id, db)
    used_strategies, new_strategy, attempt_number = [t.strategy for t in session.teaching], _pick_next_strategy([t.strategy for t in session.teaching]), len(session.teaching) + 1
    recent_answers_result = await db.execute(select(AISessionAnswer, AISessionQuestion).join(AISessionQuestion, AISessionAnswer.question_id == AISessionQuestion.id).where(AISessionAnswer.session_id == session_id).order_by(AISessionAnswer.created_at.desc()).limit(5))
    recent_rows = recent_answers_result.all()
    struggle_context = "\\n".join(f"  Q: {row.AISessionQuestion.question}\\n  A: {row.AISessionAnswer.student_answer}\\n  Score: {row.AISessionAnswer.score}/100" for row in recent_rows) or "  (no answers yet -- student requested reteaching directly)"
    curriculum_ctx = _build_curriculum_context(subject, topic, concept, session)
    system_prompt = "You are an adaptive AI tutor. The student struggled with this concept. Use a completely different teaching approach to explain it fresh. Do NOT repeat the previous explanation. Return JSON only."
    prompt = f"""{curriculum_ctx}

PREVIOUS STRATEGIES USED: {', '.join(used_strategies)}
NEW STRATEGY TO USE: {new_strategy}
STUDENT STRUGGLES (recent answers):
{struggle_context}
STUDENT REASON: {reason or '(none given)'}

Reteach this concept from scratch using the '{new_strategy}' strategy. Make it genuinely different from previous approaches -- a fresh angle.

Return JSON:
{{
  "explanation": "Complete reteaching using {new_strategy} strategy",
  "key_points": ["point 1", ...],
  "examples": ["example 1", ...],
  "formulas": [],
  "analogies": [],
  "worked_examples": [],
  "misconceptions": [],
  "summary": "Brief summary of this new explanation",
  "encouragement": "A short encouraging message for the student"
}}
"""
    try:
        raw, provider = await call_with_fallback(prompt, system=system_prompt, temperature=0.75, json_mode=True)
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Reteach generation failed: %s", exc)
        raise HTTPException(502, f"AI service error: {exc}")
    explanation, encouragement = _safe_str(parsed.get("explanation"), "Reteaching content unavailable."), _safe_str(parsed.get("encouragement"), "You've got this -- a different approach sometimes makes all the difference!")
    await _retire_current_teaching(session_id, db)
    teaching = AISessionTeaching(session_id=session_id, strategy=new_strategy, attempt_number=attempt_number, explanation=explanation, key_points=_safe_list(parsed.get("key_points")), examples=_safe_list(parsed.get("examples")), formulas=_safe_list(parsed.get("formulas")), analogies=_safe_list(parsed.get("analogies")), worked_examples=_safe_list(parsed.get("worked_examples")), misconceptions=_safe_list(parsed.get("misconceptions")), summary=_safe_str(parsed.get("summary")), raw_content=raw, is_current=True)
    db.add(teaching)
    await db.flush()
    attempt = AISessionTeachingAttempt(session_id=session_id, attempt_number=attempt_number, strategy=new_strategy, reason=reason or "student_struggled", teaching_snapshot_id=teaching.id)
    db.add(attempt)
    message_content = f"{explanation}\\n\\n---\\n*{encouragement}*"
    await _add_message(session_id, "ai", "reteach", message_content, db, extra={"strategy": new_strategy, "teachingId": teaching.id, "provider": provider})
    _set_status(session, "reteaching")
    await db.commit()
    await db.refresh(teaching)
    return teaching.serialize()

async def generate_session_summary(session_id, user_id, db):
    session = await _get_session_owned(session_id, user_id, db, load_teaching=True, load_questions=True, load_attempts=True, load_summary=True)
    if session.status in ("created", "abandoned"): raise HTTPException(409, f"Cannot summarize: session is '{session.status}'.")
    answers_result = await db.execute(select(AISessionAnswer).where(AISessionAnswer.session_id == session_id))
    all_answers = answers_result.scalars().all()
    total_answered, total_correct = len(all_answers), sum(1 for a in all_answers if a.is_correct is True)
    scores = [a.score for a in all_answers if a.score is not None]
    avg_score, reteach_count = int(sum(scores) / len(scores)) if scores else None, max(0, len(session.teaching_attempts) - 1)
    strategies_used = [t.strategy for t in session.teaching]
    current_teaching = next((t for t in session.teaching if t.is_current), None)
    teaching_summary = f"Final teaching strategy: {current_teaching.strategy}\\nKey points covered: {', '.join((current_teaching.key_points or [])[:5])}" if current_teaching else ""
    subject, topic, concept = await _load_curriculum_chain(session.subject_id, session.topic_id, session.concept_id, db)
    answer_details = "\\n".join(f"  Q{i+1}: Score {a.score}/100, Correct: {a.is_correct}" for i, a in enumerate(all_answers[:10])) or "  No answers submitted."
    system_prompt = "You are an AI tutor generating a learning session summary. Be specific, constructive, and encouraging. Return JSON only."
    prompt = f"""SESSION SUMMARY REQUEST
Subject: {subject.name} | Topic: {topic.name} | Concept: {concept.name}
Student familiarity: {session.student_familiarity} | Intent: {session.intent}

{teaching_summary}
Strategies used: {', '.join(strategies_used)}
Reteaching rounds: {reteach_count}
Questions answered: {total_answered}
Questions correct: {total_correct}
Average score: {avg_score}/100 if avg_score else 'N/A'

Answer breakdown:
{answer_details}

Generate a comprehensive session summary. Be specific to this concept and what the student demonstrated.

Return JSON:
{{
  "summary_text": "2-3 paragraph narrative summary of what the student learned and how they performed",
  "key_ideas": ["Key idea 1 they should remember", ...],
  "strengths": ["What they showed they understood well", ...],
  "areas_for_practice": ["What needs more work", ...],
  "recommended_next": "Brief recommendation for what to study next",
  "teaching_methods_used": {strategies_used}
}}
"""
    try:
        raw, _ = await call_with_fallback(prompt, system=system_prompt, temperature=0.6, json_mode=True)
        parsed = parse_json(raw)
    except Exception as exc:
        logger.error("Summary generation failed: %s", exc)
        parsed = {"summary_text": f"You completed a learning session on {concept.name}.", "key_ideas": [], "strengths": [], "areas_for_practice": [], "recommended_next": None, "teaching_methods_used": strategies_used}
    if session.summary:
        summary = session.summary
        summary.summary_text, summary.key_ideas, summary.strengths = _safe_str(parsed.get("summary_text")), _safe_list(parsed.get("key_ideas")), _safe_list(parsed.get("strengths"))
        summary.areas_for_practice, summary.recommended_next, summary.teaching_methods_used = _safe_list(parsed.get("areas_for_practice")), parsed.get("recommended_next"), _safe_list(parsed.get("teaching_methods_used"))
        summary.questions_answered, summary.questions_correct, summary.reteach_count, summary.overall_score = total_answered, total_correct, reteach_count, avg_score
    else:
        summary = AISessionSummary(session_id=session_id, summary_text=_safe_str(parsed.get("summary_text")), key_ideas=_safe_list(parsed.get("key_ideas")), strengths=_safe_list(parsed.get("strengths")), areas_for_practice=_safe_list(parsed.get("areas_for_practice")), recommended_next=parsed.get("recommended_next"), teaching_methods_used=_safe_list(parsed.get("teaching_methods_used")), questions_answered=total_answered, questions_correct=total_correct, reteach_count=reteach_count, overall_score=avg_score)
        db.add(summary)
    await db.flush()
    await _add_message(session_id, "ai", "summary", summary.summary_text or "Session complete.", db)
    if session.status not in ("completed", "abandoned"):
        session.status, session.completed_at = "completed", _now()
    await db.commit()
    await db.refresh(summary)
    return summary.serialize()

async def record_integrity_event(session_id, user_id, event_type, meta, db):
    await _get_session_owned(session_id, user_id, db)
    event = AISessionIntegrityEvent(session_id=session_id, event_type=event_type, occurred_at=_now(), meta=meta)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event.serialize()
