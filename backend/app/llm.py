"""
Wrapper around the Anthropic client so every router gets the same timeout,
retry and error handling instead of reimplementing it each time.
"""
import logging
import time

from anthropic import Anthropic, APIError, APITimeoutError

from app.config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, LLM_MAX_RETRIES, LLM_TIMEOUT_SECONDS

logger = logging.getLogger("domu.llm")

_client: Anthropic | None = None


class LLMUnavailableError(Exception):
    """Raised when the LLM call fails after retries. Routers catch this and
    return a fallback response instead of letting it bubble up as a 500."""


def get_client() -> Anthropic:
    global _client
    if _client is None:
        if not ANTHROPIC_API_KEY:
            raise LLMUnavailableError(
                "ANTHROPIC_API_KEY is not set. Copy backend/.env.example to "
                "backend/.env and add your key (see README.md)."
            )
        _client = Anthropic(api_key=ANTHROPIC_API_KEY, timeout=LLM_TIMEOUT_SECONDS)
    return _client


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1200) -> str:
    """
    Calls the LLM with a timeout and a single retry on timeout only.
    Non-timeout API errors (bad request, auth, rate limit) are not retried
    since retrying won't fix them -- they fail fast instead.
    """
    client = get_client()
    last_error: Exception | None = None

    for attempt in range(LLM_MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return response.content[0].text
        except APITimeoutError as e:
            last_error = e
            logger.warning(
                "LLM call timed out (attempt %d/%d)", attempt + 1, LLM_MAX_RETRIES + 1
            )
            time.sleep(0.5 * (attempt + 1))  # small backoff before retry
        except APIError as e:
            last_error = e
            logger.error("LLM API error (not retrying): %s", e)
            break

    raise LLMUnavailableError(f"LLM call failed after retries: {last_error}")
