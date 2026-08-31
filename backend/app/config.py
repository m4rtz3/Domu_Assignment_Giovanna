"""App config, read from environment variables (.env locally, real env vars in Vercel)."""
import os

from dotenv import load_dotenv

load_dotenv()  # no-op in Vercel, where env vars are already injected

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

# Skip the real LLM call and return canned demo data instead. Useful without
# a working API key, or to avoid spending credits while developing the UI.
LLM_MOCK_MODE = os.environ.get("LLM_MOCK_MODE", "false").lower() in ("1", "true", "yes")

LLM_TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT_SECONDS", "20"))
LLM_MAX_RETRIES = int(os.environ.get("LLM_MAX_RETRIES", "1"))

# "*" for local dev; should be locked to the real frontend domain in production.
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Local-only speech-to-text (see routers/transcribe.py). "tiny" is faster, "base" is more accurate.
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "base")
