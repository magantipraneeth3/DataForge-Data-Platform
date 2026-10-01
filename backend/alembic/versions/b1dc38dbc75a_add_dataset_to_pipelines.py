"""add dataset to pipelines

Revision ID: b1dc38dbc75a
Revises: d69e98c49fe8
Create Date: 2026-09-29 18:58:30.273132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1dc38dbc75a'
down_revision: Union[str, Sequence[str], None] = 'd69e98c49fe8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
