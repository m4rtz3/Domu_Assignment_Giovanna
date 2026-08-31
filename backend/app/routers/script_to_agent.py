"""
Task 1: turn a client's raw call script into a structured call flow + a
working voice agent system prompt.
"""
import json
import logging

from fastapi import APIRouter

from app.config import LLM_MOCK_MODE
from app.llm import LLMUnavailableError, call_llm
from app.schemas import CallFlowBranch, CallFlowStep, ScriptToAgentRequest, ScriptToAgentResponse

logger = logging.getLogger("domu.script_to_agent")

router = APIRouter(prefix="/api/script-to-agent", tags=["script-to-agent"])

SYSTEM_PROMPT = """You are a senior conversation designer at Domu, a company that builds \
real-time voice AI agents for debt collection and sales calls on behalf of banks and \
insurers. A client has sent you their existing (informal) call script.

Your job has two parts:
1. Break it into a structured call flow: an ordered list of steps a live phone call \
should follow (e.g. greeting, identity verification, reason for call, present options, \
handle objections, close). For each step give: the step name, its purpose, and one \
short example line an agent could actually say. This is a real branching flow, not just \
a script to read top to bottom -- for any step where the customer's response could send \
the call in different directions (most importantly handling objections, but also things \
like a failed identity check or a disputed debt), list each realistic branch: what the \
customer says/does, and what the agent should do in that case. Steps with no real branching \
(e.g. the greeting) can have an empty branch list.
2. Write a complete system prompt for a real-time voice agent that would run this call. \
It must include: the agent persona/tone, the required compliance disclosures a debt \
collection call needs (this is a regulated industry -- identify the caller/company, \
state the purpose of the call, and note that the call may be recorded), how to handle \
common objections, and an explicit instruction to never make false statements about \
legal or credit consequences.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this \
shape:
{
  "call_flow": [
    {
      "step": "string",
      "purpose": "string",
      "example_line": "string",
      "branches": [
        {"condition": "string describing what the customer says/does", "response": "string describing what the agent does next"}
      ]
    }
  ],
  "agent_system_prompt": "string"
}
"""


def _mock_response(client_name: str) -> ScriptToAgentResponse:
    """Canned example returned when LLM_MOCK_MODE=true, so this screen works without a key."""
    return ScriptToAgentResponse(
        client_name=client_name,
        call_flow=[
            CallFlowStep(
                step="Greeting & identification",
                purpose="Identify the caller and company, required before discussing the account.",
                example_line=f"Hi, this is Hannah calling on behalf of {client_name}. Am I speaking with [Name]?",
            ),
            CallFlowStep(
                step="Compliance disclosure",
                purpose="State the purpose of the call and that it may be recorded, as required by law.",
                example_line="This call is regarding your account and may be recorded for quality purposes.",
            ),
            CallFlowStep(
                step="Present the balance",
                purpose="Explain what's owed clearly, without pressure tactics.",
                example_line="Our records show a balance of $214.50. Would today work to take care of that?",
                branches=[
                    CallFlowBranch(
                        condition="Customer disputes owing the debt at all",
                        response="Stop pushing for payment; offer to escalate to a human agent who can pull up the account history.",
                    ),
                ],
            ),
            CallFlowStep(
                step="Handle objections",
                purpose="Offer alternatives instead of repeating the same ask.",
                example_line="Totally understand. Would a payment plan starting next week work better?",
                branches=[
                    CallFlowBranch(
                        condition="Customer says they can't pay right now",
                        response="Offer a payment plan starting the following week instead of paying in full today.",
                    ),
                    CallFlowBranch(
                        condition="Customer asks about legal/credit consequences",
                        response="Do not state or imply any consequence that can't be verified; offer to connect them with someone who can confirm the details.",
                    ),
                ],
            ),
            CallFlowStep(
                step="Close",
                purpose="Confirm next steps and end politely regardless of outcome.",
                example_line="Thanks for your time today, you'll get a confirmation by email shortly.",
            ),
        ],
        agent_system_prompt=(
            f"You are Hannah, a calm and respectful voice agent calling on behalf of {client_name} "
            "regarding an outstanding balance. Always identify yourself and the company first, and "
            "state that the call may be recorded. Never state or imply legal or credit consequences "
            "you cannot verify. If the customer disputes the debt, do not pressure them further -- "
            "offer to escalate to a human agent. If asked about payment options, offer a payment plan "
            "as an alternative to paying in full today. End every call politely, regardless of outcome."
        ),
        degraded=False,
        mock=True,
    )


def _fallback_response(client_name: str) -> ScriptToAgentResponse:
    """Generic template returned when the real LLM call fails, so the user still gets
    something usable instead of a broken screen."""
    return ScriptToAgentResponse(
        client_name=client_name,
        call_flow=[
            CallFlowStep(
                step="Greeting & identification",
                purpose="Identify the caller and company as required by law.",
                example_line="Hi, this is Hannah calling on behalf of [Client]. Is this [Name]?",
            ),
            CallFlowStep(
                step="Compliance disclosure",
                purpose="State the purpose of the call and that it may be recorded.",
                example_line="This call is regarding an outstanding balance and may be recorded.",
            ),
            CallFlowStep(
                step="Present the request",
                purpose="Explain what's owed and the options available.",
                example_line="Our records show a balance of $X. Would today work to resolve it?",
                branches=[
                    CallFlowBranch(
                        condition="Customer disputes owing the debt",
                        response="Stop pushing for payment and offer to escalate to a human agent.",
                    ),
                ],
            ),
            CallFlowStep(
                step="Handle objections",
                purpose="Address pushback without making unverifiable claims.",
                example_line="I understand. Would a payment plan work better for you?",
                branches=[
                    CallFlowBranch(
                        condition="Customer says they can't pay",
                        response="Offer a payment plan instead of repeating the original ask.",
                    ),
                ],
            ),
            CallFlowStep(
                step="Close",
                purpose="Confirm next steps and end the call politely.",
                example_line="Thank you for your time, you'll receive a confirmation by email.",
            ),
        ],
        agent_system_prompt=(
            "AI generation is temporarily unavailable, so this is a generic starter "
            "template only -- not tailored to the script submitted. Please retry shortly "
            "for a version generated from the actual client script."
        ),
        degraded=True,
    )


@router.post("", response_model=ScriptToAgentResponse)
def generate_agent(payload: ScriptToAgentRequest) -> ScriptToAgentResponse:
    if LLM_MOCK_MODE:
        return _mock_response(payload.client_name)

    user_prompt = (
        f"Client name: {payload.client_name}\n\n"
        f"Raw call script from the client:\n\"\"\"\n{payload.raw_script}\n\"\"\""
    )

    try:
        raw_text = call_llm(SYSTEM_PROMPT, user_prompt, max_tokens=2400)
        parsed = json.loads(raw_text)
        call_flow = [CallFlowStep(**step) for step in parsed["call_flow"]]
        return ScriptToAgentResponse(
            client_name=payload.client_name,
            call_flow=call_flow,
            agent_system_prompt=parsed["agent_system_prompt"],
            degraded=False,
        )
    except LLMUnavailableError:
        logger.warning("LLM unavailable, returning fallback template for %s", payload.client_name)
        return _fallback_response(payload.client_name)
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        # response came back but not in the shape we asked for
        logger.error("Could not parse LLM response as expected JSON: %s", e)
        return _fallback_response(payload.client_name)
