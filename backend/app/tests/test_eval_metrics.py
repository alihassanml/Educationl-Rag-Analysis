import pytest

from app.evaluation.metrics import (
    bootstrap_ci,
    build_abstention_matrix,
    hit_at_k,
    mean,
    ndcg_at_k,
    percentile,
    precision_at_k,
    reciprocal_rank,
)

RELS = [False, True, False, True]


def test_hit_at_k() -> None:
    assert hit_at_k(RELS, 1) == 0.0
    assert hit_at_k(RELS, 2) == 1.0


def test_precision_at_k_divides_by_k() -> None:
    assert precision_at_k(RELS, 3) == pytest.approx(1 / 3)
    assert precision_at_k([True], 5) == pytest.approx(1 / 5)


def test_reciprocal_rank() -> None:
    assert reciprocal_rank(RELS) == 0.5
    assert reciprocal_rank([False, False]) == 0.0


def test_ndcg_at_k_binary_gain() -> None:
    assert ndcg_at_k(RELS, 3, n_relevant=2) == pytest.approx(0.3869, abs=1e-4)
    assert ndcg_at_k([True], 5, n_relevant=1) == 1.0


def test_ndcg_with_no_relevant_items_is_zero() -> None:
    assert ndcg_at_k([True], 5, n_relevant=0) == 0.0


@pytest.mark.parametrize(
    "fn",
    [
        lambda: hit_at_k([], 5),
        lambda: precision_at_k([], 5),
        lambda: reciprocal_rank([]),
        lambda: ndcg_at_k([], 5, n_relevant=1),
        lambda: mean([]),
        lambda: percentile([], 95),
        lambda: bootstrap_ci([])[0],
        lambda: bootstrap_ci([])[1],
    ],
)
def test_empty_inputs_return_zero(fn) -> None:  # type: ignore[no-untyped-def]
    assert fn() == 0.0


def test_mean() -> None:
    assert mean([1.0, 2.0, 6.0]) == 3.0


def test_percentile_interpolates_linearly() -> None:
    assert percentile([1, 2, 3, 4], 50) == 2.5
    assert percentile([1, 2, 3, 4], 95) == pytest.approx(3.85)
    assert percentile([4, 1, 3, 2], 50) == 2.5  # input order does not matter
    assert percentile([7], 95) == 7.0


def test_bootstrap_ci_constant_values_collapse() -> None:
    assert bootstrap_ci([1.0] * 20) == (1.0, 1.0)


def test_bootstrap_ci_is_reproducible_and_brackets_the_mean() -> None:
    values = [0.0, 1.0] * 50
    low, high = bootstrap_ci(values)
    assert (low, high) == bootstrap_ci(values)
    assert low <= 0.5 <= high
    assert low < high


def test_abstention_matrix_counts_and_ratios() -> None:
    matrix = build_abstention_matrix([(True, True), (True, False), (False, True), (False, False)])
    assert (matrix.tp, matrix.fn, matrix.fp, matrix.tn) == (1, 1, 1, 1)
    assert matrix.precision == 0.5
    assert matrix.recall == 0.5
    assert matrix.f1 == 0.5
    assert matrix.accuracy == 0.5


def test_abstention_matrix_with_undefined_ratios_does_not_raise() -> None:
    empty = build_abstention_matrix([])
    assert (empty.precision, empty.recall, empty.f1, empty.accuracy) == (0.0, 0.0, 0.0, 0.0)
    only_correct_abstentions = build_abstention_matrix([(False, False), (False, False)])
    assert only_correct_abstentions.f1 == 0.0
    assert only_correct_abstentions.accuracy == 1.0
