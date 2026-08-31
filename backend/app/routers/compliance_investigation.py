"""
Task 6: a client escalates a concern that the voice agent said something on a
call that may violate regulations. Help a human compliance reviewer start the
investigation.

This is the highest-risk task in the MVP (see SCOPE_OF_WORK.md, section 4) --
the output here is explicitly framed, in the prompt and in the UI, as a draft
for a human compliance/legal reviewer, never as something ready to send to a
client, customer, or regulator on its own.
"""
import json
import logging
from pathlib import Path

from fastapi import APIRouter

from app.config import LLM_MOCK_MODE
from app.llm import LLMUnavailableError, call_llm
from app.schemas import ComplianceConcern, ComplianceInvestigationRequest, ComplianceInvestigationResponse

logger = logging.getLogger("domu.compliance_investigation")

router = APIRouter(prefix="/api/compliance-investigation", tags=["compliance-investigation"])

DATA_PATH = Path(__file__).parent.parent / "data" / "mock_compliance_concerns.json"

SYSTEM_PROMPT = """You are a compliance analyst supporting Domu's Technical Operations team. \
A client (a bank or insurer) has escalated a concern that the voice agent may have said \
something on a call that violates debt-collection or consumer-protection regulations. You \
will be given a transcript snippet and a description of the concern.

You are NOT a lawyer and this is NOT legal advice -- you are helping a human compliance \
reviewer start their investigation faster. Never state a firm legal conclusion (e.g. never \
say something "is" a violation); always hedge appropriately (e.g. "could raise a concern \
under", "should be reviewed for"). Everything you produce is an internal draft for a human \
to review, edit, and decide on -- never something to send to a client, customer, or regulator \
as-is.

Produce:
1. risk_flags: specific phrases or moments in the transcript snippet that could be a concern, \
each explained in one sentence.
2. summary: a neutral, factual 2-4 sentence summary of what happened, for an internal record.
3. recommended_next_steps: what the compliance team should do next (e.g. escalate to legal, \
audit the agent's prompt, pause this call flow, or note that no action seems needed).
4. draft_internal_note: a short draft internal memo summarizing the incident and next steps, \
clearly written as an internal note -- not a message to the client or a regulator.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{
  "risk_flags": ["string", "..."],
  "summary": "string",
  "recommended_next_steps": ["string", "..."],
  "draft_internal_note": "string"
}
"""


def _mock_response() -> ComplianceInvestigationResponse:
    """Canned example returned when LLM_MOCK_MODE=true, so this screen works without a key."""
    return ComplianceInvestigationResponse(
        risk_flags=[
            "Agent stated a specific consequence ('this will not affect your credit score') "
            "without a way to verify that claim -- could raise a concern under FDCPA rules "
            "against false or misleading representations.",
        ],
        summary=(
            "During a routine account call, the agent responded to a customer's question about "
            "credit impact with a definitive statement rather than a hedged or escalated answer. "
            "No other compliance disclosures appear to have been skipped in this snippet."
        ),
        recommended_next_steps=[
            "Escalate to legal/compliance for a definitive review of the statement",
            "Audit the agent's system prompt for other instances of unverified claims",
            "Consider adding an explicit instruction to escalate credit-impact questions to a human",
        ],
        draft_internal_note=(
            "DRAFT -- FOR INTERNAL COMPLIANCE REVIEW ONLY, NOT FOR EXTERNAL USE.\n\n"
            "Summary: flagged call where the voice agent made an unverified statement about "
            "credit score impact in response to a customer question. Recommend legal review "
            "of the specific statement and a prompt audit to prevent recurrence. No customer "
            "or regulator communication has been drafted or sent."
        ),
        degraded=False,
        mock=True,
    )


def _fallback_response() -> ComplianceInvestigationResponse:
    return ComplianceInvestigationResponse(
        risk_flags=["AI analysis is temporarily unavailable -- this needs manual review."],
        summary="AI analysis is temporarily unavailable.",
        recommended_next_steps=["Escalate directly to a human compliance reviewer."],
        draft_internal_note="AI drafting is temporarily unavailable; needs manual write-up.",
        degraded=True,
    )


@router.get("/concerns", response_model=list[ComplianceConcern])
def get_concerns() -> list[ComplianceConcern]:
    raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return [ComplianceConcern(**item) for item in raw]


@router.post("", response_model=ComplianceInvestigationResponse)
def investigate_compliance_concern(payload: ComplianceInvestigationRequest) -> ComplianceInvestigationResponse:
    if LLM_MOCK_MODE:
        return _mock_response()

    user_prompt = (
        f"Client: {payload.client_name}\n\n"
        f"Concern reported by the client:\n\"\"\"\n{payload.concern_description}\n\"\"\"\n\n"
        f"Transcript snippet:\n\"\"\"\n{payload.transcript_snippet}\n\"\"\""
    )

    try:
        raw_text = call_llm(SYSTEM_PROMPT, user_prompt, max_tokens=1200)
        parsed = json.loads(raw_text)
        return ComplianceInvestigationResponse(
            risk_flags=parsed.get("risk_flags", []),
            summary=parsed["summary"],
            recommended_next_steps=parsed.get("recommended_next_steps", []),
            draft_internal_note=parsed["draft_internal_note"],
            degraded=False,
        )
    except LLMUnavailableError:
        logger.warning("LLM unavailable, returning fallback for compliance investigation")
        return _fallback_response()
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.error("Could not parse LLM response as expected JSON: %s", e)
        return _fallback_response()
