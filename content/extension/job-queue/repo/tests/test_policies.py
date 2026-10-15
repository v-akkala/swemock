import pytest

from jobq.policies import RetryPolicy


def test_defaults():
    policy = RetryPolicy()
    assert (policy.max_attempts, policy.delay) == (3, 10)


def test_should_retry_until_attempts_run_out():
    policy = RetryPolicy(max_attempts=3)
    assert [policy.should_retry(n) for n in (1, 2, 3)] == [True, True, False]


def test_delay_is_fixed():
    policy = RetryPolicy(delay=7)
    assert [policy.next_delay(n) for n in (1, 2, 3)] == [7, 7, 7]


def test_invalid_arguments_are_rejected():
    with pytest.raises(ValueError):
        RetryPolicy(max_attempts=0)
    with pytest.raises(ValueError):
        RetryPolicy(delay=-1)
