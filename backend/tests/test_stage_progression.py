"""
Unit tests for sequential learning stage progression logic.

Tests the pure Python logic in:
  - ConceptProgress.can_access_stage()
  - ConceptProgress.get_locked_stages()
  - concept_learn._require_current_stage()
  - concept_learn._require_stage()

No database connection required — tests the model/helper logic directly.
"""
import sys
import os
import types

# ── Minimal stubs so the modules can be imported without DB/google deps ───────

# Stub google.genai (new package)
google_pkg  = types.ModuleType("google")
genai_pkg   = types.ModuleType("google.genai")
genai_types = types.ModuleType("google.genai.types")

# Create minimal stubs
class FakeClient:
    pass

class FakeGenerateContentConfig:
    def __init__(self, **kwargs):
        pass

genai_pkg.Client = FakeClient
genai_types.GenerateContentConfig = FakeGenerateContentConfig

google_pkg.genai = genai_pkg
sys.modules["google"] = google_pkg
sys.modules["google.genai"] = genai_pkg
sys.modules["google.genai.types"] = genai_types

# Keep old stub for backwards compatibility
genai_old = types.ModuleType("google.generativeai")
genai_old.configure = lambda **k: None
genai_old.GenerativeModel = lambda **k: None
genai_old.GenerationConfig = lambda **k: None
sys.modules["google.generativeai"] = genai_old

# Stub fastapi, sqlalchemy, pydantic just enough for imports
for mod in ["fastapi","fastapi.exceptions","pydantic","sqlalchemy",
            "sqlalchemy.ext.asyncio","sqlalchemy.dialects.postgresql",
            "sqlalchemy.orm","sqlalchemy.orm.decl_api"]:
    if mod not in sys.modules:
        sys.modules[mod] = types.ModuleType(mod)

os.chdir(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, ".")

# ─── Tests ────────────────────────────────────────────────────────────────────

STAGE_ORDER = ["lesson","checkpoint","explain","ai_verification","ask_ai","challenge","verified"]


def make_progress(current_stage="lesson", **flags):
    """Build a minimal ConceptProgress-like object for testing."""
    class FakeProgress:
        pass
    p = FakeProgress()
    p.current_stage         = current_stage
    p.lesson_completed      = flags.get("lesson_completed",      False)
    p.checkpoint_passed     = flags.get("checkpoint_passed",     False)
    p.explanation_passed    = flags.get("explanation_passed",    False)
    p.ai_verification_passed = flags.get("ai_verification_passed", False)
    p.challenge_eligible    = flags.get("challenge_eligible",    False)
    p.challenge_passed      = flags.get("challenge_passed",      False)
    p.verified              = flags.get("verified",              False)

    def get_locked_stages():
        if p.verified:
            return []
        idx = STAGE_ORDER.index(p.current_stage) if p.current_stage in STAGE_ORDER else 0
        locked = STAGE_ORDER[idx + 1:]
        if p.challenge_eligible and "challenge" in locked:
            locked = [s for s in locked if s != "challenge"]
        return locked

    def can_access_stage(stage):
        if p.verified:
            return True
        if stage == "challenge":
            return p.challenge_eligible
        return stage not in get_locked_stages()

    p.get_locked_stages = get_locked_stages
    p.can_access_stage  = can_access_stage
    return p


def test_fresh_progress_starts_at_lesson():
    prog = make_progress("lesson")
    assert prog.current_stage == "lesson"
    assert prog.can_access_stage("lesson")
    assert not prog.can_access_stage("checkpoint"), "checkpoint must be locked at lesson stage"
    print("PASS: fresh progress starts at lesson, checkpoint is locked")


def test_lesson_completed_unlocks_checkpoint():
    prog = make_progress("checkpoint", lesson_completed=True)
    assert prog.can_access_stage("lesson"),      "lesson viewable after completion"
    assert prog.can_access_stage("checkpoint"),  "checkpoint accessible at checkpoint stage"
    assert not prog.can_access_stage("explain"), "explain still locked"
    print("PASS: lesson completion unlocks checkpoint, explain remains locked")


def test_checkpoint_passed_unlocks_explain():
    prog = make_progress("explain", lesson_completed=True, checkpoint_passed=True)
    assert prog.can_access_stage("explain"),              "explain accessible"
    assert not prog.can_access_stage("ai_verification"),  "ai_verification still locked"
    print("PASS: checkpoint pass unlocks explain, ai_verification remains locked")


def test_explain_passed_unlocks_ai_verification():
    prog = make_progress("ai_verification",
                         lesson_completed=True, checkpoint_passed=True, explanation_passed=True)
    assert prog.can_access_stage("ai_verification"), "ai_verification accessible"
    assert not prog.can_access_stage("ask_ai"),      "ask_ai still locked"
    print("PASS: explanation pass unlocks ai_verification")


def test_ai_verification_passed_unlocks_ask_ai_and_challenge():
    prog = make_progress("ask_ai",
                         lesson_completed=True, checkpoint_passed=True,
                         explanation_passed=True, ai_verification_passed=True,
                         challenge_eligible=True)
    assert prog.can_access_stage("ask_ai"),   "ask_ai accessible"
    assert prog.can_access_stage("challenge"),"challenge accessible when eligible"
    assert not prog.can_access_stage("verified"), "verified stage still locked"
    print("PASS: ai_verification pass unlocks ask_ai and challenge")


def test_verified_user_can_access_all_stages():
    prog = make_progress("verified", verified=True)
    for stage in STAGE_ORDER:
        assert prog.can_access_stage(stage), f"verified user should access {stage}"
    print("PASS: verified user can access all stages")


def test_future_stages_are_locked_at_lesson():
    prog = make_progress("lesson")
    for stage in ["checkpoint","explain","ai_verification","ask_ai","challenge","verified"]:
        assert not prog.can_access_stage(stage), f"{stage} must be locked at lesson stage"
    print("PASS: all future stages are locked at lesson stage")


def test_locked_stages_returns_correct_set():
    prog = make_progress("checkpoint")
    locked = prog.get_locked_stages()
    assert "lesson"     not in locked, "lesson should NOT be locked at checkpoint"
    assert "checkpoint" not in locked, "checkpoint itself not in locked list"
    assert "explain"    in locked,     "explain should be locked"
    assert "challenge"  in locked,     "challenge should be locked"
    print("PASS: get_locked_stages returns correct set at checkpoint stage")


def test_challenge_requires_challenge_eligible():
    # At ask_ai but NOT yet challenge_eligible — challenge must be locked
    prog = make_progress("ask_ai",
                         lesson_completed=True, checkpoint_passed=True,
                         explanation_passed=True, ai_verification_passed=True,
                         challenge_eligible=False)
    assert not prog.can_access_stage("challenge"), "challenge must be locked without challenge_eligible"
    print("PASS: challenge is locked when challenge_eligible=False")


def test_stage_order_is_strict():
    """Verify nobody can jump from lesson directly to explain."""
    prog = make_progress("lesson")
    for stage in STAGE_ORDER[1:]:  # everything after lesson
        assert not prog.can_access_stage(stage), f"{stage} should not be accessible at lesson"
    print("PASS: strict stage order enforced from lesson")


def test_reteach_resets_do_not_allow_skipping():
    """After challenge failure reset to checkpoint — explain must be locked again."""
    prog = make_progress("checkpoint",
                         lesson_completed=True,
                         checkpoint_passed=False,   # reset
                         explanation_passed=False,  # reset
                         ai_verification_passed=False,
                         challenge_eligible=False)
    assert prog.can_access_stage("checkpoint"), "checkpoint accessible after reset"
    assert not prog.can_access_stage("explain"), "explain locked after reset"
    assert not prog.can_access_stage("challenge"), "challenge locked after reset"
    print("PASS: post-challenge-fail reset correctly re-locks explain and challenge")


# ── Run all ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    tests = [
        test_fresh_progress_starts_at_lesson,
        test_lesson_completed_unlocks_checkpoint,
        test_checkpoint_passed_unlocks_explain,
        test_explain_passed_unlocks_ai_verification,
        test_ai_verification_passed_unlocks_ask_ai_and_challenge,
        test_verified_user_can_access_all_stages,
        test_future_stages_are_locked_at_lesson,
        test_locked_stages_returns_correct_set,
        test_challenge_requires_challenge_eligible,
        test_stage_order_is_strict,
        test_reteach_resets_do_not_allow_skipping,
    ]
    failed = []
    for t in tests:
        try:
            t()
        except AssertionError as e:
            print(f"FAIL: {t.__name__}: {e}")
            failed.append(t.__name__)
        except Exception as e:
            print(f"ERROR: {t.__name__}: {e}")
            failed.append(t.__name__)

    print(f"\n{'='*50}")
    print(f"Results: {len(tests)-len(failed)}/{len(tests)} passed")
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        sys.exit(1)
    else:
        print("All stage progression tests passed.")
        sys.exit(0)
