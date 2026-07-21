"""create warehouse items for existing products with raw materials

Revision ID: retro001
Revises: fkidx001
Create Date: 2026-07-16 01:00:00
"""
from alembic import op


revision = 'retro001'
down_revision = 'fkidx001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO warehouse (product_id, quantity, min_quantity, defective_quantity)
        SELECT p.id, 0, 0, 0
        FROM products p
        WHERE (p.raw_material_id IS NOT NULL
               OR EXISTS (SELECT 1 FROM product_raw_materials prm WHERE prm.product_id = p.id))
          AND NOT EXISTS (SELECT 1 FROM warehouse w WHERE w.product_id = p.id)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM warehouse w
        WHERE w.product_id IS NOT NULL
          AND w.quantity = 0
          AND EXISTS (SELECT 1 FROM products p
                      WHERE p.id = w.product_id
                        AND (p.raw_material_id IS NOT NULL
                             OR EXISTS (SELECT 1 FROM product_raw_materials prm WHERE prm.product_id = p.id)))
        """
    )
