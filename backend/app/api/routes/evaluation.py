import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import AdminUser, DbSession, require_admin
from app.evaluation import service
from app.schemas.evaluation import (
    CompareOut,
    DatasetList,
    DatasetOut,
    ResultList,
    ResultOut,
    RunList,
    RunOut,
    StartRunRequest,
)
from app.workers.queue import JobQueue, get_job_queue

router = APIRouter(prefix="/eval", tags=["evaluation"], dependencies=[Depends(require_admin)])


@router.get("/datasets", response_model=DatasetList)
def list_datasets(admin: AdminUser, db: DbSession) -> DatasetList:
    summaries = service.list_datasets(db, admin.id)
    return DatasetList(
        items=[
            DatasetOut(
                id=s.dataset.id,
                name=s.dataset.name,
                item_count=s.item_count,
                answerable_count=s.answerable_count,
                created_at=s.dataset.created_at,
            )
            for s in summaries
        ],
        total=len(summaries),
    )


@router.post("/runs", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
def start_run(
    body: StartRunRequest,
    admin: AdminUser,
    db: DbSession,
    queue: Annotated[JobQueue, Depends(get_job_queue)],
) -> RunOut:
    run = service.start_run(
        db,
        queue,
        admin.id,
        body.dataset_id,
        {"retrieval_mode": body.retrieval_mode, "min_similarity": body.min_similarity},
    )
    return RunOut.from_run(run)


@router.get("/runs", response_model=RunList)
def list_runs(
    admin: AdminUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RunList:
    runs, total = service.list_runs(db, admin.id, limit, offset)
    return RunList(items=[RunOut.from_run(r) for r in runs], total=total)


@router.get("/compare", response_model=CompareOut)
def compare(
    admin: AdminUser,
    db: DbSession,
    runs: Annotated[list[uuid.UUID], Query(min_length=2, max_length=4)],
) -> CompareOut:
    found, diff = service.compare_runs(db, admin.id, runs)
    return CompareOut(runs=[RunOut.from_run(r) for r in found], config_diff=diff)


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: uuid.UUID, admin: AdminUser, db: DbSession) -> RunOut:
    return RunOut.from_run(service.get_run(db, admin.id, run_id))


@router.get("/runs/{run_id}/results", response_model=ResultList)
def list_results(
    run_id: uuid.UUID,
    admin: AdminUser,
    db: DbSession,
    outcome: Literal["all", "failed", "passed"] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ResultList:
    run = service.get_run(db, admin.id, run_id)
    rows, total = service.list_results(db, run, outcome, limit, offset)
    return ResultList(
        items=[
            ResultOut(
                id=r.id,
                question=r.item.question,
                answerable=r.item.answerable,
                question_type=r.item.question_type,
                concept=r.item.concept,
                gold_document_title=r.item.gold_document_title,
                gold_page=r.item.gold_page,
                answered=r.answered,
                passed=r.passed,
                first_relevant_rank=r.first_relevant_rank,
                retrieved=r.retrieved,
                latency_ms=r.latency_ms,
                error=r.error,
            )
            for r in rows
        ],
        total=total,
    )
