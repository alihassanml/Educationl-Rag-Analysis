# Evaluation plan and results

What has been measured, how to repeat it, and what still needs a human. Results below are from small samples and describe this sample corpus, not every possible document.

## 1. Retrieval and abstention (measured, no API key needed)

Corpus: 3 documents, 12 pages (`backend/eval/corpus.py`). 30 answerable questions with known page, 8 unanswerable (including near-misses such as "How does mitosis differ from meiosis?"). Real embedding model `BAAI/bge-small-en-v1.5`, real PostgreSQL and pgvector, real indexing pipeline.

Repeat: `createdb edurag_eval`, run `alembic upgrade head` with `DATABASE_URL` pointing at it, then `python -m eval.run_retrieval_eval` from `backend/` (full commands in the script header). Output: `backend/eval/results/retrieval_results.md`.

| Metric | Result |
|---|---|
| Expected page in top 1 | 29/30 (97%) |
| Expected page in top 3 | 30/30 (100%) |

Similarity threshold sweep (a question is "answered" if any chunk reaches the threshold):

| Threshold | Answerable answered | Citation correct | Unanswerable refused |
|---|---|---|---|
| 0.50 | 30/30 | 30/30 | 3/8 |
| 0.55 | 30/30 | 30/30 | 4/8 |
| **0.60 (default)** | 29/30 | 29/30 | 6/8 |
| 0.65 | 29/30 | 29/30 | 8/8 |
| 0.70 | 25/30 | 25/30 | 8/8 |

Choice: 0.60. It keeps 29 of 30 real questions answerable while refusing most off-topic ones before any model call; the model's own "insufficient evidence" check catches the rest (section 2). Failure cases at 0.60: "What is thrashing?" scored 0.60 and was just rejected; "How does mitosis differ from meiosis?" (0.63) and "Explain how TCP congestion control works" (0.61) were not refused by the threshold. Higher thresholds refuse more but start losing correct answers, so the value is configurable (`RETRIEVAL_MIN_SIMILARITY`) and should be re-checked on your own documents.

## 2. Groq model comparison (measured with the project key)

Same real prompts and pipeline for each model; threshold lowered to 0.5 so near-misses reach the model. Repeat: `python -m eval.compare_models <model ids>`; the output also lists every answer for manual reading.

| Model | Answerable answered with right page cited (15) | Unanswerable refused (8) | Avg tutor latency | Quiz (3 x 5 questions) | API errors |
|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | 15/15 | 8/8 | 1.1 s | 3/3 valid (one needed regeneration) | 0 |
| `openai/gpt-oss-20b` | 15/15 | 8/8 | 1.4 s | 3/3 valid, one call each | 0 |
| `qwen/qwen3.8-27b` | 15/15 | 6/8 | 1.4 s | 2/3 (one rate-limited) | 3 |

Selected: `openai/gpt-oss-120b` with `GROQ_REASONING_EFFORT=low`. `gpt-oss-20b` performed equally on this sample and is a reasonable cheaper fallback. The sample is small; differences between the two gpt-oss models are not statistically meaningful. Observed weakness: "advanced" quiz questions can drift beyond the notes, so the quiz prompt now forbids outside knowledge, and quiz review (section 4) should check this.

## 3. Automated checks (run on every change)

| Area | Where | Count |
|---|---|---|
| Backend: extraction, chunking, retrieval (dense and hybrid) and tutor behaviour, Groq error handling, quiz validation, scoring, adaptive rules (every boundary: 0, 2, 3 attempts, exactly 60%, 80%), progress, auth, security, Evaluation Lab metrics, runner and API (including administrator-only access) | `backend/app/tests` (real PostgreSQL + pgvector, mocked Groq) | 180 |
| Frontend: validators, API client, auth form, tutor, quiz runner, progress, shell, design-token contrast (WCAG AA), Evaluation Lab screens | `frontend/tests` (Vitest) | 87 |
| Browser end to end on a production build: register, upload, tutor with sources and refusal, quiz, progress, delete, sign out, 375 px layout | `frontend/e2e` (Playwright, real DB and embeddings, scripted LLM) | 11 |

Security and robustness covered by tests: student A cannot read, delete, list, query, quiz from, or see progress of student B's data; non-PDF, fake-PDF (bad signature), empty and oversized uploads are rejected and not left on disk; image-only and corrupt PDFs end as `failed` with a helpful message; errors never include internals; cross-origin state-changing requests are blocked; the default secret key is refused in production.

## 4. Still to do by hand (needs people, not code)

1. **Answer faithfulness.** Read the answers in `model_comparison.md` (or run your own 30 to 50 questions) and label each important claim as supported or unsupported by the cited page. Report counts and examples.
2. **Quiz quality.** Generate about 30 questions from approved passages; check each is answerable from its source, the marked answer is right, and the explanation matches. Record invalid outputs (the server log shows validated and rejected counts per generation).
3. **Usability.** Ask a few test users to upload a PDF, ask a question, take a quiz and find their progress without help. Record what confused them.
4. **Your own documents.** Re-run the retrieval evaluation with your real course PDFs and adjust the threshold if needed.

## 5. Report checklist

Test setup and dataset (section 1), metric definitions, results tables (sections 1 to 3), real screenshots (`docs/screenshots`, regenerate with `SCREENSHOTS=1 npx playwright test screenshots` from `frontend/`), failure cases and limitations (above), and what changed after testing: the similarity threshold moved from 0.50 to 0.60 after the sweep, chunk size was set below the embedding model's 512-token limit, and the quiz prompt was tightened after reviewing advanced questions.

## 6. Evaluation Lab: retrieval metrics and dense versus hybrid

The Lab (administrators only, sidebar "Evaluation") runs a labelled question set through the real retrieval code for the signed-in user's own documents and stores every run with a snapshot of its settings. It scores **retrieval only**: no Groq call is made, so it says nothing about answer faithfulness, answer correctness or citation recall. Each question has either an expected page (answerable) or none (unanswerable).

How each number is computed (`backend/app/evaluation/metrics.py`, `runner.py`):

| Metric | Definition |
|---|---|
| Hit rate at K | Share of answerable questions whose expected page (same document title and page number) is among the top K retrieved passages, K = 1, 3, 5, 10 |
| Precision at K | Relevant passages in the top K divided by K |
| MRR | Mean of 1 / rank of the first relevant passage (0 if none) |
| nDCG at K | Binary relevance with a log2 discount, normalised by the best possible ordering given how many passages of the expected page exist |
| Answered | The best passage reaches the similarity threshold (`RETRIEVAL_MIN_SIMILARITY`, 0.60). Otherwise the system abstains |
| Abstention matrix | Answerable is the positive class: answerable and answered is a true positive; unanswerable and answered is a false positive (hallucination risk); answerable and abstained is an over-cautious refusal |
| Pass | Answerable: answered and the expected page is in the top 5. Unanswerable: abstained |
| Intervals | 95% bootstrap interval of the mean (1,000 resamples, fixed seed) |
| Latency | p50 and p95 of the retrieval call per question (embedding the question plus the database search) |

Questions whose expected document or page is not in the user's library are shown as "not scored" and excluded from every ratio instead of counting as failures. Repeat with `python -m eval.seed_lab --email <user> --run dense,hybrid` (from `backend/`; needs the sample documents it creates in that user's library) or from the Evaluation page.

**Dense versus hybrid, recorded 2026-11-09.** Same 38 questions (30 answerable, 8 unanswerable) over the 3-document, 12-page sample corpus, real `BAAI/bge-small-en-v1.5` embeddings, threshold 0.60, 0 questions unscored. Hybrid fuses the dense ranking with a PostgreSQL full-text ranking by reciprocal rank fusion (k = 60, 40 candidates each) and keeps the same similarity gate.

| Metric | Dense | Hybrid |
|---|---|---|
| Hit rate at 1 | 96.7% (29/30) | 93.3% (28/30) |
| Hit rate at 3 | 100.0% | 100.0% |
| Hit rate at 5 (95% interval) | 100.0% (100.0 to 100.0) | 100.0% (100.0 to 100.0) |
| Hit rate at 10 | 100.0% | 100.0% |
| MRR (95% interval) | 0.983 (0.950 to 1.000) | 0.967 (0.917 to 1.000) |
| nDCG at 5 | 0.988 | 0.975 |
| Abstention precision, recall, F1 | 93.5%, 96.7%, 95.1% | 93.5%, 96.7%, 95.1% |
| Abstention counts (tp, fn, fp, tn) | 29, 1, 2, 6 | 29, 1, 2, 6 |
| Retrieval latency p50, p95 | 19 ms, 31 ms | 22 ms, 25 ms |

Reading: hybrid was **not better** here. It ranked one more question's expected page second instead of first ("What happens during glycolysis?"); everything else is equal, and the intervals overlap. Abstention is identical by construction because hybrid keeps the same gate. With a dense hit rate at 5 already at 100% on 30 questions, this sample has no room to show a hybrid gain, so the result does not say hybrid is worse in general either; it says there is no evidence to switch. `RETRIEVAL_MODE` therefore stays `dense`. Rule for changing it: switch only if a run on a larger or harder question set (ideally your own course documents) shows hybrid keeping abstention F1 and improving hit rate at 5 or MRR.

Not measured by the Lab yet: faithfulness, answer relevance and correctness, citation precision and recall (these need judged answers), a threshold tuner, a golden set of 150 reviewed questions (the 38 here come from `backend/eval/corpus.py`), and scale benchmarks.

## Limitations to state honestly

Citations show which passages were retrieved, not that the answer is fully correct. Refusing when evidence is weak reduces unsupported answers but does not eliminate them. Topic status uses simple, configurable rules and is not a measure of ability or an exam prediction. Scanned (image-only) PDFs are not supported (no OCR). The Evaluation Lab's numbers describe retrieval on a small sample corpus; they are not an accuracy figure for answers.
