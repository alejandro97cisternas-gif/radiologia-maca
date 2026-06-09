"""add_portal_token_slug_to_derivadores

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import uuid
import re
import unicodedata


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(text: str) -> str:
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-') or 'derivador'


def upgrade() -> None:
    op.add_column('derivadores', sa.Column('portal_token', sa.String(), nullable=True))
    op.add_column('derivadores', sa.Column('portal_slug', sa.String(), nullable=True))
    op.create_index('ix_derivadores_portal_token', 'derivadores', ['portal_token'], unique=True)

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, nombre FROM derivadores")).fetchall()

    slug_counts: dict[str, int] = {}
    for row in rows:
        base = _slugify(row[1])
        count = slug_counts.get(base, 0)
        slug = base if count == 0 else f"{base}-{count + 1}"
        slug_counts[base] = count + 1
        token = str(uuid.uuid4())
        conn.execute(
            sa.text("UPDATE derivadores SET portal_token = :t, portal_slug = :s WHERE id = :id"),
            {"t": token, "s": slug, "id": row[0]},
        )


def downgrade() -> None:
    op.drop_index('ix_derivadores_portal_token', table_name='derivadores')
    op.drop_column('derivadores', 'portal_slug')
    op.drop_column('derivadores', 'portal_token')
