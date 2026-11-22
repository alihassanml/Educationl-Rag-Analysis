# Evaluation plan

The **Evaluation Lab** (admin only, `/evaluation`) measures retrieval on labelled question sets: hit rate@K, MRR, nDCG, and abstention accuracy (does the system correctly find nothing for off-topic questions). It compares **dense** retrieval with **hybrid** (vector + full-text) and runs as a background job.

## What is measured
| Metric | Meaning |
|---|---|
| Hit rate@K | The labelled page/passage is among the top K results |
| MRR | How high the first correct passage ranks |
| nDCG | Ranking quality with graded relevance |
| Abstention accuracy | Off-topic questions return no passage (so the answer is "not found") |

It does **not** measure answer faithfulness or quiz quality; those are covered by unit tests with scripted model replies and by the "not found" guard in the prompts.

## Datasets
- `backend/eval/datasets/sample_course.jsonl`: the labelled sample course (loaded with `python -m eval.seed_lab`). More datasets can be added as `.jsonl` files with a question and the expected page; measure on several document types before changing a threshold.
- Past-paper, teacher-material and viva features reuse the same retrieval, so retrieval changes are evaluated by these sets; the features' own logic is covered by unit and API tests.

## Decision rule
`RETRIEVAL_MODE` stays `dense` unless a run on at least three datasets shows hybrid with a higher hit rate and no loss in abstention accuracy. The similarity bar (`RETRIEVAL_MIN_SIMILARITY`) is chosen the same way, never tuned to one document. Add datasets for other document types before changing it.

## Running
`cd backend && .venv/bin/python -m eval.seed_lab --email you@example.com --run dense,hybrid`, or start a run from the Evaluation Lab page (needs the worker). `python -m eval.run_retrieval_eval` scores similarities directly and does not include the keyword rule.
