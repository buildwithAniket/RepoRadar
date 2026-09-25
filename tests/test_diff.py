from datetime import date, timedelta

from src.diff_engine import classify_repo
from src.logger import log
from src.state import prune_state


def test_classify_new() -> None:
    log.info("test: classify new repo")
    assert classify_repo("owner/repo", 100, None, None, "2026-01-01") == "new"


def test_classify_star_jump() -> None:
    log.info("test: classify star jump")
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": None,
        "verdict": "fit",
        "profile_checked_against": "2026-01-01",
    }
    # 200 stars >= 100 * 2 (star jump trigger)
    assert classify_repo("owner/repo", 200, None, prior, "2026-01-01") == "resurfaced"


def test_classify_profile_changed() -> None:
    log.info("test: classify profile changed")
    prior = {
        "stars_at_check": 100,
        "latest_release_at_check": None,
        "verdict": "not-fit",
        "profile_checked_against": "2026-01-01",
    }
    # Profile mtime is newer than profile_checked_against
    assert classify_repo("owner/repo", 100, None, prior, "2026-06-01") == "profile-changed"


def test_state_pruning_age() -> None:
    log.info("test: state pruning by age")
    today = date.today()
    old = today - timedelta(days=120)
    state = {
        "old/repo": {"last_checked": old.isoformat(), "verdict": "fit"},
        "new/repo": {"last_checked": today.isoformat(), "verdict": "fit"},
    }
    pruned = prune_state(state, max_age_days=90)
    assert "old/repo" not in pruned
    assert "new/repo" in pruned
    assert len(pruned) == 1


def test_state_pruning_count_cap() -> None:
    log.info("test: state pruning count cap")
    today = date.today()
    state = {}
    for i in range(10):
        d = today - timedelta(days=i)
        state[f"repo/{i}"] = {"last_checked": d.isoformat(), "verdict": "fit"}

    pruned = prune_state(state, max_age_days=90, max_entries=5)
    assert len(pruned) == 5
    # Should keep the 5 newest
    keys = sorted(pruned.keys())
    assert keys == [f"repo/{i}" for i in range(5)]
