import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str) -> str:
        return value.lower()


class RegisterIn(Credentials):
    display_name: str = Field(min_length=2, max_length=60)
    role: Literal["student", "teacher"] = "student"

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Display name must be at least 2 characters")
        if "@" in value:
            raise ValueError("Display name must not be an email address")
        return value


class PreferencesIn(BaseModel):
    lighter_steps_enabled: bool


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    is_admin: bool
    role: str = "student"
    display_name: str = ""
    lighter_steps_enabled: bool = True
    created_at: datetime
