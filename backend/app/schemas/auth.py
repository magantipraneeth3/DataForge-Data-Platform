from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserRole(str, Enum):
    ADMIN = "admin"
    DATA_ENGINEER = "data_engineer"
    ANALYST = "analyst"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    organization_name: str | None = Field(default=None, min_length=2, max_length=150)
    organization_slug: str | None = Field(default=None, min_length=2, max_length=100)
    role: UserRole

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value):
        if value is None:
            return UserRole.ANALYST

        if isinstance(value, str):
            normalized = value.strip().lower().replace(" ", "_")
            aliases = {
                "dataengineer": UserRole.DATA_ENGINEER.value,
                "data_engineer": UserRole.DATA_ENGINEER.value,
                "analyst": UserRole.ANALYST.value,
            }
            if normalized in {"admin", UserRole.ADMIN.value}:
                raise ValueError(
                    "Public registration is limited to Data Engineer and Analyst roles. Admin access is restricted."
                )

            mapped = aliases.get(normalized, normalized)
            if mapped not in {UserRole.DATA_ENGINEER.value, UserRole.ANALYST.value}:
                raise ValueError(
                    "Public registration is limited to Data Engineer and Analyst roles. Admin access is restricted."
                )

            return mapped

        if value in {UserRole.ADMIN}:
            raise ValueError(
                "Public registration is limited to Data Engineer and Analyst roles. Admin access is restricted."
            )

        if value not in {UserRole.DATA_ENGINEER, UserRole.ANALYST}:
            raise ValueError(
                "Public registration is limited to Data Engineer and Analyst roles. Admin access is restricted."
            )

        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    first_name: str
    last_name: str
    organization_id: UUID
    is_active: bool
    role: str

    model_config = {
        "from_attributes": True,
    }