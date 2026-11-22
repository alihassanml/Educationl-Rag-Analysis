from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, EmbedderDep, LLMDep
from app.schemas.notifications import DueTopicOut, StartSlipTestRequest
from app.schemas.quizzes import QuizDetail
from app.services import reminder_service

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("/due-topics", response_model=list[DueTopicOut])
def get_due_topics(
    user: CurrentUser,
    db: DbSession,
) -> list[DueTopicOut]:
    return reminder_service.get_due_topics(db=db, user_id=user.id)


@router.post("/slip-tests", response_model=QuizDetail)
def generate_slip_test(
    body: StartSlipTestRequest,
    user: CurrentUser,
    db: DbSession,
    embedder: EmbedderDep,
    llm: LLMDep,
) -> QuizDetail:
    return reminder_service.generate_slip_test(
        db=db,
        embedder=embedder,
        llm=llm,
        user_id=user.id,
        topic_name=body.topic,
    )
