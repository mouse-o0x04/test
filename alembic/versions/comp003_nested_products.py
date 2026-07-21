"""product_components: add component_product_id for nested products (BOM)

Revision ID: comp003
Revises: comp001
Create Date: 2026-07-16 03:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = 'comp003'
down_revision = 'comp001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('product_raw_materials', sa.Column('component_product_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'product_raw_materials_component_product_id_fkey',
        'product_raw_materials',
        'products',
        ['component_product_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.execute("ALTER TABLE product_raw_materials ALTER COLUMN raw_material_id DROP NOT NULL")
    op.create_check_constraint(
        'prm_one_source',
        'product_raw_materials',
        "(raw_material_id IS NOT NULL AND component_product_id IS NULL) OR "
        "(raw_material_id IS NULL AND component_product_id IS NOT NULL) OR "
        "(raw_material_id IS NULL AND component_product_id IS NULL)",
    )
    op.create_index(
        'ix_product_raw_materials_component_product_id',
        'product_raw_materials',
        ['component_product_id'],
    )

    op.add_column('order_item_raw_materials', sa.Column('component_product_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('order_item_raw_materials', 'component_product_id')
    op.drop_index('ix_product_raw_materials_component_product_id', table_name='product_raw_materials')
    op.drop_constraint('product_raw_materials', 'prm_one_source', type_='check')
    op.execute("ALTER TABLE product_raw_materials ALTER COLUMN raw_material_id SET NOT NULL")
    op.drop_constraint('product_raw_materials', 'product_raw_materials_component_product_id_fkey', type_='foreignkey')
    op.drop_column('product_raw_materials', 'component_product_id')
