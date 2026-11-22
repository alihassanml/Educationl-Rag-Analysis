import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, TeacherUser
from app.schemas.classes import (
    ClassCreate,
    ClassDetail,
    ClassSummary,
    JoinClass,
    ShareDocument,
)
from app.services import class_service

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[ClassSummary])
def list_classes(user: CurrentUser, db: DbSession) -> list[ClassSummary]:
    return class_service.list_classes(db, user)


@router.post("", response_model=ClassSummary, status_code=status.HTTP_201_CREATED)
def create_class(body: ClassCreate, teacher: TeacherUser, db: DbSession) -> ClassSummary:
    classroom = class_service.create_class(db, teacher, body.name)
    return class_service.summary(db, classroom, teacher)


@router.post("/join", response_model=ClassSummary)
def join_class(body: JoinClass, user: CurrentUser, db: DbSession) -> ClassSummary:
    classroom = class_service.join(db, user, body.join_code)
    return class_service.summary(db, classroom, user)


@router.get("/{class_id}", response_model=ClassDetail)
def get_class(class_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ClassDetail:
    return class_service.detail(db, user, class_id)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(class_id: uuid.UUID, teacher: TeacherUser, db: DbSession) -> None:
    class_service.delete_class(db, teacher, class_id)


@router.delete("/{class_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_class(class_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    class_service.leave(db, user, class_id)


@router.delete("/{class_id}/members/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    class_id: uuid.UUID, student_id: uuid.UUID, teacher: TeacherUser, db: DbSession
) -> None:
    class_service.remove_member(db, teacher, class_id, student_id)


@router.post("/{class_id}/documents", status_code=status.HTTP_204_NO_CONTENT)
def share_document(
    class_id: uuid.UUID, body: ShareDocument, teacher: TeacherUser, db: DbSession
) -> None:
    class_service.share_document(db, teacher, class_id, body.document_id)


@router.delete("/{class_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def unshare_document(
    class_id: uuid.UUID, document_id: uuid.UUID, teacher: TeacherUser, db: DbSession
) -> None:
    class_service.unshare_document(db, teacher, class_id, document_id)
