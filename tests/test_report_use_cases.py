"""Unit tests for use_case rendering in src/report.py.

Tests the new _use_case_lines helper and use case/skip-note rendering in render_report.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src"))

from report import _use_case_lines, render_report


def test_use_case_lines_two_use_cases_rendered_in_order():
    """Verify two use cases are rendered in order with exact expected string format."""
    item = {
        "verdict": "fit",
        "repo": "test/repo",
        "stars": 100,
        "reason": "test",
        "judgment": "test judgment",
        "use_cases": [
            {
                "title": "Use Case One",
                "kind": "Data Processing",
                "effort": "low",
                "focus": "speed",
                "pitch": "Fast data processing pipeline",
                "first_step": "Install the library",
            },
            {
                "title": "Use Case Two",
                "kind": "Automation",
                "effort": "high",
                "focus": "reliability",
                "pitch": "Enterprise automation framework",
                "first_step": "Read the docs",
            },
        ],
    }

    lines = _use_case_lines(item)
    assert len(lines) == 2
    assert (
        lines[0]
        == "  - ✦ **Use Case One** · Data Processing · low · speed: Fast data processing pipeline First step: Install the library"
    )
    assert (
        lines[1]
        == "  - ✦ **Use Case Two** · Automation · high · reliability: Enterprise automation framework First step: Read the docs"
    )


def test_use_case_lines_max_two_use_cases():
    """Verify only first two use cases are rendered even if more are present."""
    item = {
        "verdict": "fit",
        "repo": "test/repo",
        "stars": 100,
        "reason": "test",
        "judgment": "test judgment",
        "use_cases": [
            {
                "title": "First",
                "kind": "K1",
                "effort": "e1",
                "focus": "f1",
                "pitch": "p1",
                "first_step": "s1",
            },
            {
                "title": "Second",
                "kind": "K2",
                "effort": "e2",
                "focus": "f2",
                "pitch": "p2",
                "first_step": "s2",
            },
            {
                "title": "Third",
                "kind": "K3",
                "effort": "e3",
                "focus": "f3",
                "pitch": "p3",
                "first_step": "s3",
            },
        ],
    }

    lines = _use_case_lines(item)
    assert len(lines) == 2


def test_use_case_lines_skipped_reason_no_use_cases():
    """Verify skipped_reason line is rendered when use_cases is empty but skipped_reason exists."""
    item = {
        "verdict": "maybe",
        "repo": "test/repo",
        "stars": 100,
        "reason": "test",
        "judgment": "test judgment",
        "use_cases": [],
        "skipped_reason": "No clear integration points identified",
    }

    lines = _use_case_lines(item)
    assert len(lines) == 1
    assert lines[0] == "  - ✦ No strong use case: No clear integration points identified"


def test_use_case_lines_no_keys():
    """Verify item with neither use_cases nor skipped_reason renders no ✦ line."""
    item = {
        "verdict": "fit",
        "repo": "test/repo",
        "stars": 100,
        "reason": "test",
        "judgment": "test judgment",
    }

    lines = _use_case_lines(item)
    assert len(lines) == 0


def test_use_case_lines_pitch_with_newlines_collapsed():
    """Verify newlines in pitch are collapsed to single spaces."""
    item = {
        "verdict": "fit",
        "repo": "test/repo",
        "stars": 100,
        "reason": "test",
        "judgment": "test judgment",
        "use_cases": [
            {
                "title": "Test Case",
                "kind": "Kind",
                "effort": "low",
                "focus": "focus",
                "pitch": "Line one\nLine two\n  Line three  ",
                "first_step": "Step",
            },
        ],
    }

    lines = _use_case_lines(item)
    assert len(lines) == 1
    # Whitespace should be collapsed
    assert "Line one Line two Line three" in lines[0]
    assert "\n" not in lines[0]


def test_render_report_fit_section_with_use_cases():
    """Verify render_report includes use case lines in 🟢 Fit section."""
    evaluated = [
        {
            "verdict": "fit",
            "repo": "test/repo",
            "stars": 100,
            "reason": "test reason",
            "judgment": "test judgment",
            "use_cases": [
                {
                    "title": "Use Case",
                    "kind": "Type",
                    "effort": "low",
                    "focus": "focus",
                    "pitch": "pitch text",
                    "first_step": "step",
                },
            ],
        },
    ]

    report = render_report("2026-10-01", evaluated, 0)

    # Check repo line is present
    assert "- **[test/repo](https://github.com/test/repo)**" in report
    # Check use case line is present
    assert "  - ✦ **Use Case**" in report


def test_render_report_maybe_section_with_skipped_reason():
    """Verify render_report includes skipped_reason lines in 🟡 Maybe section."""
    evaluated = [
        {
            "verdict": "maybe",
            "repo": "test/repo",
            "stars": 100,
            "reason": "test reason",
            "judgment": "test judgment",
            "use_cases": [],
            "skipped_reason": "Not compatible",
        },
    ]

    report = render_report("2026-10-01", evaluated, 0)

    # Check repo line is present
    assert "- **[test/repo](https://github.com/test/repo)**" in report
    # Check skipped reason line is present
    assert "  - ✦ No strong use case: Not compatible" in report


def test_render_report_not_fit_section_no_use_cases():
    """Verify render_report does NOT include use case lines in 🔴 Not Fit section."""
    evaluated = [
        {
            "verdict": "not-fit",
            "repo": "test/repo",
            "stars": 100,
            "reason": "test reason",
            "judgment": "test judgment",
            "use_cases": [
                {
                    "title": "Use Case",
                    "kind": "Type",
                    "effort": "low",
                    "focus": "focus",
                    "pitch": "pitch",
                    "first_step": "step",
                },
            ],
        },
    ]

    report = render_report("2026-10-01", evaluated, 0)

    # Check repo line is present
    assert "- **[test/repo](https://github.com/test/repo)**" in report
    # Use case line should NOT be present
    assert "  - ✦" not in report


def test_render_report_repo_lines_byte_identical():
    """Verify repo lines themselves are byte-identical to original format."""
    evaluated = [
        {
            "verdict": "fit",
            "repo": "owner/name",
            "stars": 42000,
            "reason": "trending",
            "judgment": "excellent match",
        },
    ]

    report = render_report("2026-10-01", evaluated, 5)

    # The repo line should be in original format exactly
    assert "- **[owner/name](https://github.com/owner/name)** (42000 stars) [trending]: excellent match" in report
