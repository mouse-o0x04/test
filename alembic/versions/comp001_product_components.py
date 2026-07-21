"""product_components: extend product_raw_materials and order_item_raw_materials

Revision ID: comp001
Revises: retro001
Create Date: 2026-07-16 02:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = 'comp001'
down_revision = 'retro001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('product_raw_materials', sa.Column('name', sa.String(255), nullable=True))
    op.add_column('product_raw_materials', sa.Column('cut_width_mm', sa.Float(), nullable=True))
    op.add_column('product_raw_materials', sa.Column('cut_height_mm', sa.Float(), nullable=True))
    op.add_column('product_raw_materials', sa.Column('quantity_per_unit', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('product_raw_materials', sa.Column('price_per_unit', sa.Float(), nullable=True))
    op.add_column('product_raw_materials', sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))

    op.add_column('order_item_raw_materials', sa.Column('name', sa.String(255), nullable=True))
    op.add_column('order_item_raw_materials', sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('order_item_raw_materials', sa.Column('unit_price', sa.Float(), nullable=True))

    op.execute("""
        UPDATE product_raw_materials AS prm
        SET name = rm.name
        FROM raw_materials AS rm
        WHERE prm.raw_material_id = rm.id AND prm.name IS NULL
    """)


def downgrade() -> None:
    op.drop_column('order_item_raw_materials', 'unit_price')
    op.drop_column('order_item_raw_materials', 'quantity')
    op.drop_column('order_item_raw_materials', 'name')

    op.drop_column('product_raw_materials', 'sort_order')
    op.drop_column('product_raw_materials', 'price_per_unit')
    op.drop_column('product_raw_materials', 'quantity_per_unit')
    op.drop_column('product_raw_materials', 'cut_height_mm')
    op.drop_column('product_raw_materials', 'cut_width_mm')
    op.drop_column('product_raw_materials', 'name')
