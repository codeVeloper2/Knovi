from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("JWT_SECRET", "test-secret-for-peerup")
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from app.models.challenge import ChallengeAnswer
from app.schemas.challenge import (
    ChallengeBlueprint,
    ChallengeBlueprintObjective,
    ChallengeDifficulty,
    ChallengeStudentEvidence,
    ChallengeAnswerRequest,
    GeneratedChallengeQuestion,
    GeneratedQuestionOption,
    GeneratedQuestionSet,
)
from app.services.challenge_ai_service import (
    ChallengePreparationError,
    build_blueprint,
    load_challenge_context,
    validate_questions_deterministically,
)
from app.services.challenge_service import (
    VALID_TRANSITIONS,
    _transition,
    build_current_question_payload,
    build_player_result_snapshot,
)


# Keep the test import block valid under normal Python parsing while testing the
# real helper below.
from app.services import challenge_service


def _objective(oid: int, title: str = "Objective") -> SimpleNamespace:
    return SimpleNamespace(id=oid, title=f"{title} {oid}", description=f"Description {oid}", order_index=oid)


def _session(user_id: int, objective_ids: list[int]) -> SimpleNamespace:
    teaching = SimpleNamespace(
        objective_ids=objective_ids,
        raw_content="{}",
        explanation="Explanation",
        key_points=["Key point"],
        examples=["Example"],
        formulas=[],
        worked_examples=[],
        misconceptions=[],
        summary="Summary",
        created_at=None,
        id=1,
    )
    return SimpleNamespace(
        id=10 + user_id,
        user_id=user_id,
        concept_id=7,
        teaching=[teaching],
        questions=[],
        summary=None,
    )


def _blueprint() -> ChallengeBlueprint:
    return ChallengeBlueprint(
        conceptId=7,
        topicId=4,
        subjectId=2,
        questionCount=5,
        sharedObjectives=[
            ChallengeBlueprintObjective(objectiveId=2, title="Apply", description="Apply the concept."),
        ],
        focusAreas=["Apply the concept"],
        difficultyDistribution={
            ChallengeDifficulty.EASY: 1,
            ChallengeDifficulty.MEDIUM: 3,
            ChallengeDifficulty.HARD: 1,
        },
        studentContext={
            "student_a": ChallengeStudentEvidence(sourceSessionId=11, objectiveIds=[2], weakAreas=[], misconceptions=[], evidence=[]),
            "student_b": ChallengeStudentEvidence(sourceSessionId=12, objectiveIds=[2], weakAreas=[], misconceptions=[], evidence=[]),
        },
    )


def _question(number: int, difficulty: ChallengeDifficulty = ChallengeDifficulty.MEDIUM) -> GeneratedChallengeQuestion:
    return GeneratedChallengeQuestion(
        questionNumber=number,
        objectiveId=2,
        question=f"Which statement correctly applies the concept in case {number}?",
        options=[
            GeneratedQuestionOption(label="A", text="Correct application"),
            GeneratedQuestionOption(label="B", text="Incorrect application one"),
            GeneratedQuestionOption(label="C", text="Incorrect application two"),
            GeneratedQuestionOption(label="D", text="Incorrect application three"),
        ],
        correctAnswer="A",
        explanation="The first option matches the supplied objective.",
        difficulty=difficulty,
    )


@pytest.mark.parametrize(
    ("question_count", "expected"),
    [
        (3, {ChallengeDifficulty.EASY: 1, ChallengeDifficulty.MEDIUM: 2, ChallengeDifficulty.HARD: 0}),
        (5, {ChallengeDifficulty.EASY: 1, ChallengeDifficulty.MEDIUM: 3, ChallengeDifficulty.HARD: 1}),
        (10, {ChallengeDifficulty.EASY: 2, ChallengeDifficulty.MEDIUM: 6, ChallengeDifficulty.HARD: 2}),
    ],
)
def test_difficulty_distribution_is_deterministic(question_count, expected):
    assert challenge_service._difficulty_distribution(question_count) == expected


def test_state_machine_allows_only_declared_transitions():
    challenge = SimpleNamespace(status="pending")
    _transition(challenge, "accepted")
    assert challenge.status == "accepted"

    with pytest.raises(HTTPException) as exc:
        _transition(challenge, "completed")
    assert exc.value.status_code == 409
    assert "accepted" in str(exc.value.detail)
    assert VALID_TRANSITIONS["completed"] == set()


@pytest.mark.asyncio
async def test_shared_objectives_are_intersection_of_both_learners_and_curriculum():
    subject = SimpleNamespace(id=2, name="Physics")
    topic = SimpleNamespace(
        id=4,
        name="Mechanics",
        learning_objectives=[_objective(1), _objective(2), _objective(3)],
    )
    concept = SimpleNamespace(id=7, name="Newton's Laws", explanation="Motion and force", key_points=[])

    a = _session(1, [1, 2])
    b = _session(2, [2, 3])
    context_a, context_b, shared = await load_challenge_context(
        challenger_id=1,
        opponent_id=2,
        subject=subject,
        topic=topic,
        concept=concept,
        session_a=a,
        session_b=b,
    )
    assert context_a.objective_ids == frozenset({1, 2})
    assert context_b.objective_ids == frozenset({2, 3})
    assert [objective.id for objective in shared] == [2]


@pytest.mark.asyncio
async def test_no_shared_objective_refuses_challenge_context():
    subject = SimpleNamespace(id=2, name="Physics")
    topic = SimpleNamespace(id=4, name="Mechanics", learning_objectives=[_objective(1)])
    concept = SimpleNamespace(id=7, name="Newton's Laws", explanation="Motion and force", key_points=[])

    with pytest.raises(ChallengePreparationError, match="enough shared learning content"):
        await load_challenge_context(
            challenger_id=1,
            opponent_id=2,
            subject=subject,
            topic=topic,
            concept=concept,
            session_a=_session(1, [1]),
            session_b=_session(2, [2]),
        )


def test_generated_questions_pass_strict_deterministic_validation():
    blueprint = _blueprint()
    questions = [
        _question(1, ChallengeDifficulty.EASY),
        _question(2),
        _question(3),
        _question(4),
        _question(5, ChallengeDifficulty.HARD),
    ]
    assert validate_questions_deterministically(GeneratedQuestionSet(questions=questions), blueprint) == []


def test_generated_questions_reject_wrong_objective_and_duplicate_text():
    blueprint = _blueprint()
    first = _question(1, ChallengeDifficulty.EASY)
    second = _question(2)
    second.objectiveId = 99
    second.question = first.question
    third = _question(3)
    fourth = _question(4)
    fifth = _question(5, ChallengeDifficulty.HARD)
    errors = validate_questions_deterministically(
        GeneratedQuestionSet(questions=[first, second, third, fourth, fifth]),
        blueprint,
    )
    assert any("unapproved objective" in error for error in errors)
    assert any("Duplicate question text" in error for error in errors)


def test_answer_schema_accepts_only_a_to_d():
    assert ChallengeAnswerRequest(answer=" c ").answer == "C"
    with pytest.raises(ValidationError):
        ChallengeAnswerRequest(answer="E")


def test_question_payload_hides_answer_before_reveal():
    question = SimpleNamespace(
        id=99,
        question_number=1,
        objective_id=2,
        question="Question",
        options={"A": "One", "B": "Two", "C": "Three", "D": "Four"},
        difficulty="medium",
        correct_answer="B",
        explanation="Because B is correct.",
    )
    answer = SimpleNamespace(
        user_id=1,
        answer="B",
        is_correct=True,
        timed_out=False,
        response_time_ms=1200,
    )

    hidden = build_current_question_payload(question, answer)
    assert hidden["hasSubmitted"] is True
    assert "correctAnswer" not in hidden
    assert "isCorrect" not in hidden
    assert "explanation" not in hidden

    revealed = build_current_question_payload(question, answer, reveal=True, reveal_answers=[answer])
    assert revealed["correctAnswer"] == "B"
    assert revealed["isCorrect"] is True
    assert revealed["revealAnswers"][0]["answer"] == "B"


def test_result_snapshot_scores_correct_answers_and_finds_weak_objectives():
    questions = [
        SimpleNamespace(id=1, question_number=1, objective_id=2, correct_answer="A", explanation="A"),
        SimpleNamespace(id=2, question_number=2, objective_id=2, correct_answer="B", explanation="B"),
        SimpleNamespace(id=3, question_number=3, objective_id=3, correct_answer="C", explanation="C"),
    ]
    answers = [
        SimpleNamespace(user_id=1, question_id=1, answer="A", is_correct=True, timed_out=False, response_time_ms=1000),
        SimpleNamespace(user_id=1, question_id=2, answer="A", is_correct=False, timed_out=False, response_time_ms=1200),
        SimpleNamespace(user_id=1, question_id=3, answer=None, is_correct=False, timed_out=True, response_time_ms=30000),
    ]
    answer_map = {(a.user_id, a.question_id): a for a in answers}
    objective_map = {2: SimpleNamespace(id=2, title="Apply"), 3: SimpleNamespace(id=3, title="Reason")}

    result = build_player_result_snapshot(
        user_id=1,
        revealed_questions=questions,
        answer_map=answer_map,
        objective_map=objective_map,
        incomplete=False,
    )
    assert result["score"] == 1
    assert result["accuracy"] == 33
    assert result["questionsAnswered"] == 2
    assert [item["objectiveId"] for item in result["weakAreas"]] == [2, 3]


def test_challenge_answer_db_model_has_single_submission_constraint_and_timeout_null_answer():
    constraints = {c.name for c in ChallengeAnswer.__table__.constraints if c.name}
    assert "uq_challenge_answer_participant_question" in constraints
    option_checks = [c.sqltext.text for c in ChallengeAnswer.__table__.constraints if getattr(c, "name", "") == "ck_challenge_answer_option"]
    assert option_checks and "IS NULL" in option_checks[0]
    assert ChallengeAnswer.__table__.c.answer.nullable is True


def test_question_answer_has_composite_foreign_key_to_its_challenge_question():
    fks = list(ChallengeAnswer.__table__.foreign_key_constraints)
    assert any(
        {element.parent.name for element in fk.elements} == {"challenge_id", "question_id"}
        for fk in fks
    )
