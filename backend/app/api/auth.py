from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRole,
    UserResponse,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


def _normalize_slug(value: str) -> str:
    normalized = "".join(
        ch.lower() if ch.isalnum() else "-" for ch in value.strip()
    )
    normalized = "-".join(part for part in normalized.split("-") if part)
    return normalized or f"org-{uuid4().hex[:8]}"


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    if request.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Public registration is limited to Data Engineer and Analyst roles. Admin access is restricted.",
        )

    email = request.email.lower().strip()
    existing_user = await db.scalar(select(User).where(User.email == email))

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    organization_name = (
        request.organization_name.strip()
        if request.organization_name and request.organization_name.strip()
        else f"{request.first_name.strip()}'s Organization"
    )

    organization_slug = (
        request.organization_slug.strip()
        if request.organization_slug and request.organization_slug.strip()
        else f"{request.first_name.lower().strip()}-{uuid4().hex[:8]}"
    )

    final_slug = _normalize_slug(organization_slug)

    while True:
        existing_organization = await db.scalar(
            select(Organization).where(Organization.slug == final_slug)
        )
        if not existing_organization:
            break
        final_slug = f"{final_slug}-{uuid4().hex[:4]}"

    organization = Organization(
        name=organization_name,
        slug=final_slug,
    )
    db.add(organization)
    await db.flush()

    user = User(
        organization_id=organization.id,
        email=email,
        password_hash=hash_password(request.password),
        first_name=request.first_name.strip(),
        last_name=request.last_name.strip(),
        role=request.role.value,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.post(
    "/login",
    response_model=TokenResponse,
)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(
        select(User).where(User.email == request.email.lower().strip())
    )

    if not user or not verify_password(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    access_token = create_access_token(
        subject=str(user.id),
        organization_id=str(user.organization_id),
    )

    return TokenResponse(
        access_token=access_token,
    )