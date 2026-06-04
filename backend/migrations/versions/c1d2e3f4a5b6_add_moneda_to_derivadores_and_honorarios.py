"""add_moneda_to_derivadores_and_honorarios

Revision ID: c1d2e3f4a5b6
Revises: b4e1c2d3f5a6
Create Date: 2026-06-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b4e1c2d3f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('derivadores', sa.Column('moneda', sa.String(3), nullable=False, server_default='CLP'))
    op.add_column('honorarios', sa.Column('moneda', sa.String(3), nullable=False, server_default='CLP'))


def downgrade() -> None:
    op.drop_column('honorarios', 'moneda')
    op.drop_column('derivadores', 'moneda')
