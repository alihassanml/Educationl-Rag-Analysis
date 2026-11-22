"""Classes: a teacher shares documents, students join with a code and may then read them."""

import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models.classroom import ClassDocument, ClassMember, Classroom
from app.models.document import Document
from app.models.user import ROLE_STUDENT, User
from app.schemas.classes import ClassDetail, ClassSummary, MemberOut, SharedDocument

# No 0/O or 1/I/L, so a code read aloud or off a slide is hard to get wrong
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def new_join_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


def create_class(db: Session, teacher: User, name: str) -> Classroom:
    for _ in range(5):
        classroom = Classroom(teacher_id=teacher.id, name=name, join_code=new_join_code())
        db.add(classroom)
        try:
            db.commit()
        except IntegrityError:  # a code collision: pick another
            db.rollback()
            continue
        return classroom
    raise AppError(500, "join_code_failed", "Could not create a class code. Please try again")


def get_teacher_class(db: Session, teacher_id: uuid.UUID, class_id: uuid.UUID) -> Classroom:
    classroom = db.scalar(
        select(Classroom).where(Classroom.id == class_id, Classroom.teacher_id == teacher_id)
    )
    if classroom is None:
        raise NotFoundError("Class")
    return classroom


def _is_member(db: Session, class_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(ClassMember.class_id).where(
                ClassMember.class_id == class_id, ClassMember.student_id == user_id
            )
        )
        is not None
    )


def get_visible_class(db: Session, user: User, class_id: uuid.UUID) -> Classroom:
    """The class if the user teaches it or is a member; otherwise act as if it does not exist."""
    classroom = db.get(Classroom, class_id)
    if classroom is None or not (
        classroom.teacher_id == user.id or _is_member(db, class_id, user.id)
    ):
        raise NotFoundError("Class")
    return classroom


def summary(db: Session, classroom: Classroom, viewer: User) -> ClassSummary:
    teacher = db.get(User, classroom.teacher_id)
    members = db.scalar(
        select(func.count()).select_from(ClassMember).where(ClassMember.class_id == classroom.id)
    )
    documents = db.scalar(
        select(func.count())
        .select_from(ClassDocument)
        .where(ClassDocument.class_id == classroom.id)
    )
    return ClassSummary(
        id=classroom.id,
        name=classroom.name,
        teacher_name=teacher.display_name if teacher else "",
        member_count=members or 0,
        document_count=documents or 0,
        created_at=classroom.created_at,
        join_code=classroom.join_code if classroom.teacher_id == viewer.id else None,
    )


def list_classes(db: Session, user: User) -> list[ClassSummary]:
    """A teacher's own classes, or the classes a student has joined."""
    if user.role == ROLE_STUDENT:
        stmt = (
            select(Classroom)
            .join(ClassMember, ClassMember.class_id == Classroom.id)
            .where(ClassMember.student_id == user.id)
        )
    else:
        stmt = select(Classroom).where(Classroom.teacher_id == user.id)
    rows = db.scalars(stmt.order_by(Classroom.created_at.desc(), Classroom.id)).all()
    return [summary(db, c, user) for c in rows]


def class_documents(db: Session, class_id: uuid.UUID) -> list[SharedDocument]:
    rows = db.execute(
        select(Document, ClassDocument.shared_at)
        .join(ClassDocument, ClassDocument.document_id == Document.id)
        .where(ClassDocument.class_id == class_id)
        .order_by(ClassDocument.shared_at.desc(), Document.id)
    ).all()
    return [
        SharedDocument(
            id=d.id,
            title=d.title,
            kind=d.kind,
            status=d.status,
            page_count=d.page_count,
            shared_at=shared_at,
        )
        for d, shared_at in rows
    ]


def class_members(db: Session, class_id: uuid.UUID) -> list[MemberOut]:
    rows = db.execute(
        select(User.id, User.display_name, ClassMember.joined_at)
        .join(ClassMember, ClassMember.student_id == User.id)
        .where(ClassMember.class_id == class_id)
        .order_by(ClassMember.joined_at, User.id)
    ).all()
    return [MemberOut(student_id=i, display_name=n, joined_at=j) for i, n, j in rows]


def detail(db: Session, user: User, class_id: uuid.UUID) -> ClassDetail:
    classroom = get_visible_class(db, user, class_id)
    head = summary(db, classroom, user)
    is_teacher = classroom.teacher_id == user.id
    return ClassDetail(
        **head.model_dump(),
        documents=class_documents(db, classroom.id),
        members=class_members(db, classroom.id) if is_teacher else [],
    )


def join(db: Session, student: User, join_code: str) -> Classroom:
    if student.role != ROLE_STUDENT:
        raise AppError(403, "forbidden", "Only student accounts can join a class")
    classroom = db.scalar(select(Classroom).where(Classroom.join_code == join_code))
    if classroom is None:
        raise NotFoundError("Class")
    if not _is_member(db, classroom.id, student.id):
        db.add(ClassMember(class_id=classroom.id, student_id=student.id))
        db.commit()
    return classroom


def leave(db: Session, student: User, class_id: uuid.UUID) -> None:
    member = db.get(ClassMember, (class_id, student.id))
    if member is None:
        raise NotFoundError("Class")
    db.delete(member)
    db.commit()


def remove_member(db: Session, teacher: User, class_id: uuid.UUID, student_id: uuid.UUID) -> None:
    get_teacher_class(db, teacher.id, class_id)
    member = db.get(ClassMember, (class_id, student_id))
    if member is None:
        raise NotFoundError("Member")
    db.delete(member)
    db.commit()


def delete_class(db: Session, teacher: User, class_id: uuid.UUID) -> None:
    db.delete(get_teacher_class(db, teacher.id, class_id))
    db.commit()


def share_document(db: Session, teacher: User, class_id: uuid.UUID, document_id: uuid.UUID) -> None:
    get_teacher_class(db, teacher.id, class_id)
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.user_id == teacher.id)
    )
    if document is None:  # only the teacher's own documents can be shared
        raise NotFoundError("Document")
    if db.get(ClassDocument, (class_id, document_id)) is None:
        db.add(ClassDocument(class_id=class_id, document_id=document_id))
        db.commit()


def unshare_document(
    db: Session, teacher: User, class_id: uuid.UUID, document_id: uuid.UUID
) -> None:
    get_teacher_class(db, teacher.id, class_id)
    link = db.get(ClassDocument, (class_id, document_id))
    if link is None:
        raise NotFoundError("Document")
    db.delete(link)
    db.commit()
