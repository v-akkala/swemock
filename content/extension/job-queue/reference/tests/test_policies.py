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


def test_exponential_backoff_doubles_and_caps():
    policy = RetryPolicy(max_attempts=7, delay=5, backoff="exponential", cap=60)
    assert [policy.next_delay(n) for n in range(1, 7)] == [5, 10, 20, 40, 60, 60]


def test_jitter_scales_the_delay_after_the_cap():
    class Top:
        def uniform(self, low, high):
            return high

    policy = RetryPolicy(delay=10, backoff="exponential", cap=15, jitter=0.5, rng=Top())
    assert policy.next_delay(3) == 22.5


def test_new_arguments_are_validated():
    for bad in ({"backoff": "linear"}, {"factor": 0.5}, {"cap": 0}, {"jitter": 1.5}):
        with pytest.raises(ValueError):
            RetryPolicy(**bad)
