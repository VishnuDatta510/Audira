from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    huggingface_api_key: str | None = Field(default=None, validation_alias=AliasChoices("HUGGINGFACE_API_KEY", "HF_TOKEN"))
    hf_chat_model: str = "Qwen/Qwen2.5-72B-Instruct"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    agent_providers: str = "huggingface,gemini,groq"
    agent_timeout_seconds: float = 90.0
    mongodb_uri: str | None = None
    mongodb_database: str = "bnb_interview"
    proctor_warning_limit: int = 5
    proctor_face_absence_seconds: int = 10
    proctor_mouth_review_seconds: float = 1.5
    proctor_min_brightness: int = 55
    proctor_max_brightness: int = 235
    cartesia_api_key: str = ""
    code_runner: Literal["judge0", "local"] = "judge0"
    judge0_url: str = "https://ce.judge0.com"
    judge0_api_key: str | None = None
    code_run_timeout_seconds: float = 3.0
    code_compile_timeout_seconds: float = 60.0
    code_max_output_chars: int = 64_000
    code_parallel_tests: int = 4
    frontend_url: str = "http://localhost:3000"
    # Comma-separated extra browser origins, such as a Vercel preview URL.
    cors_origins: str = ""
    # Optional. Example: https://.*\.vercel\.app
    cors_origin_regex: str = ""
    admin_access_code: str = ""


settings = Settings()


def browser_origins() -> list[str]:
    found = {
        settings.frontend_url.strip().rstrip("/"),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
    for piece in settings.cors_origins.split(","):
        cleaned = piece.strip().rstrip("/")
        if cleaned:
            found.add(cleaned)
    return sorted(origin for origin in found if origin)
