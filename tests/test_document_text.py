from app.services.document_text import normalize_document_text

SCATTERED = """\
About  SpotDraft.
SpotDraft

is

on

a

mission.

We're  looking  for  a  Software  Development  Engineer-  Intern  to  join  our  engineering
team

and

build.

Top  Outcomes:
Software  Development  &  Product  Engineering
●  Build  features  under  the
guidance
of
engineers.
●  Write  clean  code.
●  Take  ownership  of  assigned  projects  and  deliverables.   Requirements:
●  Know  Python,  Java,
or
Go.
Why  SpotDraft?
●  Brilliant  teammates-  Work  with  sharp  minds.
Our  Core  Values
●  Be  1%  better  every  day
All

candidates'

personal

data

is

private.
"""


def test_plain_text_stays_plain():
    text = "Build Python API services and collaborate with a team."
    assert normalize_document_text(text) == text


def test_blank_line_paragraphs_stay_separate():
    text = "Build APIs.\n\nWrite tests."
    assert normalize_document_text(text) == text


def test_scattered_pdf_becomes_sections():
    cleaned = normalize_document_text(SCATTERED)
    assert "## About SpotDraft" in cleaned
    assert "SpotDraft is on a mission." in cleaned
    assert "Software Development Engineer-Intern to join" in cleaned
    assert "## Top Outcomes" in cleaned
    assert "### Software Development & Product Engineering" in cleaned
    assert "- Build features under the guidance of engineers." in cleaned
    assert "- Write clean code." in cleaned
    assert "## Requirements" in cleaned
    assert "- Know Python, Java, or Go." in cleaned
    assert "## Why SpotDraft?" in cleaned
    assert "- Brilliant teammates — Work with sharp minds." in cleaned
    assert "## Our Core Values" in cleaned
    assert "- Be 1% better every day" in cleaned
    assert "All candidates' personal data is private." in cleaned
    assert "every day All" not in cleaned
    assert normalize_document_text(cleaned) == cleaned


def test_ligatures_become_letters():
    assert normalize_document_text("Pro\ufb01ciency in one language.") == "Proficiency in one language."
