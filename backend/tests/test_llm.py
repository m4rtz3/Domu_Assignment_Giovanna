"""
Tests for the LLM wrapper: success, timeout+retry, and giving up after
retries are exhausted. Uses a fake Anthropic client instead of the real API
so tests don't depend on network access or cost money to run.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from anthropic import APIError, APITimeoutError

from app import llm


def _fake_response(text: str):
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


def _bare_exception(cls):
    """Build an instance of an Anthropic SDK exception without going through
    its real __init__ (which requires an httpx request object we don't have
    in a unit test) -- we only need it to satisfy `isinstance` checks."""
    return cls.__new__(cls)


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    # Don't actually wait during the retry backoff in tests.
    monkeypatch.setattr(llm.time, "sleep", lambda _seconds: None)


def test_call_llm_returns_text_on_success(monkeypatch):
    fake_client = MagicMock()
    fake_client.messages.create.return_value = _fake_response("hello from claude")
    monkeypatch.setattr(llm, "get_client", lambda: fake_client)

    result = llm.call_llm("system", "user")

    assert result == "hello from claude"
    assert fake_client.messages.create.call_count == 1


def test_call_llm_retries_once_on_timeout_then_succeeds(monkeypatch):
    fake_client = MagicMock()
    fake_client.messages.create.side_effect = [
        _bare_exception(APITimeoutError),
        _fake_response("worked on retry"),
    ]
    monkeypatch.setattr(llm, "get_client", lambda: fake_client)

    result = llm.call_llm("system", "user")

    assert result == "worked on retry"
    assert fake_client.messages.create.call_count == 2


def test_call_llm_raises_llm_unavailable_after_exhausting_retries(monkeypatch):
    fake_client = MagicMock()
    fake_client.messages.create.side_effect = _bare_exception(APITimeoutError)
    monkeypatch.setattr(llm, "get_client", lambda: fake_client)

    with pytest.raises(llm.LLMUnavailableError):
        llm.call_llm("system", "user")


def test_call_llm_does_not_retry_on_non_timeout_api_error(monkeypatch):
    fake_client = MagicMock()
    fake_client.messages.create.side_effect = _bare_exception(APIError)
    monkeypatch.setattr(llm, "get_client", lambda: fake_client)

    with pytest.raises(llm.LLMUnavailableError):
        llm.call_llm("system", "user")

    # A non-timeout error (e.g. bad request, auth) shouldn't be retried --
    # retrying it would just fail the same way again.
    assert fake_client.messages.create.call_count == 1
