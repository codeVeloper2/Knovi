"""Regression tests for the AI Learning Room adaptive reteach lifecycle."""

import pytest
from fastapi import HTTPException

from app.models.ai_learning import AILearningSession
from app.services.ai_learning_service import (
    _begin_adaptive_reteach,
    _finish_adaptive_reteach,
    _is_uncertainty_response,
    _set_status,
    _VALID_TRANSITIONS,
)


def _session(status: str) -> AILearningSession:
    return AILearningSession(
        user_id=1,
        subject_id=1,
        topic_id=1,
        concept_id=1,
        status=status,
    )


def test_repeated_weak_retrievals_never_transition_reteaching_to_reteaching():
    """A weak answer can repeat retrieval -> reteach -> retrieval indefinitely."""
    session = _session("retrieval")

    # First weak answer: retrieval -> reteaching.
    _set_status(session, "reteaching")
    assert session.status == "reteaching"

    # Persist the first adaptive reteach, then unlock another retrieval check.
    _begin_adaptive_reteach(session)
    _finish_adaptive_reteach(session)
    assert session.status == "retrieval"

    # Second weak answer: retrieval -> reteaching again.
    _set_status(session, "reteaching")
    assert session.status == "reteaching"

    # The second reteach starts while already in reteaching. It must not try
    # reteaching -> reteaching; it simply persists a new strategy and returns
    # the session to retrieval.
    _begin_adaptive_reteach(session)
    assert session.status == "reteaching"
    _finish_adaptive_reteach(session)
    assert session.status == "retrieval"


def test_reteaching_does_not_allow_generic_reteaching_to_reteaching_transition():
    assert "reteaching" not in _VALID_TRANSITIONS["reteaching"]


def test_begin_reteach_is_idempotent_for_existing_reteaching_state():
    session = _session("reteaching")
    _begin_adaptive_reteach(session)
    assert session.status == "reteaching"


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


def test_protected_message_filter_hides_teaching_and_reteach_content():
    from app.models.ai_learning import AISessionMessage
    from app.services.ai_learning_service import _filter_protected_messages

    messages = [
        AISessionMessage(id=1, session_id=1, role="ai", message_type="teaching", content="hidden explanation", sequence=1),
        AISessionMessage(id=2, session_id=1, role="student", message_type="question", content="What?", sequence=2),
        AISessionMessage(id=3, session_id=1, role="ai", message_type="reteach", content="hidden reteach", sequence=3),
        AISessionMessage(id=4, session_id=1, role="ai", message_type="agent", content="Quick check ready", sequence=4),
    ]

    visible = _filter_protected_messages(messages)
    assert [m["messageType"] for m in visible] == ["question", "agent"]
    assert all("hidden" not in m["content"] for m in visible)
