"""Regression tests for the continuous AI Learning Room lifecycle."""

import pytest
from fastapi import HTTPException

from app.models.ai_learning import AILearningSession
from app.services.ai_learning_service import (
    _begin_adaptive_reteach,
    _finish_adaptive_reteach,
    _is_uncertainty_response,
    _set_status,
    _filter_protected_messages,
    _VALID_TRANSITIONS,
    _derive_learning_state,
    _split_ai_response,
)


def _session(status: str) -> AILearningSession:
    return AILearningSession(
        user_id=1,
        subject_id=1,
        topic_id=1,
        concept_id=1,
        status=status,
    )


def test_practice_returns_to_normal_conversation_after_reteach():
    session = _session("practice")
    _begin_adaptive_reteach(session)
    assert session.status == "reteaching"
    _finish_adaptive_reteach(session)
    assert session.status == "teaching"


def test_reteaching_never_transitions_to_reteaching():
    assert "reteaching" not in _VALID_TRANSITIONS["reteaching"]
    assert "teaching" in _VALID_TRANSITIONS["reteaching"]


def test_practice_can_return_to_teaching_without_new_session():
    session = _session("practice")
    _set_status(session, "teaching")
    assert session.status == "teaching"


def test_finish_reteach_requires_reteaching_state():
    session = _session("retrieval")
    with pytest.raises(HTTPException) as exc:
        _finish_adaptive_reteach(session)
    assert exc.value.status_code == 409
    assert "Cannot finish reteaching" in str(exc.value.detail)


def test_uncertainty_answers_are_valid_weak_evidence():
    for answer in (
        "I don't know",
        "I don't know yet",
        "I am not sure",
        "I'm unsure",
        "not sure",
    ):
        assert _is_uncertainty_response(answer)

    assert not _is_uncertainty_response("Newton's second law is F=ma")


def test_protected_message_filter_keeps_conversation_and_locks_teaching():
    from app.models.ai_learning import AISessionMessage

    messages = [
        AISessionMessage(id=1, session_id=1, role="ai", message_type="teaching", content="hidden explanation", sequence=1),
        AISessionMessage(id=2, session_id=1, role="student", message_type="question", content="What?", sequence=2),
        AISessionMessage(id=3, session_id=1, role="ai", message_type="reteach", content="hidden reteach", sequence=3),
        AISessionMessage(id=4, session_id=1, role="ai", message_type="feedback", content="Good answer", sequence=4),
    ]

    visible = _filter_protected_messages(messages)
    assert [m["messageType"] for m in visible] == ["teaching", "question", "reteach", "feedback"]
    assert visible[0]["extra"]["locked"] is True
    assert visible[2]["extra"]["locked"] is True
    assert "hidden explanation" not in visible[0]["content"]
    assert "hidden reteach" not in visible[2]["content"]
    assert visible[1]["content"] == "What?"


def test_practice_transition_is_explicitly_supported():
    assert "practice" in _VALID_TRANSITIONS["retrieval"]
    assert "teaching" in _VALID_TRANSITIONS["practice"]


def test_learning_state_does_not_mark_task_complete_until_transition_confirmation():
    from app.models.ai_learning import AISessionMessage

    passed_quiz = AISessionMessage(
        id=1, session_id=1, role="ai", message_type="practice",
        content="Nice work. Are you ready for the next task?",
        sequence=1,
        extra={
            "practiceComplete": True,
            "taskCompleted": False,
            "taskIndex": 0,
            "currentTaskIndex": 0,
            "nextTaskIndex": 1,
            "taskTransition": True,
        },
    )
    state = _derive_learning_state([passed_quiz])
    assert state["completedTaskIndexes"] == []
    assert state["currentTaskIndex"] == 0
    assert state["waitingForTaskTransition"] is True
    assert state["nextTaskIndex"] == 1

    confirmation = AISessionMessage(
        id=2, session_id=1, role="ai", message_type="teaching",
        content="Great — let's move to the next part.",
        sequence=3,
        extra={
            "taskCompleted": True,
            "taskIndex": 0,
            "currentTaskIndex": 1,
            "transitionConfirmed": True,
        },
    )
    student = AISessionMessage(
        id=3, session_id=1, role="student", message_type="question",
        content="Yes, I'm ready.",
        sequence=2,
        extra={},
    )
    state = _derive_learning_state([passed_quiz, student, confirmation])
    assert state["completedTaskIndexes"] == [0]
    assert state["currentTaskIndex"] == 1
    assert state["waitingForTaskTransition"] is False


def test_long_tutor_response_is_split_into_at_most_three_chunks():
    text = " ".join(["This is a teaching sentence that explains the idea clearly."] * 80)
    chunks = _split_ai_response(text)
    assert 1 <= len(chunks) <= 3
    assert "".join(chunks).replace(" ", "") == text.replace(" ", "")


def test_short_tutor_response_stays_one_message():
    assert _split_ai_response("That makes sense.") == ["That makes sense."]
