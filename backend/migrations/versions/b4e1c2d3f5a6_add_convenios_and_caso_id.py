"""add_convenios_and_caso_id

Revision ID: b4e1c2d3f5a6
Revises: 953371e62acc
Create Date: 2026-06-02

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b4e1c2d3f5a6'
down_revision: Union[str, Sequence[str], None] = '953371e62acc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('examenes', sa.Column('caso_id', sa.String(), nullable=True))
    op.create_index('ix_examenes_caso_id', 'examenes', ['caso_id'], unique=False)

    op.create_table(
        'convenios',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('radiologo_id', sa.Integer(), sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('derivador_id', sa.Integer(), sa.ForeignKey('derivadores.id'), nullable=True),
        sa.Column('categoria', sa.String(), nullable=False),
        sa.Column('descuento_2', sa.Numeric(10, 0), nullable=False, server_default='0'),
        sa.Column('descuento_3', sa.Numeric(10, 0), nullable=False, server_default='0'),
        sa.Column('activo', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('creado_en', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('convenios')
    op.drop_index('ix_examenes_caso_id', 'examenes')
    op.drop_column('examenes', 'caso_id')
