from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a91f0c5d7e32"
down_revision: Union[str, Sequence[str], None] = "e914b601d4a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "data_quality_results",
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_data_quality_results_created_by_users",
        "data_quality_results",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_data_quality_results_created_by",
        "data_quality_results",
        ["created_by"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_data_quality_results_created_by",
        table_name="data_quality_results",
    )
    op.drop_constraint(
        "fk_data_quality_results_created_by_users",
        "data_quality_results",
        type_="foreignkey",
    )
    op.drop_column("data_quality_results", "created_by")