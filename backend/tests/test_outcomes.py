"""
Pure logic tests for the outcomes aggregation -- no mocking needed since
there's no LLM or network call involved.
"""
from app.routers.outcomes import get_outcomes


def test_returns_all_seven_clients():
    result = get_outcomes()
    assert len(result.clients) == 7


def test_rates_are_between_zero_and_one():
    result = get_outcomes()
    for client in result.clients:
        assert 0 <= client.answer_rate <= 1
        assert 0 <= client.conversion_rate <= 1
        assert 0 <= client.failure_rate <= 1


def test_totals_match_sum_of_clients():
    result = get_outcomes()
    assert result.totals.total_calls == sum(c.total_calls for c in result.clients)
    assert result.totals.answered == sum(c.answered for c in result.clients)
    assert result.totals.payment_secured == sum(c.payment_secured for c in result.clients)
