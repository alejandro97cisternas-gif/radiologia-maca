"""allow multiple informes per examen

Revision ID: e1f2a3b4c5d6
Revises: d4e5f6a7b8c9
Create Date: 2026-06-10

"""
from alembic import op

revision = 'e1f2a3b4c5d6'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('informes_examen_id_key', 'informes', type_='unique')


def downgrade():
    op.create_unique_constraint('informes_examen_id_key', 'informes', ['examen_id'])
