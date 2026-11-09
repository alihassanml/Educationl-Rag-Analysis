"""Retrieval and abstention metrics for the Evaluation Lab.

Pure functions, no database or model access. Ranking metrics take `rels`, the relevance of each
retrieved item in rank order (best first). Undefined ratios return 0.0 so results always
serialise to valid JSON.
"""

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass


def hit_at_k(rels: Sequence[bool], k: int) -> float:
    """1.0 if at least one relevant item is in the top k, else 0.0."""
    return 1.0 if any(rels[:k]) else 0.0


def precision_at_k(rels: Sequence[bool], k: int) -> float:
    """Share of the top k that is relevant. The denominator is k, not the list length."""
    return sum(rels[:k]) / k if k > 0 else 0.0


def reciprocal_rank(rels: Sequence[bool]) -> float:
    for rank, relevant in enumerate(rels, start=1):
        if relevant:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(rels: Sequence[bool], k: int, n_relevant: int) -> float:
    """Binary-gain nDCG. `n_relevant` is how many relevant items exist in total."""
    ideal_count = min(k, n_relevant)
    if ideal_count <= 0:
        return 0.0
    dcg = sum(1.0 / math.log2(i + 1) for i, relevant in enumerate(rels[:k], start=1) if relevant)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, ideal_count + 1))
    return dcg / idcg


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def percentile(values: Sequence[float], p: float) -> float:
    """Percentile with linear interpolation between closest ranks (p between 0 and 100)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (p / 100) * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def bootstrap_ci(
    values: Sequence[float], resamples: int = 1000, confidence: float = 0.95, seed: int = 0
) -> tuple[float, float]:
    """Percentile bootstrap interval of the mean. Seeded, so results are reproducible."""
    if not values:
        return (0.0, 0.0)
    rng = random.Random(seed)
    n = len(values)
    means = [mean([values[rng.randrange(n)] for _ in range(n)]) for _ in range(resamples)]
    tail = (1 - confidence) / 2 * 100
    return (percentile(means, tail), percentile(means, 100 - tail))


@dataclass(frozen=True)
class AbstentionMatrix:
    """"Answerable" is the positive class. fp (answered an unanswerable question) is the
    hallucination risk; fn is an over-cautious refusal."""

    tp: int
    fn: int
    fp: int
    tn: int

    @staticmethod
    def _ratio(numerator: int, denominator: int) -> float:
        return numerator / denominator if denominator else 0.0

    @property
    def precision(self) -> float:
        return self._ratio(self.tp, self.tp + self.fp)

    @property
    def recall(self) -> float:
        return self._ratio(self.tp, self.tp + self.fn)

    @property
    def f1(self) -> float:
        total = self.precision + self.recall
        return 2 * self.precision * self.recall / total if total else 0.0

    @property
    def accuracy(self) -> float:
        return self._ratio(self.tp + self.tn, self.tp + self.fn + self.fp + self.tn)


def build_abstention_matrix(pairs: Sequence[tuple[bool, bool]]) -> AbstentionMatrix:
    """Each pair is (answerable, answered)."""
    tp = sum(1 for answerable, answered in pairs if answerable and answered)
    fn = sum(1 for answerable, answered in pairs if answerable and not answered)
    fp = sum(1 for answerable, answered in pairs if not answerable and answered)
    tn = sum(1 for answerable, answered in pairs if not answerable and not answered)
    return AbstentionMatrix(tp=tp, fn=fn, fp=fp, tn=tn)
