import asyncio
from getpass import getpass

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


async def reset_admin_password() -> None:
    async with AsyncSessionLocal() as db:
        admins = list(
            (
                await db.scalars(
                    select(User)
                    .join(UserRole, UserRole.user_id == User.id)
                    .join(Role, Role.id == UserRole.role_id)
                    .where(
                        func.lower(func.trim(Role.name)) == "admin",
                        Role.is_active.is_(True),
                        User.is_active.is_(True),
                    )
                    .distinct()
                )
            ).all()
        )

        if len(admins) != 1:
            raise RuntimeError(
                f"Expected one active Admin account; found {len(admins)}."
            )

        admin = admins[0]
        print(f"Admin login ID: {admin.email}")
        password = getpass("New Admin password (12+ characters): ")
        confirmation = getpass("Confirm new Admin password: ")

        if len(password) < 12:
            raise ValueError("Admin password must be at least 12 characters.")
        if password != confirmation:
            raise ValueError("The passwords do not match.")

        admin.role = "admin"
        admin.password_hash = hash_password(password)
        await db.commit()

        print("Admin password updated. The password was not displayed.")


if __name__ == "__main__":
    asyncio.run(reset_admin_password())
