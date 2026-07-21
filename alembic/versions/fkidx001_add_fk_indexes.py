"""add FK indexes for performance

Revision ID: fkidx001
Revises: 653cb4b8c021
Create Date: 2026-07-16 00:00:00
"""
from alembic import op


revision = 'fkidx001'
down_revision = '653cb4b8c021'
branch_labels = None
depends_on = None


INDEXES = [
    ("ix_order_items_order_id", "order_items", "order_id"),
    ("ix_order_items_product_id", "order_items", "product_id"),
    ("ix_order_items_raw_material_id", "order_items", "raw_material_id"),
    ("ix_order_history_order_id", "order_history", "order_id"),
    ("ix_order_history_user_id", "order_history", "user_id"),
    ("ix_audit_log_entity_id", "audit_log", "entity_id"),
    ("ix_audit_log_user_id", "audit_log", "user_id"),
    ("ix_stock_writeoffs_order_id", "stock_writeoffs", "order_id"),
    ("ix_stock_writeoffs_product_id", "stock_writeoffs", "product_id"),
    ("ix_stock_writeoffs_raw_material_id", "stock_writeoffs", "raw_material_id"),
    ("ix_offcuts_order_id", "offcuts", "order_id"),
    ("ix_hermes_events_agent_id", "hermes_events", "agent_id"),
    ("ix_knowledge_folders_parent_id", "knowledge_folders", "parent_id"),
    ("ix_knowledge_notes_folder_id", "knowledge_notes", "folder_id"),
    ("ix_orders_client_id", "orders", "client_id"),
    ("ix_warehouse_product_id", "warehouse", "product_id"),
    ("ix_warehouse_raw_material_id", "warehouse", "raw_material_id"),
    ("ix_order_item_raw_materials_raw_material_id", "order_item_raw_materials", "raw_material_id"),
    ("ix_product_raw_materials_raw_material_id", "product_raw_materials", "raw_material_id"),
    ("ix_products_raw_material_id", "products", "raw_material_id"),
    ("ix_user_filter_states_user_id", "user_filter_states", "user_id"),
    ("ix_custom_field_values_field_id", "custom_field_values", "field_id"),
    ("ix_custom_field_values_entity_id", "custom_field_values", "entity_id"),
]


def upgrade() -> None:
    for index_name, table, column in INDEXES:
        op.execute(
            f'CREATE INDEX IF NOT EXISTS "{index_name}" ON "{table}" ("{column}")'
        )


def downgrade() -> None:
    for index_name, table, column in reversed(INDEXES):
        op.execute(f'DROP INDEX IF EXISTS "{index_name}"')
