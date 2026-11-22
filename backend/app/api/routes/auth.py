from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.rate_limit import login_limit, register_limit
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import Credentials, PreferencesIn, RegisterIn, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.cookie_name,
        create_access_token(user.id, user.role),
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_limit)],
)
def register(body: RegisterIn, response: Response, db: DbSession) -> User:
    user = auth_service.register(db, body.email, body.password, body.display_name, body.role)
    _set_session_cookie(response, user)
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(login_limit)])
def login(body: Credentials, response: Response, db: DbSession) -> User:
    user = auth_service.authenticate(db, body.email, body.password)
    _set_session_cookie(response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(get_settings().cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me/preferences", response_model=UserOut)
def update_preferences(body: PreferencesIn, user: CurrentUser, db: DbSession) -> User:
    if body.lighter_steps_enabled is not None:
        user.lighter_steps_enabled = body.lighter_steps_enabled
    if body.peer_match_opt_in is not None:
        user.peer_match_opt_in = body.peer_match_opt_in
    if body.reminders_enabled is not None:
        user.reminders_enabled = body.reminders_enabled
    if body.reminder_hour_utc is not None:
        user.reminder_hour_utc = body.reminder_hour_utc
    db.commit()
    return user
