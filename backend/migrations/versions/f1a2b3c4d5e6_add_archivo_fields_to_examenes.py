"""add archivo fields to examenes

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-06-10

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('examenes', sa.Column('ultimo_acceso_en', sa.DateTime(), nullable=True))
    op.add_column('examenes', sa.Column('archivo_estado', sa.String(), nullable=True))
    op.add_column('examenes', sa.Column('archivado_en', sa.DateTime(), nullable=True))
    op.add_column('examenes', sa.Column('ruta_zip', sa.String(), nullable=True))


def downgrade():
    op.drop_column('examenes', 'ruta_zip')
    op.drop_column('examenes', 'archivado_en')
    op.drop_column('examenes', 'archivo_estado')
    op.drop_column('examenes', 'ultimo_acceso_en')
