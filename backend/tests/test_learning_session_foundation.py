"""Dependency-free regression tests for Phase 1 learning-session rules.

The repository did not have pytest installed or a database test harness.  These
tests intentionally exercise the pure authorization, state, numeric-grading,
and dependency-shadowing guards with the standard library's unittest runner.
Endpoint integration tests should be added once a disposable PostgreSQL test
database is configured.
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import unittest

from fastapi import HTTPException

from app.api.v1.learning_sessions import (
    _is_correct_answer,
    _require_learner,
    _require_state,
    _require_teacher,
)


class LearningSessionFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.session = SimpleNamespace(teacher_id=10, learner_id=20, workflow_state="LOBBY")

    def test_teacher_and_learner_actions_are_role_bound(self) -> None:
        _require_teacher(self.session, SimpleNamespace(id=10))
        _require_learner(self.session, SimpleNamespace(id=20))
        with self.assertRaises(HTTPException) as teacher_error:
            _require_teacher(self.session, SimpleNamespace(id=20))
        self.assertEqual(teacher_error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as learner_error:
            _require_learner(self.session, SimpleNamespace(id=10))
        self.assertEqual(learner_error.exception.status_code, 403)

    def test_transitions_are_state_bound(self) -> None:
        _require_state(self.session, "LOBBY")
        with self.assertRaises(HTTPException) as error:
            _require_state(self.session, "PRACTICE")
        self.assertEqual(error.exception.status_code, 409)

    def test_numeric_answers_normalize_value_and_ignore_units(self) -> None:
        question = SimpleNamespace(question_type="numeric", answer="4 m/s²")
        self.assertTrue(_is_correct_answer(question, "4"))
        self.assertTrue(_is_correct_answer(question, "4.00"))
        self.assertFalse(_is_correct_answer(question, "4.1"))

    def test_non_numeric_answers_remain_deterministic(self) -> None:
        question = SimpleNamespace(question_type="multiple_choice", answer="B")
        self.assertTrue(_is_correct_answer(question, " b "))
        self.assertFalse(_is_correct_answer(question, "A"))

    def test_ready_route_cannot_regress_to_dependency_shadowing(self) -> None:
        source = (Path(__file__).parents[1] / "app" / "api" / "v1" / "learning_sessions.py").read_text(encoding="utf-8")
        self.assertIn("from app.core.database import get_session as get_db_session", source)
        self.assertNotIn("async def get_session(", source)


if __name__ == "__main__":
    unittest.main()
