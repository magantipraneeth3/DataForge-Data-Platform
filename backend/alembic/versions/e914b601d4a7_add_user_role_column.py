from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e914b601d4a7"
down_revision: Union[str, Sequence[str], None] = "f0c2117f38d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=50),
            server_default="analyst",
            nullable=False,
        ),
    )
    op.create_index("ix_users_role", "users", ["role"])


def downgrade() -> None:
    op.drop_index("ix_users_role", table_name="users")
    op.drop_column("users", "role")