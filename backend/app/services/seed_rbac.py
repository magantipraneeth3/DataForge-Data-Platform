import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission


ROLES = {
    "Admin": "Full access to the DataForge platform",
    "Data Engineer": "Manage datasets and data pipelines",
    "Analyst": "Read analytics and datasets",
}

PERMISSIONS = [
    "dataset:create",
    "dataset:read",
    "dataset:update",
    "dataset:delete",
    "pipeline:run",
    "analytics:read",
]


ROLE_PERMISSIONS = {
    "Admin": PERMISSIONS,

    "Data Engineer": [
        "dataset:create",
        "dataset:read",
        "dataset:update",
        "dataset:delete",
        "pipeline:run",
        "analytics:read",
    ],

    "Analyst": [
        "dataset:read",
        "analytics:read",
    ],
}


async def seed_rbac():
    async with AsyncSessionLocal() as db:

        # Create permissions
        permission_map = {}

        for permission_name in PERMISSIONS:
            permission = await db.scalar(
                select(Permission).where(
                    Permission.name == permission_name
                )
            )

            if not permission:
                permission = Permission(
                    name=permission_name,
                    description=f"Permission to {permission_name.replace(':', ' ')}",
                )
                db.add(permission)
                await db.flush()

            permission_map[permission_name] = permission

        # Create roles
        role_map = {}

        for role_name, description in ROLES.items():
            role = await db.scalar(
                select(Role).where(Role.name == role_name)
            )

            if not role:
                role = Role(
                    name=role_name,
                    description=description,
                )
                db.add(role)
                await db.flush()

            role_map[role_name] = role

        # Connect roles to permissions
        for role_name, permission_names in ROLE_PERMISSIONS.items():

            role = role_map[role_name]

            for permission_name in permission_names:

                permission = permission_map[permission_name]

                existing = await db.scalar(
                    select(RolePermission).where(
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == permission.id,
                    )
                )

                if not existing:
                    db.add(
                        RolePermission(
                            role_id=role.id,
                            permission_id=permission.id,
                        )
                    )

        await db.commit()

        print("RBAC seed completed successfully.")
        print()
        print("Roles:")
        for role_name in ROLES:
            print(f"  - {role_name}")

        print()
        print("Permissions:")
        for permission_name in PERMISSIONS:
            print(f"  - {permission_name}")


if __name__ == "__main__":
    asyncio.run(seed_rbac())