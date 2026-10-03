"""Turn PDF and DOCX extraction back into paragraphs, headings, and lists.

pypdf often emits one word per line, with a blank line between words, when a
file was laid out as positioned text. Job descriptions pasted from those files
were showing up as a vertical stack of words.
"""
from __future__ import annotations

import re

_LIGATURES = {
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
}
_BULLETS = "●•▪◦‣∙"
_HEADING = re.compile(r"^[A-Z][^:\n]{0,70}:$")


def normalize_document_text(text: str) -> str:
    """Repair scattered extraction. Already-clean text is returned unchanged."""
    if not text or not text.strip():
        return ""
    prepared = _prepare(text)
    nonempty = [line for line in (_clean_line(line) for line in prepared.splitlines()) if line]
    blocks = _from_scattered(nonempty) if _is_scattered(nonempty) else _from_plain(prepared)
    return _render(_promote_late_subsections(blocks))


def _prepare(text: str) -> str:
    for src, dst in _LIGATURES.items():
        text = text.replace(src, dst)
    text = (
        text.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u00a0", " ")
    )
    text = re.sub(rf"[ \t]*[{_BULLETS}][ \t]*", "\n- ", text)
    text = re.sub(r"_{5,}", "\n", text)
    return text


def _clean_line(line: str) -> str:
    return re.sub(r"[ \t]{2,}", " ", line).strip()


def _is_scattered(lines: list[str]) -> bool:
    if len(lines) < 12:
        return False
    short = sum(1 for line in lines if len(line.split()) <= 2 and len(line) <= 24 and not line.startswith("- "))
    return short / len(lines) >= 0.45


def _is_heading(line: str) -> bool:
    if line.startswith("- ") or line.startswith("#"):
        return False
    words = line.split()
    if not words or len(words) > 8 or len(line) > 80:
        return False
    if line.endswith(":"):
        return True
    if line.endswith("?") and all(_titled(word) for word in words):
        return True
    if line.endswith(".") and line.lower().startswith("about ") and len(words) <= 6:
        return True
    if line[-1] in ".,!;":
        return False
    return len(words) >= 2 and all(_titled(word) for word in words)


def _titled(word: str) -> bool:
    if word in {"&", "/", "+"}:
        return True
    parts = re.split(r"[-/]", word)
    return all(not part or part[:1].isupper() for part in parts)


def _heading_level(line: str) -> int:
    if line.endswith(":") or line.endswith("?") or line.lower().startswith("about "):
        return 2
    return 3


def _clean_heading(line: str) -> str:
    title = line.strip().rstrip(":").strip()
    if title.endswith(".") and title.lower().startswith("about "):
        title = title[:-1].strip()
    return title


def _explode(line: str) -> list[str]:
    """Split a heading that the extractor glued to the end of a sentence."""
    match = re.match(r"^(.*[.!?])\s+([A-Z][^:]{0,70}:)$", line)
    if not match or not _HEADING.match(match.group(2).strip()):
        return [line]
    return [match.group(1).strip(), match.group(2).strip()]


_SENTENCE_START = {"All", "The", "This", "These", "We", "Our", "You", "Candidates", "Please"}


def _continues(previous: str, line: str, kind: str) -> bool:
    if not previous:
        return False
    words = line.split()
    # A finished bullet often has no period. The next paragraph then starts
    # with a capital word on its own line ("All candidates' personal data...").
    if kind == "bullet" and len(words) == 1 and words[0].strip("'*") in _SENTENCE_START and not previous.rstrip().endswith(","):
        return False
    if not previous.rstrip().endswith((".", "!", "?")):
        return True
    return len(words) == 1


def _from_scattered(lines: list[str]) -> list[tuple[str, str]]:
    exploded: list[str] = []
    for line in lines:
        exploded.extend(_explode(line))
    blocks: list[tuple[str, str]] = []
    kind = ""
    buf: list[str] = []

    def flush() -> None:
        nonlocal kind
        if buf:
            blocks.append((kind or "paragraph", " ".join(buf)))
            buf.clear()
        kind = ""

    for line in exploded:
        if line.startswith("- "):
            flush()
            kind = "bullet"
            buf.append(line[2:].strip())
            continue
        if _is_heading(line):
            flush()
            blocks.append((f"h{_heading_level(line)}", _clean_heading(line)))
            continue
        if kind in {"paragraph", "bullet"} and _continues(" ".join(buf), line, kind):
            buf.append(line)
            continue
        flush()
        kind = "paragraph"
        buf.append(line)
    flush()
    return blocks


def _from_plain(prepared: str) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    for chunk in re.split(r"\n\s*\n", prepared.strip()):
        lines: list[str] = []
        for raw in chunk.splitlines():
            line = _clean_line(raw)
            if line:
                lines.extend(_explode(line))
        blocks.extend(_walk(lines))
    return blocks


def _walk(lines: list[str]) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            blocks.append(("paragraph", " ".join(buf)))
            buf.clear()

    for line in lines:
        if line.startswith("## "):
            flush()
            blocks.append(("h2", line[3:].strip()))
        elif line.startswith("### "):
            flush()
            blocks.append(("h3", line[4:].strip()))
        elif line.startswith("- "):
            flush()
            blocks.append(("bullet", line[2:].strip()))
        elif _is_heading(line):
            flush()
            blocks.append((f"h{_heading_level(line)}", _clean_heading(line)))
        else:
            buf.append(line)
    flush()
    return blocks


def _polish(text: str) -> str:
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    text = re.sub(r"\b([A-Z][A-Za-z]+)-\s+([A-Z][a-z]+)(?=\s+[a-z])", r"\1-\2", text)
    text = re.sub(r"([a-z])-\s+([A-Z])", r"\1 — \2", text)
    return re.sub(r"\s+", " ", text).strip()


def _promote_late_subsections(blocks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """A heading after a section's own bullets is the next section, not a subsection."""
    promoted: list[tuple[str, str]] = []
    section_has_bullets = False
    under_subsection = False
    for kind, body in blocks:
        if kind == "h2":
            section_has_bullets = False
            under_subsection = False
        elif kind == "h3" and section_has_bullets and not under_subsection:
            kind = "h2"
            section_has_bullets = False
            under_subsection = False
        elif kind == "h3":
            under_subsection = True
        elif kind == "bullet" and not under_subsection:
            section_has_bullets = True
        promoted.append((kind, body))
    return promoted


def _render(blocks: list[tuple[str, str]]) -> str:
    polished: list[tuple[str, str]] = []
    for kind, body in blocks:
        body = body.strip() if kind in {"h2", "h3"} else _polish(body)
        if body:
            polished.append((kind, body))
    lines: list[str] = []
    for index, (kind, body) in enumerate(polished):
        if kind == "h2":
            line = f"## {body}"
        elif kind == "h3":
            line = f"### {body}"
        elif kind == "bullet":
            line = f"- {body}"
        else:
            line = body
        previous = polished[index - 1][0] if index else ""
        if lines and not (kind == "bullet" and previous == "bullet"):
            lines.append("")
        lines.append(line)
    return "\n".join(lines).strip()
