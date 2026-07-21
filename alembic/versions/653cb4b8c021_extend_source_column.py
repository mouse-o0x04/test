"""extend source column to support multiple values

Revision ID: 653cb4b8c021
Revises: 001
Create Date: 2026-07-12 17:31:21
"""
from alembic import op
import sqlalchemy as sa

revision = '653cb4b8c021'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('orders', 'source', existing_type=sa.String(100), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('orders', 'source', existing_type=sa.Text(), type_=sa.String(100), existing_nullable=True)
