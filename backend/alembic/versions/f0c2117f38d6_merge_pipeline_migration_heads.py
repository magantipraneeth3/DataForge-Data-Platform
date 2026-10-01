"""merge pipeline migration heads

Revision ID: f0c2117f38d6
Revises: ADD_DATASET_TO_PIPELINES, b1dc38dbc75a
Create Date: 2026-09-29 19:07:00.400634

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0c2117f38d6'
down_revision: Union[str, Sequence[str], None] = ('3d18e2fe9861', 'b1dc38dbc75a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
