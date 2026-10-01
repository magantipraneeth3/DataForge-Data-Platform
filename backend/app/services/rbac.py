from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.user import User


ROLE_PERMISSIONS = {
    "admin": {
        "dataset:create",
        "dataset:read",
        "dataset:update",
        "dataset:delete",
        "pipeline:run",
        "analytics:read",
        "admin:manage",
    },
    "data_engineer": {
        "dataset:create",
        "dataset:read",
        "dataset:update",
        "dataset:delete",
        "pipeline:run",
        "analytics:read",
    },
    "analyst": {
        "dataset:read",
        "analytics:read",
    },
}


def normalize_role(role: str | None) -> str:
    if role is None:
        return "analyst"
    normalized = str(role).strip().lower()
    normalized = normalized.replace(" ", "_")
    if normalized in {"dataengineer", "data_engineer"}:
        return "data_engineer"
    if normalized not in ROLE_PERMISSIONS:
        return "analyst"
    return normalized


async def get_effective_role(
    user: User,
    db: AsyncSession,
) -> str:
    admin_assignment = await db.scalar(
        select(Role.id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == user.id,
            func.lower(func.trim(Role.name)) == "admin",
            Role.is_active.is_(True),
        )
        .limit(1)
    )

    if admin_assignment:
        return "admin"

    return normalize_role(user.role)


def require_permission(permission_name: str):
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        role = await get_effective_role(current_user, db)
        if permission_name not in ROLE_PERMISSIONS.get(role, set()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {permission_name}",
            )
        return current_user

    return permission_checker