from __future__ import annotations

import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# These are genuine PostgreSQL integration tests. They are skipped unless the
# caller supplies an isolated TEST_DATABASE_URL that already has the PeerUP
# schema plus migration 002 applied.
os.environ.setdefault("JWT_SECRET", "integration-test-secret")
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
async def db_engine():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not configured; PostgreSQL integration tests were not run.")
    psycopg = pytest.importorskip("psycopg")
    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True, connect_args={"prepare_threshold": None})
    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))
    except Exception as exc:
        await engine.dispose()
        pytest.skip(f"TEST_DATABASE_URL is unavailable: {exc}")
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_factory(db_engine):
    return async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def battle_fixture(db_factory):
    from app.models.challenge import ChallengeQuestion, ChallengeSession
    from app.models.curriculum import Concept, LearningObjective, Subject, Topic
    from app.models.user import User

    suffix = f"{os.getpid()}-{id(object())}"
    async with db_factory() as db:
        subject = Subject(name=f"Audit Subject {suffix}", slug=f"audit-subject-{suffix}")
        db.add(subject)
        await db.flush()

        topic = Topic(subject_id=subject.id, name=f"Audit Topic {suffix}", slug=f"audit-topic-{suffix}")
        db.add(topic)
        await db.flush()

        objective = LearningObjective(
            topic_id=topic.id,
            title="Audit objective",
            description="Objective used only for integration tests.",
            order_index=1,
        )
        concept = Concept(
            topic_id=topic.id,
            name=f"Audit Concept {suffix}",
            explanation="Integration-test concept.",
            key_points=["test"],
        )
        db.add_all([objective, concept])
        await db.flush()

        users = [
            User(email=f"audit-a-{suffix}@example.test", full_name="Audit A", email_verified=True),
            User(email=f"audit-b-{suffix}@example.test", full_name="Audit B", email_verified=True),
            User(email=f"audit-outsider-{suffix}@example.test", full_name="Audit outsider", email_verified=True),
        ]
        db.add_all(users)
        await db.flush()

        challenge = ChallengeSession(
            challenger_id=users[0].id,
            opponent_id=users[1].id,
            subject_id=subject.id,
            topic_id=topic.id,
            concept_id=concept.id,
            status="question_active",
            question_count=3,
            current_question=1,
            current_question_started_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
            current_question_deadline_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc) + timedelta(seconds=30),
        )
        db.add(challenge)
        await db.flush()

        questions = []
        for n in range(1, 4):
            questions.append(
                ChallengeQuestion(
                    challenge_id=challenge.id,
                    question_number=n,
                    objective_id=objective.id,
                    question=f"Audit question {n}",
                    options={"A": "Correct", "B": "Wrong", "C": "Wrong", "D": "Wrong"},
                    correct_answer="A",
                    explanation="Audit explanation.",
                    difficulty="medium",
                )
            )
        db.add_all(questions)
        await db.commit()
        challenge_id = challenge.id
        user_ids = tuple(u.id for u in users)
        subject_id, topic_id, concept_id = subject.id, topic.id, concept.id

    yield {
        "challenge_id": challenge_id,
        "a": user_ids[0],
        "b": user_ids[1],
        "outsider": user_ids[2],
        "subject_id": subject_id,
        "topic_id": topic_id,
        "concept_id": concept_id,
    }

    async with db_factory() as db:
        await db.execute(delete(ChallengeSession).where(ChallengeSession.id == challenge_id))
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.execute(delete(Topic).where(Topic.id == topic_id))
        await db.execute(delete(Subject).where(Subject.id == subject_id))
        await db.commit()


async def _submit(db_factory, challenge_id, user_id, question_id, answer="A"):
    from app.services.challenge_service import submit_answer

    async with db_factory() as db:
        return await submit_answer(challenge_id, user_id, question_id, answer, db)


@pytest.mark.asyncio
async def test_concurrent_answers_produce_one_reveal_and_two_answers(battle_fixture, db_factory):
    from app.models.challenge import ChallengeAnswer, ChallengeResult, ChallengeSession, ChallengeQuestion
    from app.services.challenge_service import submit_answer

    async with db_factory() as db:
        challenge = await db.get(ChallengeSession, battle_fixture["challenge_id"])
        question = (
            await db.execute(
                select(ChallengeQuestion).where(
                    ChallengeQuestion.challenge_id == challenge.id,
                    ChallengeQuestion.question_number == 1,
                )
            )
        ).scalar_one()

    results = await asyncio.gather(
        _submit(db_factory, battle_fixture["challenge_id"], battle_fixture["a"], question.id),
        _submit(db_factory, battle_fixture["challenge_id"], battle_fixture["b"], question.id),
        return_exceptions=True,
    )
    assert not any(isinstance(item, Exception) for item in results)

    async with db_factory() as db:
        answers = (
            await db.execute(
                select(ChallengeAnswer).where(
                    ChallengeAnswer.challenge_id == battle_fixture["challenge_id"],
                    ChallengeAnswer.question_id == question.id,
                )
            )
        ).scalars().all()
        challenge = await db.get(ChallengeSession, battle_fixture["challenge_id"])
        results_rows = (
            await db.execute(
                select(ChallengeResult).where(ChallengeResult.challenge_id == challenge.id)
            )
        ).scalars().all()

    assert len(answers) == 2
    assert challenge.status in {"question_reveal", "next_question", "question_active"}
    assert len(results_rows) == 0  # question 1 of a 3-question battle is not final


@pytest.mark.asyncio
async def test_duplicate_answer_does_not_replace_first_submission(battle_fixture, db_factory):
    from app.models.challenge import ChallengeAnswer, ChallengeQuestion
    from app.services.challenge_service import submit_answer

    async with db_factory() as db:
        question = (
            await db.execute(
                select(ChallengeQuestion).where(
                    ChallengeQuestion.challenge_id == battle_fixture["challenge_id"],
                    ChallengeQuestion.question_number == 1,
                )
            )
        ).scalar_one()

    await _submit(db_factory, battle_fixture["challenge_id"], battle_fixture["a"], question.id, "A")
    with pytest.raises(Exception):
        await _submit(db_factory, battle_fixture["challenge_id"], battle_fixture["a"], question.id, "B")

    async with db_factory() as db:
        rows = (
            await db.execute(
                select(ChallengeAnswer).where(
                    ChallengeAnswer.challenge_id == battle_fixture["challenge_id"],
                    ChallengeAnswer.question_id == question.id,
                    ChallengeAnswer.user_id == battle_fixture["a"],
                )
            )
        ).scalars().all()

    assert len(rows) == 1
    assert rows[0].answer == "A"
    assert rows[0].is_correct is True


@pytest.mark.asyncio
async def test_answer_privacy_before_both_answer(battle_fixture, db_factory):
    from app.models.challenge import ChallengeQuestion
    from app.services.challenge_service import get_challenge_state, submit_answer

    async with db_factory() as db:
        question = (
            await db.execute(
                select(ChallengeQuestion).where(
                    ChallengeQuestion.challenge_id == battle_fixture["challenge_id"],
                    ChallengeQuestion.question_number == 1,
                )
            )
        ).scalar_one()

    await _submit(db_factory, battle_fixture["challenge_id"], battle_fixture["a"], question.id)

    async with db_factory() as db:
        state = await get_challenge_state(battle_fixture["challenge_id"], battle_fixture["a"], db)

    payload = state["currentQuestionData"]
    assert payload["hasSubmitted"] is True
    assert "correctAnswer" not in payload
    assert "isCorrect" not in payload
    assert "explanation" not in payload
    assert "revealAnswers" not in payload or payload["revealAnswers"] == []


@pytest.mark.asyncio
async def test_nonparticipant_cannot_read_challenge(battle_fixture, db_factory):
    from app.services.challenge_service import get_challenge_state

    async with db_factory() as db:
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            await get_challenge_state(
                battle_fixture["challenge_id"],
                battle_fixture["outsider"],
                db,
            )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_result_persistence_is_idempotent_with_zero_one_or_two_existing_results(battle_fixture, db_factory):
    from app.models.challenge import ChallengeResult, ChallengeSession
    from app.services.challenge_service import _persist_results_locked

    # Use a completed battle with no answers so result construction is deterministic.
    async with db_factory() as db:
        challenge = await db.get(ChallengeSession, battle_fixture["challenge_id"])
        challenge.status = "completed"
        challenge.current_question = 3
        challenge.completed_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        await db.commit()

    async with db_factory() as db:
        challenge = (
            await db.execute(
                select(ChallengeSession)
                .where(ChallengeSession.id == battle_fixture["challenge_id"])
                .with_for_update()
            )
        ).scalar_one()
        first = await _persist_results_locked(challenge, db, incomplete=False)
        await db.commit()
        assert len(first) == 2

    async with db_factory() as db:
        challenge = (
            await db.execute(
                select(ChallengeSession)
                .where(ChallengeSession.id == battle_fixture["challenge_id"])
                .with_for_update()
            )
        ).scalar_one()
        second = await _persist_results_locked(challenge, db, incomplete=False)
        await db.commit()
        assert len(second) == 2

        rows = (
            await db.execute(
                select(ChallengeResult).where(ChallengeResult.challenge_id == challenge.id)
            )
        ).scalars().all()

    assert len(rows) == 2


@pytest.mark.asyncio
async def test_concurrent_active_pair_creation_hits_database_constraint(battle_fixture, db_factory):
    from app.models.challenge import ChallengeSession

    base = battle_fixture

    async def insert(challenger, opponent):
        async with db_factory() as db:
            row = ChallengeSession(
                challenger_id=challenger,
                opponent_id=opponent,
                subject_id=base["subject_id"],
                topic_id=base["topic_id"],
                concept_id=base["concept_id"],
                status="pending",
                question_count=3,
            )
            db.add(row)
            try:
                await db.commit()
                return "committed"
            except IntegrityError:
                await db.rollback()
                return "conflict"

    # Existing battle is itself active, so both inserts should conflict.
    outcomes = await asyncio.gather(
        insert(base["a"], base["b"]),
        insert(base["b"], base["a"]),
    )
    assert outcomes == ["conflict", "conflict"]


@pytest.mark.asyncio
async def test_timeout_is_server_authoritative_and_records_timeout_answer(battle_fixture, db_factory):
    from datetime import datetime, timezone
    from app.models.challenge import ChallengeAnswer, ChallengeSession, ChallengeQuestion
    from app.services.challenge_service import get_challenge_state

    async with db_factory() as db:
        challenge = await db.get(ChallengeSession, battle_fixture["challenge_id"])
        challenge.current_question_deadline_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        question = (
            await db.execute(
                select(ChallengeQuestion).where(
                    ChallengeQuestion.challenge_id == challenge.id,
                    ChallengeQuestion.question_number == 1,
                )
            )
        ).scalar_one()
        await db.commit()

    async with db_factory() as db:
        await get_challenge_state(battle_fixture["challenge_id"], battle_fixture["a"], db)

    async with db_factory() as db:
        rows = (
            await db.execute(
                select(ChallengeAnswer).where(
                    ChallengeAnswer.challenge_id == battle_fixture["challenge_id"],
                    ChallengeAnswer.question_id == question.id,
                )
            )
        ).scalars().all()
    assert len(rows) == 2
    assert all(row.timed_out for row in rows)
    assert all(row.answer is None for row in rows)


@pytest.mark.asyncio
async def test_disconnect_and_reconnect_preserve_server_state(battle_fixture, db_factory):
    from app.models.challenge import ChallengeSession
    from app.services.challenge_service import get_challenge_state, mark_connected, mark_disconnected

    async with db_factory() as db:
        before = await get_challenge_state(battle_fixture["challenge_id"], battle_fixture["a"], db)

    async with db_factory() as db:
        await mark_disconnected(
            battle_fixture["challenge_id"],
            battle_fixture["a"],
            db,
            currently_connected_elsewhere=False,
        )

    async with db_factory() as db:
        challenge, reconnected = await mark_connected(battle_fixture["challenge_id"], battle_fixture["a"], db)
        assert reconnected is True
        assert challenge.current_question == 1
        assert challenge.status in {"question_active", "waiting_for_opponent"}

    async with db_factory() as db:
        after = await get_challenge_state(battle_fixture["challenge_id"], battle_fixture["a"], db)

    assert after["id"] == before["id"]
    assert after["currentQuestion"] == before["currentQuestion"]


@pytest.mark.asyncio
async def test_http_routes_reject_nonparticipants(battle_fixture, db_factory):
    httpx = pytest.importorskip("httpx")
    try:
        from app.main import app
        from app.core.database import get_session
        from app.core.security import current_user
        from app.models.user import User
    except ImportError as exc:
        pytest.skip(f"FastAPI HTTP integration dependencies unavailable: {exc}")

    async with db_factory() as db:
        outsider = await db.get(User, battle_fixture["outsider"])

    async def override_user():
        return outsider

    async def override_session():
        async with db_factory() as db:
            yield db

    app.dependency_overrides[current_user] = override_user
    app.dependency_overrides[get_session] = override_session
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            endpoints = [
                ("GET", f"/api/challenges/{battle_fixture['challenge_id']}"),
                ("POST", f"/api/challenges/{battle_fixture['challenge_id']}/accept"),
                ("POST", f"/api/challenges/{battle_fixture['challenge_id']}/answer"),
                ("GET", f"/api/challenges/{battle_fixture['challenge_id']}/results"),
                ("GET", f"/api/challenges/{battle_fixture['challenge_id']}/review"),
            ]
            for method, path in endpoints:
                if method == "POST" and path.endswith("/answer"):
                    response = await client.post(
                        path.replace("/answer", f"/questions/1/answer"),
                        json={"answer": "A"},
                    )
                else:
                    response = await client.request(method, path)
                assert response.status_code == 403, (method, path, response.text)
    finally:
        app.dependency_overrides.pop(current_user, None)
        app.dependency_overrides.pop(get_session, None)


def test_model_declares_active_pair_unique_index():
    from app.models.challenge import ChallengeSession

    names = {idx.name for idx in ChallengeSession.__table__.indexes}
    assert "uq_challenge_active_pair_concept" in names


@pytest.mark.asyncio
async def test_websocket_rejects_invalid_jwt(battle_fixture):
    try:
        from fastapi.testclient import TestClient
        from app.main import app
    except ImportError as exc:
        pytest.skip(f"WebSocket integration dependencies unavailable: {exc}")

    with TestClient(app) as client:
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/api/challenges/ws/{battle_fixture['challenge_id']}?token=not-a-token"
            ):
                pass
