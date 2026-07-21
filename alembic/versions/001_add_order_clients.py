"""add order_clients table

Revision ID: 001
Revises: 
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_clients",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False, index=True),
        sa.Column("client_id", sa.Integer(), nullable=False, index=True),
        sa.Column("is_primary", sa.Boolean(), default=False),
    )
    op.execute(
        "INSERT INTO order_clients (order_id, client_id, is_primary) "
        "SELECT id, client_id, TRUE FROM orders WHERE client_id IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_table("order_clients")
