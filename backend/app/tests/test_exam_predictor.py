import uuid

import pymupdf
import pytest
from sqlalchemy import select

from app.models.quiz import ExamTopicScore, PastPaperQuestion, TopicProgress
from app.services import exam_predictor_service as ep
from app.services.exam_predictor_service import (
    Match,
    PaperInfo,
    ScoreRule,
    best_topic,
    explain,
    recency_weights,
    score_topics,
    validate_questions,
)
from app.services.groq_service import LLMOutputError, LLMUnavailableError
from app.tests.conftest import make_pdf, register

RULE = ScoreRule(w_frequency=0.5, w_recency=0.3, w_marks=0.2, high_from=70, medium_from=40)


def _id() -> uuid.UUID:
    return uuid.uuid4()


# --- recency, scoring, labels


def test_recency_weights_run_from_half_to_one_and_undated_papers_sit_between() -> None:
    old, mid, new, undated = (PaperInfo(_id(), y) for y in (2020, 2022, 2024, None))
    w = recency_weights([old, mid, new, undated])
    assert w[old.paper_id] == 0.5 and w[new.paper_id] == 1.0
    assert w[mid.paper_id] == pytest.approx(0.75)
    assert w[undated.paper_id] == 0.75
    only = PaperInfo(_id(), 2024)
    assert recency_weights([only])[only.paper_id] == 1.0


def test_a_topic_in_every_paper_scores_higher_than_one_in_a_single_paper() -> None:
    papers = [PaperInfo(_id(), y) for y in (2021, 2022, 2023)]
    always, once = _id(), _id()
    matches = [Match(always, p.paper_id, None) for p in papers] + [
        Match(once, papers[0].paper_id, None)
    ]
    scored = {s.topic_id: s for s in score_topics(papers, matches, RULE)}
    assert scored[always].score == 100 and scored[always].label == "High"
    assert scored[once].score < scored[always].score
    assert scored[always].papers_with_topic == 3 and scored[always].total_papers == 3


def test_newer_papers_count_more() -> None:
    old, new = PaperInfo(_id(), 2018), PaperInfo(_id(), 2024)
    in_old, in_new = _id(), _id()
    scored = {
        s.topic_id: s
        for s in score_topics(
            [old, new], [Match(in_old, old.paper_id, None), Match(in_new, new.paper_id, None)], RULE
        )
    }
    assert scored[in_new].score > scored[in_old].score
    assert scored[in_new].most_recent_year == 2024 and scored[in_old].most_recent_year == 2018


def test_marks_lift_a_topic_and_are_ignored_when_no_paper_gives_marks() -> None:
    papers = [PaperInfo(_id(), 2023), PaperInfo(_id(), 2024)]
    heavy, light = _id(), _id()
    with_marks = {
        s.topic_id: s
        for s in score_topics(
            papers,
            [Match(heavy, papers[0].paper_id, 20), Match(light, papers[0].paper_id, 2)],
            RULE,
        )
    }
    assert with_marks[heavy].score > with_marks[light].score and with_marks[heavy].total_marks == 20
    none = {
        s.topic_id: s
        for s in score_topics(
            papers,
            [Match(heavy, papers[0].paper_id, None), Match(light, papers[0].paper_id, None)],
            RULE,
        )
    }
    assert none[heavy].score == none[light].score and none[heavy].total_marks is None


@pytest.mark.parametrize(
    ("score", "label"),
    [(100, "High"), (70, "High"), (69, "Medium"), (40, "Medium"), (39, "Low"), (0, "Low")],
)
def test_label_bands(score: int, label: str) -> None:
    assert ep.label_for(score, RULE) == label


def test_no_papers_means_no_scores() -> None:
    assert score_topics([], [], RULE) == []


def test_the_explanation_states_the_rule_in_plain_words() -> None:
    p = [PaperInfo(_id(), y) for y in (2021, 2022, 2023, 2024, 2025)]
    topic = _id()
    scored = score_topics(p, [Match(topic, x.paper_id, None) for x in p[:4]], RULE)[0]
    assert explain(scored) == "Appeared in 4 of 5 papers, most recently 2024"
    marked = score_topics(p[:2], [Match(topic, p[0].paper_id, 6)], RULE)[0]
    assert (
        explain(marked) == "Appeared in 1 of 2 papers, most recently 2021, worth 6 marks in total"
    )


# --- matching and validation


def test_a_question_joins_the_closest_topic_only_above_the_bar() -> None:
    a, b = _id(), _id()
    vectors = {a: [1.0, 0.0], b: [0.0, 1.0]}
    assert best_topic([0.9, 0.1], vectors, 0.5)[0] == a
    assert best_topic([0.1, 0.95], vectors, 0.5)[0] == b
    assert best_topic([0.7, 0.7], vectors, 0.9) == (None, None)  # close to both, near neither
    assert best_topic([1.0, 0.0], {}, 0.1) == (None, None)


def test_invented_duplicate_and_empty_questions_are_dropped() -> None:
    paper = (
        "Explain how recursion works with a base case. Describe the quicksort algorithm in detail."
    )
    raw = [
        {"question_text": "Explain how recursion works with a base case.", "marks": 5, "page": 1},
        {
            "question_text": "Explain how recursion works with a base case!",
            "marks": 5,
            "page": 1,
        },  # repeat
        {"question_text": "Describe the quicksort algorithm in detail.", "marks": 999, "page": 9},
        {
            "question_text": "Discuss photosynthesis in tropical rainforests thoroughly.",
            "page": 1,
        },  # invented
        {"question_text": "  ", "marks": 1},
        {"question_text": "Hi"},
        "not a dict",
    ]
    kept = validate_questions(raw, page_count=2, paper_text=paper)
    assert [(q.text[:10], q.marks, q.page) for q in kept] == [
        ("Explain ho", 5, 1),
        ("Describe t", None, None),  # marks out of range and page outside the paper are dropped
    ]
    assert validate_questions("nope", 1, paper) == []


# --- through the API

STUDY = {
    "Arrays": (
        "Arrays store elements in contiguous memory and every element is reached by its index."
    ),
    "Recursion": (
        "Recursion is a function that calls itself, needing a base case to stop the stack frames."
    ),
    "Sorting": (
        "Sorting algorithms such as quicksort and mergesort order items by comparison with a pivot."
    ),
}


def _study_pdf(path):  # type: ignore[no-untyped-def]
    doc = pymupdf.open()
    for text in STUDY.values():
        doc.new_page().insert_textbox(pymupdf.Rect(50, 50, 550, 800), (text + " ") * 6, fontsize=11)
    doc.set_toc([[1, name, i + 1] for i, name in enumerate(STUDY)])
    doc.save(path)
    doc.close()
    return path


QUESTIONS = {
    "recursion": (
        "Explain how recursion lets a function call itself, "
        "and why a base case must stop the stack frames."
    ),
    "sorting": (
        "Compare quicksort and mergesort: how does each order items by comparison with a pivot?"
    ),
    "arrays": (
        "Describe how arrays store elements in contiguous memory "
        "so that each element is reached by index."
    ),
    "odd": "Zebra giraffes migrate across savannah grasslands during seasonal monsoon rainfall.",
}


def _paper(
    client, title: str, year: int | None, keys: list[str], marks: dict[str, int] | None = None
):  # type: ignore[no-untyped-def]
    text = "\n".join(QUESTIONS[k] for k in keys)
    form = {"kind": "past_paper", "title": title}
    if year:
        form["exam_year"] = str(year)
    response = client.post(
        "/api/v1/documents",
        files={"file": (f"{title}.pdf", make_pdf([text]), "application/pdf")},
        data=form,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _reply(keys: list[str], marks: dict[str, int] | None = None) -> dict:
    return {
        "questions": [
            {"question_text": QUESTIONS[k], "marks": (marks or {}).get(k), "page": 1} for k in keys
        ]
    }


@pytest.fixture
def student(client, tmp_path):  # type: ignore[no-untyped-def]
    register(client)
    path = _study_pdf(tmp_path / "study.pdf")
    client.post(
        "/api/v1/documents",
        files={"file": ("study.pdf", path.read_bytes(), "application/pdf")},
        data={"title": "Course notes", "kind": "textbook"},
    )
    return client


def _three_papers(client, fake_groq):  # type: ignore[no-untyped-def]
    layout = [
        ("Paper 2023", 2023, ["recursion", "sorting"]),
        ("Paper 2024", 2024, ["recursion", "arrays", "odd"]),
        ("Paper 2025", 2025, ["recursion", "sorting"]),
    ]
    for title, year, keys in layout:
        _paper(client, title, year, keys)
    # papers are read newest first
    for _, _, keys in sorted(layout, key=lambda t: -t[1]):
        fake_groq.replies.append(_reply(keys, {"recursion": 10}))


def test_no_papers_says_how_to_add_them(student) -> None:  # type: ignore[no-untyped-def]
    body = student.get("/api/v1/exam-predictor").json()
    assert body["status"] == "no_papers" and body["topics"] == []
    assert "Past paper" in body["message"] and body["disclaimer"].startswith("Based only on")


def test_one_paper_is_not_enough_to_predict(student, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _paper(student, "Only paper", 2024, ["recursion"])
    body = student.get("/api/v1/exam-predictor").json()
    assert body["status"] == "need_more_papers" and "Add more past papers" in body["message"]
    assert body["min_papers"] == 2 and body["topics"] == []
    assert fake_groq.calls == []


def test_papers_are_read_once_then_topics_are_ranked_with_their_evidence(
    student, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    before = student.get("/api/v1/exam-predictor").json()
    assert before["pending_papers"] == 3 and before["topics"] == []
    assert len(fake_groq.calls) == 0  # a plain GET never calls the model

    body = student.post("/api/v1/exam-predictor/analyse").json()
    assert body["status"] == "ok" and body["pending_papers"] == 0 and body["failed_papers"] == 0
    assert len(fake_groq.calls) == 3
    assert [t["name"] for t in body["topics"]][0] == "Recursion"
    recursion = body["topics"][0]
    assert (recursion["papers_with_topic"], recursion["total_papers"]) == (3, 3)
    assert recursion["label"] == "High" and recursion["score"] >= 70
    assert recursion["explanation"].startswith("Appeared in 3 of 3 papers, most recently 2025")
    assert recursion["total_marks"] == 30
    titles = {e["paper_title"] for e in recursion["evidence"]}
    assert titles == {"Paper 2023", "Paper 2024", "Paper 2025"}
    first = recursion["evidence"][0]
    assert first["text"] == QUESTIONS["recursion"] and first["page_number"] == 1
    assert first["paper_year"] in (2023, 2024, 2025) and first["similarity"] > 0

    by_name = {t["name"]: t for t in body["topics"]}
    assert (
        by_name["Sorting"]["papers_with_topic"] == 2 and by_name["Arrays"]["papers_with_topic"] == 1
    )
    assert by_name["Recursion"]["score"] > by_name["Sorting"]["score"] > by_name["Arrays"]["score"]
    # the real question that fits no topic is listed apart, never forced into one
    assert [u["text"] for u in body["unmatched"]] == [QUESTIONS["odd"]]
    assert all(QUESTIONS["odd"] != e["text"] for t in body["topics"] for e in t["evidence"])

    # a second call reads nothing again
    again = student.post("/api/v1/exam-predictor/analyse").json()
    assert len(fake_groq.calls) == 3
    assert [t["name"] for t in again["topics"]] == [t["name"] for t in body["topics"]]
    assert db.query(PastPaperQuestion).count() == 7


def test_a_paper_that_cannot_be_read_is_tried_again_next_time(student, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _paper(student, "Paper A", 2024, ["recursion"])
    _paper(student, "Paper B", 2023, ["sorting"])
    fake_groq.replies.extend([LLMOutputError("bad"), LLMOutputError("bad")])  # paper A, both tries
    fake_groq.replies.append(_reply(["sorting"]))  # paper B
    first = student.post("/api/v1/exam-predictor/analyse").json()
    assert first["failed_papers"] == 1 and first["pending_papers"] == 1
    fake_groq.replies.append(_reply(["recursion"]))
    second = student.post("/api/v1/exam-predictor/analyse").json()
    assert second["failed_papers"] == 0 and second["pending_papers"] == 0


def test_an_unavailable_model_is_a_friendly_503(student, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _paper(student, "Paper A", 2024, ["recursion"])
    _paper(student, "Paper B", 2023, ["sorting"])
    fake_groq.replies.append(LLMUnavailableError("busy"))
    assert student.post("/api/v1/exam-predictor/analyse").status_code == 503


def test_only_past_papers_are_read(student, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    student.post("/api/v1/exam-predictor/analyse")
    assert all("<paper>" in c["user"] for c in fake_groq.calls)
    docs = student.get("/api/v1/documents").json()["items"]
    assert sum(1 for d in docs if d["kind"] == "past_paper") == 3


def test_without_study_material_there_is_nothing_to_match_to(client, fake_groq) -> None:  # type: ignore[no-untyped-def]
    register(client)
    _paper(client, "Paper A", 2024, ["recursion"])
    _paper(client, "Paper B", 2023, ["sorting"])
    fake_groq.replies.extend([_reply(["recursion"]), _reply(["sorting"])])
    body = client.post("/api/v1/exam-predictor/analyse").json()
    assert body["status"] == "no_topics" and "notes or textbooks" in body["message"]


def test_a_student_never_sees_anothers_papers(client_factory, tmp_path, fake_groq) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    _paper(a, "Mine", 2024, ["recursion"])
    _paper(a, "Mine 2", 2023, ["sorting"])
    register(b, "b@example.com")
    body = b.get("/api/v1/exam-predictor").json()
    assert body["status"] == "no_papers" and body["papers"] == []


def test_the_exam_predictor_needs_signing_in(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/exam-predictor").status_code == 401
    assert client.post("/api/v1/exam-predictor/analyse").status_code == 401


# --- the Course Map


def _make_weak(db, topic_name: str):  # type: ignore[no-untyped-def]
    from app.models.quiz import Topic

    topic = db.scalar(select(Topic).where(Topic.name == topic_name))
    db.add(
        TopicProgress(user_id=topic.user_id, topic_id=topic.id, attempt_count=10, correct_count=2)
    )
    db.flush()
    return topic


def test_a_predicted_high_topic_the_student_is_weak_in_goes_first_as_likely_in_exam(
    student, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    student.post("/api/v1/exam-predictor/analyse")
    _make_weak(db, "Recursion")
    _make_weak(db, "Arrays")  # weaker topic, but not predicted High
    steps = student.get("/api/v1/learning-path").json()["steps"]
    assert steps[0]["name"] == "Recursion" and steps[0]["priority_reason"] == "Likely in exam"
    assert steps[1]["name"] == "Arrays" and steps[1]["priority_reason"] is None


def test_a_predicted_high_topic_the_student_knows_is_left_where_it_is(
    student, fake_groq, db
) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    student.post("/api/v1/exam-predictor/analyse")
    steps = student.get("/api/v1/learning-path").json()["steps"]
    assert [s["name"] for s in steps] == ["Arrays", "Recursion", "Sorting"]
    assert all(s["priority_reason"] is None for s in steps)


def test_pinning_a_topic_puts_it_first_and_unpinning_puts_it_back(student, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    body = student.post("/api/v1/exam-predictor/analyse").json()
    sorting = next(t for t in body["topics"] if t["name"] == "Sorting")
    pinned = student.put(
        f"/api/v1/exam-predictor/topics/{sorting['topic_id']}/priority", json={"pinned": True}
    )
    assert pinned.status_code == 200 and pinned.json()["pinned"] is True
    steps = student.get("/api/v1/learning-path").json()["steps"]
    assert steps[0]["name"] == "Sorting" and steps[0]["priority_reason"] == "Added to your priority"
    assert next(
        t for t in student.get("/api/v1/exam-predictor").json()["topics"] if t["name"] == "Sorting"
    )["pinned"]

    student.put(
        f"/api/v1/exam-predictor/topics/{sorting['topic_id']}/priority", json={"pinned": False}
    )
    assert student.get("/api/v1/learning-path").json()["steps"][0]["name"] == "Arrays"


def test_a_pinned_topic_survives_a_new_prediction(student, fake_groq, db) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    topics = student.post("/api/v1/exam-predictor/analyse").json()["topics"]
    arrays = next(t for t in topics if t["name"] == "Arrays")
    student.put(
        f"/api/v1/exam-predictor/topics/{arrays['topic_id']}/priority", json={"pinned": True}
    )
    student.get("/api/v1/exam-predictor")
    assert db.scalar(
        select(ExamTopicScore).where(ExamTopicScore.topic_id == uuid.UUID(arrays["topic_id"]))
    ).pinned


def test_only_your_own_topics_can_be_pinned(client_factory, student, fake_groq) -> None:  # type: ignore[no-untyped-def]
    _three_papers(student, fake_groq)
    topic = student.post("/api/v1/exam-predictor/analyse").json()["topics"][0]["topic_id"]
    other = client_factory()
    register(other, "other@example.com")
    assert (
        other.put(
            f"/api/v1/exam-predictor/topics/{topic}/priority", json={"pinned": True}
        ).status_code
        == 404
    )
