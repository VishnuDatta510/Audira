"""Data model for coding problems.

Problems use stdin/stdout I/O so every language is judged the same way: the
program reads the test input and prints the answer. Starter code already does
the parsing, so candidates only implement the marked function.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TestCase:
    input: str
    expected: str
    hidden: bool = False
    explanation: str | None = None


@dataclass(frozen=True)
class Problem:
    slug: str
    title: str
    difficulty: str
    tags: tuple[str, ...]
    description: str
    input_format: str
    output_format: str
    constraints: tuple[str, ...]
    hints: tuple[str, ...]
    expected_time: str
    expected_space: str
    tests: tuple[TestCase, ...]
    starters: dict[str, str] = field(default_factory=dict)
    time_limit_ms: int = 2000

    @property
    def visible_tests(self) -> list[TestCase]:
        return [t for t in self.tests if not t.hidden]
