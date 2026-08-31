"""
Task 4: a client reports the voice agent handles payment objections poorly.
Diagnose why, given the agent's current system prompt, and produce a revised
prompt that fixes it.

Deliberately built as a variant of Task 1's flow (script -> agent) rather
than a separate concept: both are "produce/revise a voice agent system
prompt", just with different inputs.
"""
import json
import logging
from pathlib import Path

from fastapi import APIRouter

from app.config import LLM_MOCK_MODE
from app.llm import LLMUnavailableError, call_llm
from app.schemas import FixObjectionHandlingRequest, FixObjectionHandlingResponse, ObjectionIssue

logger = logging.getLogger("domu.fix_objection_handling")

router = APIRouter(prefix="/api/fix-objection-handling", tags=["fix-objection-handling"])

DATA_PATH = Path(__file__).parent.parent / "data" / "mock_objection_issues.json"

SYSTEM_PROMPT = """You are a senior conversation designer at Domu, a company that builds \
real-time voice AI agents for debt collection and sales calls on behalf of banks and \
insurers. A client has reported that their voice agent handles payment objections poorly. \
You'll be given the agent's current system prompt and a description of what's going wrong \
(often with an example of a bad exchange).

Diagnose the root cause in the current prompt -- e.g. it doesn't mention objection handling \
at all, it's too pushy, it makes unverifiable claims, it doesn't offer alternatives -- then \
produce a complete revised system prompt that fixes it. Keep everything about the current \
prompt that isn't related to the reported problem; don't rewrite it from scratch.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{
  "diagnosis": "2-4 sentences on what in the current prompt causes the poor behavior",
  "what_changed": ["short bullet describing one concrete change", "..."],
  "updated_prompt": "the full revised system prompt"
}
"""


def _mock_response(current_prompt: str) -> FixObjectionHandlingResponse:
    """Canned example returned when LLM_MOCK_MODE=true, so this screen works without a key."""
    updated = (
        current_prompt.strip()
        + "\n\nWhen the customer objects to paying (says they can't afford it, disputes the "
        "amount, or asks for more time), do not repeat the same request. Instead, offer a "
        "payment plan as an alternative, and never state or imply a legal or credit "
        "consequence you can't verify. If they push back a second time, offer to escalate to "
        "a human agent instead of continuing to negotiate."
    )
    return FixObjectionHandlingResponse(
        diagnosis=(
            "The current prompt doesn't say anything about what to do when the customer "
            "pushes back -- so the agent just repeats the original ask, which reads as "
            "pressuring the customer instead of working with them."
        ),
        what_changed=[
            "Added explicit instructions for the objection-handling turn",
            "Required offering a payment plan instead of repeating the same ask",
            "Added an escalation path for a second objection instead of continued pressure",
        ],
        updated_prompt=updated,
        degraded=False,
        mock=True,
    )


def _fallback_response(current_prompt: str) -> FixObjectionHandlingResponse:
    return FixObjectionHandlingResponse(
        diagnosis="AI diagnosis is temporarily unavailable.",
        what_changed=["No changes made -- please retry shortly."],
        updated_prompt=current_prompt,
        degraded=True,
    )


@router.get("/issues", response_model=list[ObjectionIssue])
def get_issues() -> list[ObjectionIssue]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [ObjectionIssue(**item) for item in raw]


@router.post("", response_model=FixObjectionHandlingResponse)
def fix_objection_handling(payload: FixObjectionHandlingRequest) -> FixObjectionHandlingResponse:
    if LLM_MOCK_MODE:
        return _mock_response(payload.current_prompt)

    user_prompt = (
        f"Client: {payload.client_name}\n\n"
        f"Current agent system prompt:\n\"\"\"\n{payload.current_prompt}\n\"\"\"\n\n"
        f"What's going wrong:\n\"\"\"\n{payload.problem_description}\n\"\"\""
    )

    try:
        raw_text = call_llm(SYSTEM_PROMPT, user_prompt, max_tokens=1800)
        parsed = json.loads(raw_text)
        return FixObjectionHandlingResponse(
            diagnosis=parsed["diagnosis"],
            what_changed=parsed.get("what_changed", []),
            updated_prompt=parsed["updated_prompt"],
            degraded=False,
        )
    except LLMUnavailableError:
        logger.warning("LLM unavailable, returning fallback for %s", payload.client_name)
        return _fallback_response(payload.current_prompt)
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.error("Could not parse LLM response as expected JSON: %s", e)
        return _fallback_response(payload.current_prompt)
