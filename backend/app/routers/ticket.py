"""
Task 5: turn an informal client request into a structured engineering ticket.
"""
import json
import logging

from fastapi import APIRouter

from app.config import LLM_MOCK_MODE
from app.llm import LLMUnavailableError, call_llm
from app.schemas import EngineeringTicket, TicketRequest

logger = logging.getLogger("domu.ticket")

router = APIRouter(prefix="/api/ticket", tags=["ticket"])

SYSTEM_PROMPT = """You are a Technical Operations Lead at Domu, a voice AI company. A \
client sent an informal request (e.g. by email or on a call). Turn it into a clear, \
actionable engineering ticket a developer could pick up without needing to talk to the \
client first. You may also be given additional details added directly by the Technical \
Ops Lead handling this ticket (context the client didn't say, but that's relevant) -- \
weave those in naturally rather than just appending them.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly:
{
  "title": "short imperative title",
  "priority": "low|medium|high",
  "description": "1-3 sentences of context and what's being requested and why",
  "acceptance_criteria": ["bullet", "bullet", "bullet"],
  "technical_notes": "1-2 sentences flagging anything a developer should investigate or watch out for (e.g. related systems, compliance considerations, ambiguity to clarify with the client)"
}
"""


def _mock_ticket(client_name: str, request_text: str, additional_details: str = "") -> EngineeringTicket:
    """Canned example returned when LLM_MOCK_MODE=true, so this screen works without a key.
    additional_details lands in the description and as its own acceptance criterion -- the
    places a developer would actually read -- not just tacked onto technical_notes where it's
    easy to miss."""
    details = additional_details.strip()

    description = (
        f"{client_name} has reported customers dropping off at the payment step and "
        f"asking for Apple Pay support. Original request: \"{request_text[:200]}\""
    )
    acceptance_criteria = [
        "Apple Pay appears as a payment option during the agent's payment collection step",
        "A successful Apple Pay payment updates the call outcome the same way a card payment does",
        "A failed/declined Apple Pay payment falls back to offering the existing payment methods",
    ]
    if details:
        description += f" Ops Lead note: {details}"
        acceptance_criteria.append(f"Scope/constraint from the Ops Lead: {details}")

    return EngineeringTicket(
        title="Add Apple Pay as a supported payment method",
        priority="medium",
        client_name=client_name,
        description=description,
        acceptance_criteria=acceptance_criteria,
        technical_notes=(
            "Check whether the existing payment processor integration already supports Apple Pay "
            "or if a new integration is needed; confirm with the client which regions/devices this "
            "needs to cover."
        ),
        degraded=False,
        mock=True,
    )


def _fallback_ticket(client_name: str, request_text: str) -> EngineeringTicket:
    return EngineeringTicket(
        title=f"[Needs triage] Request from {client_name}",
        priority="medium",
        client_name=client_name,
        description=(
            "AI drafting is temporarily unavailable. Raw client request, needs manual "
            f"write-up: \"{request_text[:300]}\""
        ),
        acceptance_criteria=["Manually review the raw request and rewrite as a proper ticket."],
        technical_notes="Generated as a degraded fallback -- verify with the client before starting work.",
        degraded=True,
    )


@router.post("", response_model=EngineeringTicket)
def generate_ticket(payload: TicketRequest) -> EngineeringTicket:
    if LLM_MOCK_MODE:
        return _mock_ticket(payload.client_name, payload.request_text, payload.additional_details)

    user_prompt = f"Client: {payload.client_name}\n\nRequest:\n\"\"\"\n{payload.request_text}\n\"\"\""
    if payload.additional_details.strip():
        user_prompt += (
            f"\n\nAdditional details from the Technical Ops Lead:\n\"\"\"\n"
            f"{payload.additional_details}\n\"\"\""
        )

    try:
        raw_text = call_llm(SYSTEM_PROMPT, user_prompt, max_tokens=700)
        parsed = json.loads(raw_text)
        return EngineeringTicket(
            title=parsed["title"],
            priority=parsed.get("priority", "medium"),
            client_name=payload.client_name,
            description=parsed["description"],
            acceptance_criteria=parsed.get("acceptance_criteria", []),
            technical_notes=parsed.get("technical_notes", ""),
            degraded=False,
        )
    except LLMUnavailableError:
        logger.warning("LLM unavailable, returning fallback ticket for %s", payload.client_name)
        return _fallback_ticket(payload.client_name, payload.request_text)
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.error("Could not parse LLM response as expected JSON: %s", e)
        return _fallback_ticket(payload.client_name, payload.request_text)
