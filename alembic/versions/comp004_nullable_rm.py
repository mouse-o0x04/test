"""make order_item_raw_materials.raw_material_id nullable for component_product support

Revision ID: comp004
Revises: comp003
Create Date: 2026-07-16 04:00:00
"""
from alembic import op


revision = 'comp004'
down_revision = 'comp003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE order_item_raw_materials ALTER COLUMN raw_material_id DROP NOT NULL")


def downgrade() -> None:
    op.execute("""
        DELETE FROM order_item_raw_materials WHERE raw_material_id IS NULL
    """)
    op.execute("ALTER TABLE order_item_raw_materials ALTER COLUMN raw_material_id SET NOT NULL")
