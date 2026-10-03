from io import BytesIO

from docx import Document
from pypdf import PdfReader

from app.services.document_text import normalize_document_text


def extract_text_from_bytes(name: str, raw: bytes) -> str:
    """Extract UTF-8, PDF, or DOCX text from uploaded file bytes."""
    lowered = name.lower()
    if lowered.endswith(".pdf"):
        text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(raw)).pages)
    elif lowered.endswith(".docx"):
        text = "\n".join(p.text for p in Document(BytesIO(raw)).paragraphs)
    else:
        text = raw.decode("utf-8", errors="ignore")
    return normalize_document_text(text)


def extract_text(uploaded_file) -> str:
    """Extract text from a Streamlit upload."""
    return extract_text_from_bytes(uploaded_file.name, uploaded_file.getvalue())
