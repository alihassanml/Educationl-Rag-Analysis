"""What a teacher sees about a class: shared documents, weak topics, and each member's progress.

Teachers see topic progress of their own class members only. They never see a student's
documents, chats or quiz answers, and a class-wide topic figure appears only when enough students
are behind it.
"""

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.classroom import ClassMember
from app.models.quiz import Topic, TopicProgress
from app.models.user import User
from app.schemas.teacher import ClassInsights, ClassTopic, StudentRow, StudentTopic
from app.services import class_service, recommendation_service


def insights(db: Session, teacher: User, class_id: uuid.UUID) -> ClassInsights:
    classroom = class_service.get_teacher_class(db, teacher.id, class_id)
    min_students = get_settings().class_min_students_for_aggregates

    members = db.execute(
        select(User.id, User.display_name)
        .join(ClassMember, ClassMember.student_id == User.id)
        .where(ClassMember.class_id == classroom.id)
        .order_by(User.display_name, User.id)
    ).all()
    member_ids = [m[0] for m in members]

    rows = (
        db.execute(
            select(TopicProgress, Topic.name)
            .join(Topic, Topic.id == TopicProgress.topic_id)
            .where(TopicProgress.user_id.in_(member_ids), TopicProgress.attempt_count > 0)
            .order_by(Topic.name, TopicProgress.id)
        ).all()
        if member_ids
        else []
    )

    by_student: dict[uuid.UUID, list[StudentTopic]] = defaultdict(list)
    # normalised topic name -> [display name, students, correct, attempted]
    totals: dict[str, list] = {}
    for progress, name in rows:
        status = recommendation_service.classify(progress.correct_count, progress.attempt_count)
        by_student[progress.user_id].append(
            StudentTopic(
                topic=name,
                status=status,
                level=progress.current_difficulty,
                accuracy=recommendation_service.percent(
                    progress.correct_count, progress.attempt_count
                ),
                attempted=progress.attempt_count,
            )
        )
        entry = totals.setdefault(name.strip().lower(), [name, 0, 0, 0])
        entry[1] += 1
        entry[2] += progress.correct_count
        entry[3] += progress.attempt_count

    topics: list[ClassTopic] = []
    hidden = 0
    for name, students, correct, attempted in totals.values():
        if students < min_students:
            hidden += 1
            continue
        status = recommendation_service.classify(correct, attempted)
        topics.append(
            ClassTopic(
                topic=name,
                students=students,
                accuracy=round(100 * correct / attempted),
                status=status,
                weak=status == recommendation_service.NEEDS_REVISION,
            )
        )
    topics.sort(key=lambda t: (t.accuracy, t.topic.lower()))

    return ClassInsights(
        class_id=classroom.id,
        class_name=classroom.name,
        student_count=len(members),
        min_students=min_students,
        topics=topics,
        topics_hidden=hidden,
        students=[
            StudentRow(student_id=i, display_name=n, topics=by_student.get(i, []))
            for i, n in members
        ],
    )
