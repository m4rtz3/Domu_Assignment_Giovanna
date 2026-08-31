"""Tests that the script-to-agent endpoint degrades gracefully instead of
crashing when the LLM is unavailable or returns something we can't parse."""
from app.llm import LLMUnavailableError
from app.routers import script_to_agent
from app.schemas import ScriptToAgentRequest


def test_falls_back_when_llm_unavailable(monkeypatch):
    def _raise(*args, **kwargs):
        raise LLMUnavailableError("no api key")

    monkeypatch.setattr(script_to_agent, "call_llm", _raise)
    monkeypatch.setattr(script_to_agent, "LLM_MOCK_MODE", False)

    result = script_to_agent.generate_agent(
        ScriptToAgentRequest(client_name="Test Client", raw_script="Hi, this is a test script.")
    )

    assert result.degraded is True
    assert len(result.call_flow) > 0  # still returns a usable template


def test_falls_back_when_llm_returns_invalid_json(monkeypatch):
    monkeypatch.setattr(script_to_agent, "call_llm", lambda *a, **k: "not valid json {{{")
    monkeypatch.setattr(script_to_agent, "LLM_MOCK_MODE", False)

    result = script_to_agent.generate_agent(
        ScriptToAgentRequest(client_name="Test Client", raw_script="Hi, this is a test script.")
    )

    assert result.degraded is True


def test_returns_real_output_when_llm_succeeds(monkeypatch):
    fake_json = (
        '{"call_flow": [{"step": "Greeting", "purpose": "Open the call", '
        '"example_line": "Hi there"}], "agent_system_prompt": "Be polite."}'
    )
    monkeypatch.setattr(script_to_agent, "call_llm", lambda *a, **k: fake_json)
    monkeypatch.setattr(script_to_agent, "LLM_MOCK_MODE", False)

    result = script_to_agent.generate_agent(
        ScriptToAgentRequest(client_name="Test Client", raw_script="Hi, this is a test script.")
    )

    assert result.degraded is False
    assert result.agent_system_prompt == "Be polite."
    assert result.call_flow[0].step == "Greeting"


def test_mock_mode_skips_the_llm_entirely(monkeypatch):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("call_llm should not be called when LLM_MOCK_MODE is on")

    monkeypatch.setattr(script_to_agent, "call_llm", _fail_if_called)
    monkeypatch.setattr(script_to_agent, "LLM_MOCK_MODE", True)

    result = script_to_agent.generate_agent(
        ScriptToAgentRequest(client_name="Test Client", raw_script="Hi, this is a test script.")
    )

    assert result.mock is True
    assert result.degraded is False
