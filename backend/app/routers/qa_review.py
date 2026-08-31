"""
Task 3: QA triage for flagged calls.

GET  /api/qa-review/flags        -> the raw flagged calls (mock data)
POST /api/qa-review/categorize   -> classify a single flagged call

Categorized one call at a time on purpose: keeps each request small, lets the
frontend show per-row loading state, and one slow/bad call doesn't block the rest.
"""
import json
import logging

from fastapi import APIRouter

from app.config import LLM_MOCK_MODE
from app.llm import LLMUnavailableError, call_llm
from app.schemas import FlaggedCall, QACategorizationResponse
from pathlib import Path

logger = logging.getLogger("domu.qa_review")

router = APIRouter(prefix="/api/qa-review", tags=["qa-review"])

DATA_PATH = Path(__file__).parent.parent / "data" / "mock_flags.json"

VALID_CATEGORIES = {"wrong_outcome", "incorrect_statement", "dropped_early", "unclear"}

SYSTEM_PROMPT = """You are a QA analyst reviewing flagged calls for a voice AI debt \
collection/insurance agent. For the flagged call given, decide which single category \
best explains what went wrong:

- wrong_outcome: the outcome logged for the call (e.g. "paid", "refused") does not \
match what actually happened in the conversation.
- incorrect_statement: the agent said something factually wrong or misleading.
- dropped_early: the call ended prematurely, before a required step was completed.
- unclear: none of the above clearly applies, or there isn't enough information.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{"category": "one of the four values above", "confidence": "low|medium|high", "reasoning": "one or two sentences"}
"""


def _mock_categorize(call: FlaggedCall) -> QACategorizationResponse:
    """Keyword-based stand-in used when LLM_MOCK_MODE=true -- not a real classifier,
    just enough to demo realistic-looking results without a working API key."""
    reason = call.flag_reason.lower()

    if "duration" in reason or "dropped" in reason:
        category = "dropped_early"
        reasoning = "Flag reason references call duration/drop, consistent with an early hangup."
    elif "inaccurate" in reason or "incorrect" in reason or "credit score" in reason:
        category = "incorrect_statement"
        reasoning = "Flag reason points at something the agent said being factually wrong."
    elif "logged" in reason or "outcome" in reason or "marked" in reason or "noted" in reason:
        category = "wrong_outcome"
        reasoning = "Flag reason indicates the logged outcome doesn't match what happened on the call."
    else:
        category = "unclear"
        reasoning = "Flag reason doesn't clearly map to one category -- needs human judgment."

    return QACategorizationResponse(
        call_id=call.call_id,
        category=category,
        confidence="medium",
        reasoning=reasoning,
        degraded=False,
        mock=True,
    )


@router.get("/flags", response_model=list[FlaggedCall])
def get_flags() -> list[FlaggedCall]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [FlaggedCall(**item) for item in raw]


@router.post("/categorize", response_model=QACategorizationResponse)
def categorize(call: FlaggedCall) -> QACategorizationResponse:
    if LLM_MOCK_MODE:
        return _mock_categorize(call)

    user_prompt = (
        f"Client: {call.client_name}\n"
        f"Flag reason noted by supervisor: {call.flag_reason}\n"
        f"Transcript snippet:\n\"\"\"\n{call.transcript_snippet}\n\"\"\""
    )

    try:
        raw_text = call_llm(SYSTEM_PROMPT, user_prompt, max_tokens=300)
        parsed = json.loads(raw_text)
        category = parsed.get("category", "unclear")
        if category not in VALID_CATEGORIES:
            category = "unclear"
        return QACategorizationResponse(
            call_id=call.call_id,
            category=category,
            confidence=parsed.get("confidence", "low"),
            reasoning=parsed.get("reasoning", ""),
            degraded=False,
        )
    except LLMUnavailableError:
        logger.warning("LLM unavailable, returning fallback for call %s", call.call_id)
        return QACategorizationResponse(
            call_id=call.call_id,
            category="unclear",
            confidence="low",
            reasoning="AI categorization is temporarily unavailable; needs manual review.",
            degraded=True,
        )
    except (json.JSONDecodeError, TypeError) as e:
        logger.error("Could not parse LLM response for call %s: %s", call.call_id, e)
        return QACategorizationResponse(
            call_id=call.call_id,
            category="unclear",
            confidence="low",
            reasoning="AI response could not be parsed; needs manual review.",
            degraded=True,
        )
