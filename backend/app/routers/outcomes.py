"""Task 2: cross-client call outcomes dashboard. No LLM here -- it's just aggregation."""
import json
from pathlib import Path

from fastapi import APIRouter

from app.schemas import ClientOutcomes, OutcomesSummaryResponse

router = APIRouter(prefix="/api/outcomes", tags=["outcomes"])

DATA_PATH = Path(__file__).parent.parent / "data" / "mock_calls.json"


def _to_client_outcomes(raw: dict) -> ClientOutcomes:
    answered = raw["answered"]
    payment_secured = raw["payment_secured"]
    total_calls = raw["total_calls"]
    failed = raw["failed"]

    return ClientOutcomes(
        client_id=raw["client_id"],
        client_name=raw["client_name"],
        total_calls=total_calls,
        answered=answered,
        payment_secured=payment_secured,
        failed=failed,
        answer_rate=round(answered / total_calls, 4) if total_calls else 0.0,
        conversion_rate=round(payment_secured / answered, 4) if answered else 0.0,
        failure_rate=round(failed / total_calls, 4) if total_calls else 0.0,
        avg_handle_time_seconds=raw.get("avg_handle_time_seconds"),
        top_failure_reason=raw.get("top_failure_reason"),
        calls_by_day=raw.get("calls_by_day"),
    )


@router.get("", response_model=OutcomesSummaryResponse)
def get_outcomes() -> OutcomesSummaryResponse:
    raw_clients = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    clients = [_to_client_outcomes(c) for c in raw_clients]

    total_calls = sum(c.total_calls for c in clients)
    answered = sum(c.answered for c in clients)
    payment_secured = sum(c.payment_secured for c in clients)
    failed = sum(c.failed for c in clients)

    # weighted average, since each client had a different call volume
    avg_handle_time_seconds = (
        round(sum(c.avg_handle_time_seconds * c.total_calls for c in clients) / total_calls, 1)
        if total_calls
        else None
    )
    calls_by_day: dict[str, int] = {}
    for c in clients:
        for day, count in (c.calls_by_day or {}).items():
            calls_by_day[day] = calls_by_day.get(day, 0) + count

    totals = ClientOutcomes(
        client_id="all",
        client_name="All Clients",
        total_calls=total_calls,
        answered=answered,
        payment_secured=payment_secured,
        failed=failed,
        answer_rate=round(answered / total_calls, 4) if total_calls else 0.0,
        conversion_rate=round(payment_secured / answered, 4) if answered else 0.0,
        failure_rate=round(failed / total_calls, 4) if total_calls else 0.0,
        avg_handle_time_seconds=avg_handle_time_seconds,
        top_failure_reason=None,  # not meaningful as a single value across all clients
        calls_by_day=calls_by_day or None,
    )

    return OutcomesSummaryResponse(clients=clients, totals=totals)
