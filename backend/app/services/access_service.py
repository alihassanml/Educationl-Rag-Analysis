"""Which documents a user may read: their own, plus those a teacher shared with a class they joined.

One rule, used by retrieval, scope checks, the document endpoint and Teacher-Clone mode. Shared
documents are read-only: changing or deleting a document still needs ownership.
"""

import uuid

from sqlalchemy import ColumnElement, or_, select

from app.models.classroom import ClassDocument, ClassMember
from app.models.document import Document


def readable_documents(user_id: uuid.UUID) -> ColumnElement[bool]:
    """SQL condition on `Document`: owned by the user, or shared with one of their classes."""
    shared = (
        select(ClassDocument.document_id)
        .join(ClassMember, ClassMember.class_id == ClassDocument.class_id)
        .where(ClassMember.student_id == user_id)
    )
    return or_(Document.user_id == user_id, Document.id.in_(shared))


def shared_with(user_id: uuid.UUID) -> ColumnElement[bool]:
    """SQL condition on `Document`: shared with the user's classes (not their own uploads)."""
    shared = (
        select(ClassDocument.document_id)
        .join(ClassMember, ClassMember.class_id == ClassDocument.class_id)
        .where(ClassMember.student_id == user_id)
    )
    return Document.id.in_(shared)
