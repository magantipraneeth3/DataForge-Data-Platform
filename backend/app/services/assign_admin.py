import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


async def assign_admin():
    email = input("Enter your registered user email: ").strip()

    async with AsyncSessionLocal() as db:

        user = await db.scalar(
            select(User).where(User.email == email)
        )

        if not user:
            print("User not found.")
            return

        role = await db.scalar(
            select(Role).where(Role.name == "Admin")
        )

        if not role:
            print("Admin role not found. Run the RBAC seed first.")
            return

        existing_assignment = await db.scalar(
            select(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.role_id == role.id,
            )
        )

        if existing_assignment:
            if user.role != "admin":
                user.role = "admin"
                await db.commit()
            print("User already has the Admin role.")
            return

        db.add(
            UserRole(
                user_id=user.id,
                role_id=role.id,
            )
        )
        user.role = "admin"

        await db.commit()

        print()
        print("Admin role assigned successfully.")
        print(f"User: {user.email}")
        print(f"Role: {role.name}")


if __name__ == "__main__":
    asyncio.run(assign_admin())