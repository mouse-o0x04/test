from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import BaseOrders


class Order(BaseOrders):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    total_price: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="new")
    description: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    designer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    workers: Mapped[str | None] = mapped_column(Text, nullable=True)
    layout_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    history: Mapped[list["OrderHistory"]] = relationship("OrderHistory", back_populates="order", cascade="all, delete-orphan")


class OrderItem(BaseOrders):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    product_name_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    product_unit_snapshot: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_formula_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_formula_script_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_material_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_material_qty: Mapped[float | None] = mapped_column(Float, nullable=True)
    cut_width_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    cut_height_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_printed: Mapped[bool] = mapped_column(Boolean, default=False)

    manual_writeoff_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    manual_writeoff_raw_material_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manual_writeoff_cut_width_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    manual_writeoff_cut_height_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    manual_writeoff_quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    processing_method: Mapped[str | None] = mapped_column(String(100), nullable=True)

    order: Mapped["Order"] = relationship("Order", back_populates="items")


class OrderHistory(BaseOrders):
    __tablename__ = "order_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    field: Mapped[str | None] = mapped_column(String(100), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship("Order", back_populates="history")


class OrderClient(BaseOrders):
    __tablename__ = "order_clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
