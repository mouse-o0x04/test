import json
import logging
import math
import os
import shutil
import uuid
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

logger = logging.getLogger("orders_stock")
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.database import Session as SessionFactory
from app.models.client import Client
from app.models.order import Order, OrderHistory, OrderItem, OrderClient
from app.models.order_item_raw_material import OrderItemRawMaterial
from app.models.product import Product
from app.models.raw_material import RawMaterial
from app.models.user import User
from app.models.warehouse import WarehouseItem
from app.schemas.order import OrderCreate, OrderHistoryOut, OrderOut, OrderUpdate
from app.services.formula import safe_eval
from app.services.script_runner import run_script
from app.services.hermes_service import notify_all
from app.services.history_service import (
    log_created,
    log_deleted,
    log_item_completed,
    log_item_printed,
    log_status_changed,
    log_updated,
)

router = APIRouter(prefix="/orders", tags=["orders"])


def round2(value: float) -> float:
    """Математическое округление до 2 знаков после запятой (0.005 → 0.01)."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _sync_order_clients(order_id: int, client_ids: list[int] | None, client_id: int, db: Session) -> None:
    """Синхронизировать связь заказ-клиенты."""
    if client_ids is not None:
        ids = client_ids
    else:
        ids = [client_id]

    db.execute(
        OrderClient.__table__.delete().where(OrderClient.order_id == order_id)
    )

    for i, cid in enumerate(ids):
        db.add(OrderClient(
            order_id=order_id,
            client_id=cid,
            is_primary=(i == 0),
        ))
    db.flush()


def _get_order_clients(order_id: int, db: Session) -> list[dict]:
    """Получить всех клиентов заказа из junction-таблицы."""
    rows = db.execute(
        select(OrderClient).where(OrderClient.order_id == order_id)
        .order_by(OrderClient.is_primary.desc(), OrderClient.id)
    ).scalars().all()
    result = []
    for oc in rows:
        client = db.get(Client, oc.client_id)
        if client:
            result.append({"id": client.id, "name": client.name})
    return result


def _snapshot_components(order_items: list, db: Session) -> None:
    """For each catalog order item (with product_id), snapshot product components
    into order_item_raw_materials so later product edits do not affect this order.

    For nested products (component_product_id), recursively snapshots their
    components too — each level stored with name referencing parent component.

    Custom items (no product_id) are handled separately in create_order/update_order.
    If an order item already has OrderItemRawMaterial rows, they are left untouched.
    """
    from app.models.product_raw_material import ProductRawMaterial
    for oi in order_items:
        if not oi.product_id:
            continue
        existing = db.execute(
            select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
        ).scalars().all()
        if existing:
            continue
        product = db.get(Product, oi.product_id)
        if not product:
            continue
        # Expire to force fresh load of raw_materials relationship
        db.expire(product)
        _snapshot_product_components(product, oi, db, visited=set())


def _snapshot_product_components(product: Product, oi, db: Session, visited: set, parent_name: str | None = None) -> None:
    """Recursively snapshot product components into order_item_raw_materials."""
    from app.models.product_raw_material import ProductRawMaterial
    if product.id in visited:
        return
    visited.add(product.id)
    prm_entries = db.execute(
        select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
        .order_by(ProductRawMaterial.sort_order, ProductRawMaterial.id)
    ).scalars().all()
    if not prm_entries:
        visited.discard(product.id)
        return
    for prm in prm_entries:
        comp_w = prm.cut_width_mm or oi.cut_width_mm
        comp_h = prm.cut_height_mm or oi.cut_height_mm
        total_pieces = oi.quantity * (prm.quantity_per_unit or 1)
        display_name = prm.name or parent_name

        if prm.raw_material_id:
            material = db.get(RawMaterial, prm.raw_material_id)
            if not material:
                continue
            computed_qty = _calc_single_material_needed(
                material, total_pieces, prm.coefficient, db,
                comp_w, comp_h, oi.processing_method, order_id=oi.order_id,
            )
            computed_qty_per_unit = computed_qty / oi.quantity if oi.quantity else computed_qty
            db.add(OrderItemRawMaterial(
                order_item_id=oi.id,
                raw_material_id=prm.raw_material_id,
                component_product_id=None,
                raw_material_qty=computed_qty_per_unit,
                cut_width_mm=comp_w,
                cut_height_mm=comp_h,
                name=display_name,
                quantity=prm.quantity_per_unit or 1,
                unit_price=prm.price_per_unit,
            ))
        elif prm.component_product_id:
            sub_product = db.get(Product, prm.component_product_id)
            if not sub_product:
                continue
            db.expire(sub_product)
            # Save a record for the sub-product itself (for UI display + history)
            db.add(OrderItemRawMaterial(
                order_item_id=oi.id,
                raw_material_id=None,
                component_product_id=sub_product.id,
                raw_material_qty=None,
                cut_width_mm=comp_w,
                cut_height_mm=comp_h,
                name=display_name,
                quantity=prm.quantity_per_unit or 1,
                unit_price=prm.price_per_unit,
            ))
            db.flush()
            # When recursing into sub-product, use its own default sizes (not inherited from parent)
            sub_cut_w = sub_product.default_cut_width_mm or comp_w
            sub_cut_h = sub_product.default_cut_height_mm or comp_h
            # Recursively snapshot sub-product components (its raw materials)
            sub_oi = type("SubOI", (), {
                "id": oi.id, "order_id": oi.order_id, "quantity": total_pieces,
                "cut_width_mm": sub_cut_w, "cut_height_mm": sub_cut_h,
                "processing_method": oi.processing_method,
                "product_name_snapshot": sub_product.name,
            })()
            _snapshot_product_components(sub_product, sub_oi, db, visited, parent_name=display_name)
    visited.discard(product.id)


STATUSES_WITH_STOCK = {"in_progress", "post_processing", "ready", "delivered"}


def _calc_custom_raw_material_qty(raw_material: RawMaterial, cut_width_mm: float, cut_height_mm: float) -> float:
    """Расчёт расхода сырья для произвольной позиции по размерам отреза.

    Для рулонных материалов считает метры рулона: сколько кусков влезает
    по ширине рулона и сколько метров длины нужно на каждый кусок.
    Для листовых материалов считает сколько отрезов влезает на одном листе.
    """
    if raw_material.roll_width_m:
        roll_width_mm = raw_material.roll_width_m * 1000
        options = []
        fit_a = int(roll_width_mm // cut_width_mm)
        if fit_a >= 1:
            meters_a = (cut_height_mm / 1000) / fit_a
            options.append(meters_a)
        fit_b = int(roll_width_mm // cut_height_mm)
        if fit_b >= 1:
            meters_b = (cut_width_mm / 1000) / fit_b
            options.append(meters_b)
        if options:
            return round(min(options), 6)
        return 0
    elif raw_material.width_mm and raw_material.height_mm:
        sw, sh = raw_material.width_mm, raw_material.height_mm
        cw, ch = cut_width_mm, cut_height_mm
        fit_a = int(sw // cw) * int(sh // ch)
        fit_b = int(sw // ch) * int(sh // cw)
        fit = max(fit_a, fit_b)
        if fit < 1:
            return 0
        return round(1.0 / fit, 6)
    return 0


def _calc_all_materials_needed(product: Product, quantity: int, db: Session, cut_width_mm: float = None, cut_height_mm: float = None, processing_method: str = None, order_id: int = None) -> list[tuple[int, float]]:
    """Return list of (raw_material_id, needed_qty) for all materials of this product."""
    from app.models.product_raw_material import ProductRawMaterial

    prm_entries = db.execute(
        select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
        .order_by(ProductRawMaterial.sort_order, ProductRawMaterial.id)
    ).scalars().all()

    pw = cut_width_mm or product.default_cut_width_mm
    ph = cut_height_mm or product.default_cut_height_mm

    if prm_entries:
        results = []
        for prm in prm_entries:
            material = db.get(RawMaterial, prm.raw_material_id)
            if not material:
                continue
            comp_w = prm.cut_width_mm or cut_width_mm or product.default_cut_width_mm
            comp_h = prm.cut_height_mm or cut_height_mm or product.default_cut_height_mm
            total_pieces = quantity * (prm.quantity_per_unit or 1)
            needed = _calc_single_material_needed(material, total_pieces, prm.coefficient, db, comp_w, comp_h, processing_method, order_id)
            if needed > 0:
                results.append((prm.raw_material_id, needed))
        return results

    if product.raw_material_id:
        material = db.get(RawMaterial, product.raw_material_id)
        if material:
            needed = _calc_single_material_needed(material, quantity, product.material_coefficient, db, pw, ph, processing_method, order_id)
            if needed > 0:
                return [(product.raw_material_id, needed)]
    return []


def _calc_single_material_needed(material: RawMaterial, quantity: int, coefficient: float, db, cut_width_mm: float = None, cut_height_mm: float = None, processing_method: str = None, order_id: int = None) -> float:
    """Calculate how much of a single raw material is needed for given quantity."""
    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == material.id)).scalar_one_or_none()
    if wh_item and wh_item.stock_calculation_script:
        script_data = {
            "quantity": quantity,
            "width_mm": material.width_mm,
            "height_mm": material.height_mm,
            "roll_width_m": material.roll_width_m,
            "roll_length_m": material.roll_length_m,
            "material_coefficient": coefficient,
            "cut_width_mm": cut_width_mm or 0,
            "cut_height_mm": cut_height_mm or 0,
            "material_name": material.name,
            "processing_method": processing_method or "",
        }
        try:
            result_num, result_data = run_script(wh_item.stock_calculation_script, script_data)
            if result_data.get("error"):
                raise HTTPException(status_code=400, detail=result_data["error"])
            if result_data.get("new_offcuts"):
                from app.models.offcut import Offcut
                for oc in result_data.get("new_offcuts"):
                    db.add(Offcut(raw_material_id=material.id, width_mm=oc["width"], height_mm=oc["height"], quantity=1, order_id=order_id))
                db.flush()
            if result_data.get("offcuts_used"):
                # Обрезки будут удалены в create_order/update_order через pending_offcuts_delete
                pass
            return float(result_num)
        except Exception as e:
            logger.warning(f"Script {wh_item.stock_calculation_script} failed: {e}, using default calc")

    if cut_width_mm and cut_height_mm and material.roll_width_m and material.roll_width_m > 0:
        bw_m = cut_width_mm / 1000
        bh_m = cut_height_mm / 1000
        fit_a = int(material.roll_width_m // bw_m)
        fit_b = int(material.roll_width_m // bh_m)
        options = []
        if fit_a >= 1:
            options.append(bh_m / fit_a)
        if fit_b >= 1:
            options.append(bw_m / fit_b)
        if options:
            consumed_per_unit = min(options)
            exact = quantity * consumed_per_unit
            return math.ceil(exact * 2) / 2
        return 0
    elif material.width_mm and material.height_mm:
        consumed_per_unit = 1.0
        exact = quantity * consumed_per_unit
        return math.ceil(exact * 2) / 2
    elif coefficient > 0:
        consumed_per_unit = 1.0 / coefficient
        exact = quantity * consumed_per_unit
        return math.ceil(exact * 2) / 2
    else:
        return 0


def _collect_raw_material_needs(product: Product, needed: int, db: Session, oi, visited: set, needs: dict) -> bool:
    """Recursively collect raw material needs into `needs` dict.
    needs[raw_material_id] = list of (quantity, cut_width_mm, cut_height_mm) requests.
    Returns False if a material or sub-product is missing."""
    if product.id in visited:
        return True
    visited.add(product.id)
    try:
        from app.models.product_raw_material import ProductRawMaterial
        prms = db.execute(
            select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
        ).scalars().all()
        if not prms:
            # Готовое изделие — нужно проверить прямой складский остаток отдельно
            wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.product_id == product.id)).scalar_one_or_none()
            available = (wh_item.quantity - (wh_item.defective_quantity or 0)) if wh_item else 0
            if available < needed:
                needs.setdefault(-product.id, 0.0)
                needs[-product.id] += needed
            return True
        for prm in prms:
            comp_needed = needed * (prm.quantity_per_unit or 1)
            if prm.raw_material_id:
                material = db.get(RawMaterial, prm.raw_material_id)
                if not material:
                    return False
                comp_w = prm.cut_width_mm or oi.cut_width_mm
                comp_h = prm.cut_height_mm or oi.cut_height_mm
                # Collect as a request for this raw material
                needs.setdefault(prm.raw_material_id, [])
                needs[prm.raw_material_id].append((comp_needed, comp_w, comp_h))
            elif prm.component_product_id:
                sub = db.get(Product, prm.component_product_id)
                if not sub:
                    return False
                sub_oi = type("SubOI", (), {
                    "cut_width_mm": sub.default_cut_width_mm or prm.cut_width_mm or oi.cut_width_mm,
                    "cut_height_mm": sub.default_cut_height_mm or prm.cut_height_mm or oi.cut_height_mm,
                    "processing_method": getattr(oi, "processing_method", None),
                })()
                if not _collect_raw_material_needs(sub, comp_needed, db, sub_oi, visited, needs):
                    return False
        return True
    finally:
        visited.discard(product.id)


def _aggregate_raw_material_needs(rm_id: int, requests: list, db: Session) -> float:
    """Calculate total sheets/material needed for one raw material given multiple requests.
    Each request = (quantity, cut_width_mm, cut_height_mm).

    For sheet materials: if all requests fit on one sheet (combined area < sheet area × 0.7),
    return 1. Otherwise sum individual calculations.
    For other materials: sum individual calculations."""
    material = db.get(RawMaterial, rm_id)
    if not material:
        return sum(r[0] for r in requests)

    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == rm_id)).scalar_one_or_none()
    use_script = wh_item and wh_item.stock_calculation_script

    # If only one request — use normal calculation
    if len(requests) == 1:
        qty, cw, ch = requests[0]
        return _calc_single_material_needed(material, qty, 1.0, db, cw, ch)

    # Multiple requests for same raw material — try combined area calculation
    if material.width_mm and material.height_mm:
        sheet_area = material.width_mm * material.height_mm
        total_item_area = sum(qty * (cw or 0) * (ch or 0) for qty, cw, ch in requests if cw and ch)
        if total_item_area > 0 and total_item_area <= sheet_area * 0.7:
            # All items fit on one sheet (with 30% waste margin)
            return 1.0
        # Doesn't fit on one sheet — calculate each separately and sum
        total = 0.0
        for qty, cw, ch in requests:
            total += _calc_single_material_needed(material, qty, 1.0, db, cw, ch)
        return total

    # Roll or other material — sum individual calculations
    total = 0.0
    for qty, cw, ch in requests:
        total += _calc_single_material_needed(material, qty, 1.0, db, cw, ch)
    return total


def _check_product_stock(product: Product, needed: int, db: Session, oi, visited: set) -> bool:
    """Recursively check if product can fulfill `needed` pieces.
    Aggregates raw material needs across all sub-products before checking stock."""
    needs: dict = {}
    if not _collect_raw_material_needs(product, needed, db, oi, visited, needs):
        return False
    # Check aggregated raw material needs
    for key, value in needs.items():
        if key > 0:
            # Raw material — value is list of requests
            total_needed = _aggregate_raw_material_needs(key, value, db)
            wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == key)).scalar_one_or_none()
            available = (wh_item.quantity - (wh_item.defective_quantity or 0)) if wh_item else 0
            if available < total_needed:
                return False
        else:
            # Negative key = готовое изделие (product stock check)
            pid = -key
            wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.product_id == pid)).scalar_one_or_none()
            available = (wh_item.quantity - (wh_item.defective_quantity or 0)) if wh_item else 0
            if available < value:
                return False
    return True


def _check_stock_sufficiency(order_items: list, db: Session):
    """Check if warehouse has enough material for all order items. Raises HTTPException if not."""
    from app.models.raw_material import RawMaterial
    for oi in order_items:
        if oi.product_id:
            product = db.get(Product, oi.product_id)
            if not product:
                continue
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
                .order_by(OrderItemRawMaterial.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    if orm.component_product_id:
                        sub_product = db.get(Product, orm.component_product_id)
                        if not sub_product:
                            continue
                        sub_needed = oi.quantity * (orm.quantity or 1)
                        if not _check_product_stock(sub_product, sub_needed, db, oi, visited=set()):
                            sub_wh = db.execute(select(WarehouseItem).where(WarehouseItem.product_id == sub_product.id)).scalar_one_or_none()
                            available = sub_wh.quantity - (sub_wh.defective_quantity or 0) if sub_wh else 0
                            raise HTTPException(
                                status_code=400,
                                detail=f"Недостаточно под-продукта «{sub_product.name}» для «{oi.product_name_snapshot}». Нужно: {sub_needed}, доступно: {available}",
                            )
                        continue
                    if not orm.raw_material_id:
                        continue
                    total_pieces = oi.quantity * (orm.quantity or 1)
                    needed = (orm.raw_material_qty or 0) * total_pieces if orm.raw_material_qty else 0
                    if needed <= 0 and orm.cut_width_mm and orm.cut_height_mm:
                        material = db.get(RawMaterial, orm.raw_material_id)
                        if material:
                            needed = _calc_single_material_needed(material, total_pieces, 1.0, db, orm.cut_width_mm, orm.cut_height_mm, oi.processing_method)
                    if needed <= 0:
                        continue
                    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == orm.raw_material_id)).scalar_one_or_none()
                    if not wh_item:
                        material = db.get(RawMaterial, orm.raw_material_id)
                        name = material.name if material else f"#{orm.raw_material_id}"
                        raise HTTPException(status_code=400, detail=f"Нет на складе материала «{name}» для «{oi.product_name_snapshot}»")
                    available = wh_item.quantity - (wh_item.defective_quantity or 0)
                    if available < needed:
                        material = db.get(RawMaterial, orm.raw_material_id)
                        name = material.name if material else f"#{orm.raw_material_id}"
                        raise HTTPException(
                            status_code=400,
                            detail=f"Недостаточно материала «{name}» для «{oi.product_name_snapshot}». Нужно: {needed}, доступно: {available}",
                        )
            else:
                materials_needed = _calc_all_materials_needed(product, oi.quantity, db, oi.cut_width_mm, oi.cut_height_mm, oi.processing_method, order_id=None)
                for raw_material_id, needed in materials_needed:
                    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == raw_material_id)).scalar_one_or_none()
                    if not wh_item:
                        material = db.get(RawMaterial, raw_material_id)
                        name = material.name if material else f"#{raw_material_id}"
                        raise HTTPException(status_code=400, detail=f"Нет на складе материала «{name}» для «{oi.product_name_snapshot}»")
                    available = wh_item.quantity - (wh_item.defective_quantity or 0)
                    if available < needed:
                        material = db.get(RawMaterial, raw_material_id)
                        name = material.name if material else f"#{raw_material_id}"
                        raise HTTPException(
                            status_code=400,
                            detail=f"Недостаточно материала «{name}» для «{oi.product_name_snapshot}». Нужно: {needed}, доступно: {available}",
                        )
        else:
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    needed = (orm.raw_material_qty or 0) * oi.quantity
                    if needed > 0:
                        wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == orm.raw_material_id)).scalar_one_or_none()
                        if not wh_item:
                            material = db.get(RawMaterial, orm.raw_material_id)
                            name = material.name if material else f"#{orm.raw_material_id}"
                            raise HTTPException(status_code=400, detail=f"Нет на складе материала «{name}» для «{oi.product_name_snapshot}»")
                        available = wh_item.quantity - (wh_item.defective_quantity or 0)
                        if available < needed:
                            material = db.get(RawMaterial, orm.raw_material_id)
                            name = material.name if material else f"#{orm.raw_material_id}"
                            raise HTTPException(
                                status_code=400,
                                detail=f"Недостаточно материала «{name}» для «{oi.product_name_snapshot}». Нужно: {needed}, доступно: {available}",
                            )
            elif oi.raw_material_id and oi.raw_material_qty and oi.raw_material_qty > 0:
                needed = oi.raw_material_qty * oi.quantity
                wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == oi.raw_material_id)).scalar_one_or_none()
                if not wh_item:
                    material = db.get(RawMaterial, oi.raw_material_id)
                    name = material.name if material else f"#{oi.raw_material_id}"
                    raise HTTPException(status_code=400, detail=f"Нет на складе материала «{name}» для «{oi.product_name_snapshot}»")
                available = wh_item.quantity - (wh_item.defective_quantity or 0)
                if available < needed:
                    material = db.get(RawMaterial, oi.raw_material_id)
                    name = material.name if material else f"#{oi.raw_material_id}"
                    raise HTTPException(
                        status_code=400,
                        detail=f"Недостаточно материала «{name}» для «{oi.product_name_snapshot}». Нужно: {needed}, доступно: {available}",
                    )


def _calc_raw_material_needed(product: Product, quantity: int) -> float:
    if not product.raw_material_id:
        logger.debug(f"calc: product {product.id} ({product.name}) has no raw_material_id, return 0")
        return 0

    from app.models.raw_material import RawMaterial
    db = SessionFactory()
    try:
        material = db.get(RawMaterial, product.raw_material_id)
        if not material:
            logger.debug(f"calc: material #{product.raw_material_id} not found for product {product.id}")
            return 0

        logger.debug(
            f"calc: product={product.id}({product.name}) qty={quantity} "
            f"material={material.id}({material.name}) "
            f"roll_w={material.roll_width_m} coeff={product.material_coefficient}"
        )

        return _calc_single_material_needed(material, quantity, product.material_coefficient, db, product.default_cut_width_mm, product.default_cut_height_mm)
    finally:
        db.close()


def _process_order_offcuts(db, order_id, order_items, user):
    """Обработка обрезков: удаление использованных, создание новых, логирование."""
    from app.models.offcut import Offcut
    from app.models.stock_writeoff import StockWriteoff
    from app.models.raw_material import RawMaterial
    from app.models.warehouse import WarehouseItem

    for oi in order_items:
        if not oi.raw_material_id or not oi.cut_width_mm or not oi.cut_height_mm:
            continue
        rm = db.get(RawMaterial, oi.raw_material_id)
        if not rm:
            continue
        wh_item = db.execute(
            select(WarehouseItem).where(WarehouseItem.raw_material_id == rm.id)
        ).scalar_one_or_none()
        if not wh_item or not wh_item.stock_calculation_script:
            continue
        offcuts = db.execute(
            select(Offcut).where(Offcut.raw_material_id == rm.id)
        ).scalars().all()
        offcuts_data = [{"width": o.width_mm, "height": o.height_mm} for o in offcuts]
        script_data = {
            "cut_width_mm": oi.cut_width_mm, "cut_height_mm": oi.cut_height_mm,
            "quantity": oi.quantity, "width_mm": rm.width_mm, "height_mm": rm.height_mm,
            "roll_width_m": rm.roll_width_m, "roll_length_m": rm.roll_length_m,
            "material_name": rm.name, "processing_method": oi.processing_method or "",
            "offcuts": offcuts_data,
        }
        try:
            result_num, result_data = run_script(wh_item.stock_calculation_script, script_data)
            if result_data.get("error"):
                continue
        except Exception as e:
            logger.warning(f"Offcut processing script failed: {e}")
            continue

        for oc in result_data.get("new_offcuts", []):
            db.add(Offcut(
                raw_material_id=rm.id, width_mm=oc["width"],
                height_mm=oc["height"], quantity=1, order_id=order_id
            ))

        for oc in result_data.get("offcuts_used", []):
            offcut = db.execute(
                select(Offcut).where(
                    Offcut.raw_material_id == rm.id,
                    Offcut.width_mm == oc["width"],
                    Offcut.height_mm == oc["height"]
                ).limit(1)
            ).scalars().first()
            if not offcut:
                continue
            rem_w = oc.get("remaining_width", 0)
            rem_h = oc.get("remaining_height", 0)
            db.add(StockWriteoff(
                item_type="raw_material",
                raw_material_id=rm.id,
                quantity=1,
                reason=f"Использован обрезок {oc['width']}×{oc['height']} мм для заказа #{order_id}",
                order_id=order_id,
                created_by=user.id,
                created_by_name=user.full_name or user.username,
                remaining_width=rem_w if rem_w > 0 else None,
                remaining_height=rem_h if rem_h > 0 else None,
            ))
            if rem_w > 0 and rem_h > 0:
                if rem_w > 100 and rem_h > 100:
                    db.add(Offcut(
                        raw_material_id=rm.id, width_mm=rem_w,
                        height_mm=rem_h, quantity=1, order_id=order_id
                    ))
            db.delete(offcut)
    db.commit()


def _deduct_product_recursive(product: Product, needed: int, db: Session, oi, order_id: int | None, visited: set) -> None:
    """Recursively deduct product from stock: direct stock first, then from components."""
    if product.id in visited:
        return
    visited.add(product.id)
    try:
        from app.models.product_raw_material import ProductRawMaterial
        prms = db.execute(
            select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
            .order_by(ProductRawMaterial.sort_order, ProductRawMaterial.id)
        ).scalars().all()
        if not prms:
            _do_deduct_product(db, oi, product.id, needed, order_id)
            return
        for prm in prms:
            comp_needed = needed * (prm.quantity_per_unit or 1)
            if prm.raw_material_id:
                material = db.get(RawMaterial, prm.raw_material_id)
                if not material:
                    continue
                comp_w = prm.cut_width_mm or oi.cut_width_mm
                comp_h = prm.cut_height_mm or oi.cut_height_mm
                rm_needed = _calc_single_material_needed(material, comp_needed, prm.coefficient, db, comp_w, comp_h, getattr(oi, "processing_method", None), order_id=order_id)
                if rm_needed > 0:
                    _do_deduct(db, oi, prm.raw_material_id, rm_needed, order_id)
            elif prm.component_product_id:
                sub = db.get(Product, prm.component_product_id)
                if not sub:
                    continue
                sub_oi = type("SubOI", (), {
                    "id": getattr(oi, "id", None), "order_id": order_id,
                    "cut_width_mm": sub.default_cut_width_mm or prm.cut_width_mm or oi.cut_width_mm,
                    "cut_height_mm": sub.default_cut_height_mm or prm.cut_height_mm or oi.cut_height_mm,
                    "processing_method": getattr(oi, "processing_method", None),
                    "product_name_snapshot": sub.name,
                })()
                _deduct_product_recursive(sub, comp_needed, db, sub_oi, order_id, visited)
    finally:
        visited.discard(product.id)


def _return_product_recursive(product: Product, needed: int, db: Session, oi, order_id: int | None, visited: set) -> None:
    """Recursively return product to stock: components first, then direct stock."""
    if product.id in visited:
        return
    visited.add(product.id)
    try:
        from app.models.product_raw_material import ProductRawMaterial
        prms = db.execute(
            select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
            .order_by(ProductRawMaterial.sort_order, ProductRawMaterial.id)
        ).scalars().all()
        if not prms:
            _do_return_product(db, product.id, needed, order_id)
            return
        for prm in prms:
            comp_needed = needed * (prm.quantity_per_unit or 1)
            if prm.raw_material_id:
                material = db.get(RawMaterial, prm.raw_material_id)
                if not material:
                    continue
                comp_w = prm.cut_width_mm or oi.cut_width_mm
                comp_h = prm.cut_height_mm or oi.cut_height_mm
                rm_needed = _calc_single_material_needed(material, comp_needed, prm.coefficient, db, comp_w, comp_h, getattr(oi, "processing_method", None), order_id=order_id)
                if rm_needed > 0:
                    _do_return(db, oi, prm.raw_material_id, rm_needed, order_id)
            elif prm.component_product_id:
                sub = db.get(Product, prm.component_product_id)
                if not sub:
                    continue
                sub_oi = type("SubOI", (), {
                    "id": getattr(oi, "id", None), "order_id": order_id,
                    "cut_width_mm": sub.default_cut_width_mm or prm.cut_width_mm or oi.cut_width_mm,
                    "cut_height_mm": sub.default_cut_height_mm or prm.cut_height_mm or oi.cut_height_mm,
                    "processing_method": getattr(oi, "processing_method", None),
                    "product_name_snapshot": sub.name,
                })()
                _return_product_recursive(sub, comp_needed, db, sub_oi, order_id, visited)
    finally:
        visited.discard(product.id)


def _deduct_raw_material(order_items: list, db: Session, order_id: int = None):
    from app.models.raw_material import RawMaterial
    from app.models.stock_writeoff import StockWriteoff
    for oi in order_items:
        if oi.product_id:
            product = db.get(Product, oi.product_id)
            if not product:
                continue
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
                .order_by(OrderItemRawMaterial.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    if orm.component_product_id:
                        sub_product = db.get(Product, orm.component_product_id)
                        if not sub_product:
                            continue
                        sub_needed = oi.quantity * (orm.quantity or 1)
                        _deduct_product_recursive(sub_product, sub_needed, db, oi, order_id, visited=set())
                        continue
                    if not orm.raw_material_id:
                        continue
                    total_pieces = oi.quantity * (orm.quantity or 1)
                    needed = (orm.raw_material_qty or 0) * total_pieces if orm.raw_material_qty else 0
                    if needed <= 0 and orm.cut_width_mm and orm.cut_height_mm:
                        material = db.get(RawMaterial, orm.raw_material_id)
                        if material:
                            needed = _calc_single_material_needed(material, total_pieces, 1.0, db, orm.cut_width_mm, orm.cut_height_mm, oi.processing_method, order_id=order_id)
                    if needed > 0:
                        _do_deduct(db, oi, orm.raw_material_id, needed, order_id)
            else:
                materials_needed = _calc_all_materials_needed(product, oi.quantity, db, oi.cut_width_mm, oi.cut_height_mm, oi.processing_method, order_id=order_id)
                if materials_needed:
                    for raw_material_id, needed in materials_needed:
                        _do_deduct(db, oi, raw_material_id, needed, order_id)
                else:
                    _do_deduct_product(db, oi, oi.product_id, oi.quantity, order_id)
        else:
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    needed = (orm.raw_material_qty or 0) * oi.quantity
                    if needed > 0:
                        _do_deduct_with_offcuts(db, oi, orm.raw_material_id, needed, order_id, oi.cut_width_mm, oi.cut_height_mm, oi.processing_method, oi.quantity)
            elif oi.raw_material_id and oi.raw_material_qty and oi.raw_material_qty > 0:
                needed = oi.raw_material_qty * oi.quantity
                _do_deduct_with_offcuts(db, oi, oi.raw_material_id, needed, order_id, oi.cut_width_mm, oi.cut_height_mm, oi.processing_method, oi.quantity)
            else:
                logger.debug(f"deduct: skip oi#{oi.id} no product and no raw_material info")


def _do_deduct_with_offcuts(db, oi, raw_material_id, needed, order_id, cut_width_mm=None, cut_height_mm=None, processing_method=None, quantity=1):
    """Списание материала — обрезки обрабатываются отдельно в _process_order_offcuts."""
    _do_deduct(db, oi, raw_material_id, needed, order_id)


def _do_deduct_product(db: Session, oi, product_id: int, needed: float, order_id: int = None):
    """Списание готового продукта со склада."""
    from app.models.stock_writeoff import StockWriteoff
    wh_item = db.execute(
        select(WarehouseItem).where(WarehouseItem.product_id == product_id)
    ).scalar_one_or_none()
    if not wh_item:
        product = db.get(Product, product_id)
        name = product.name if product else f"#{product_id}"
        raise HTTPException(status_code=400, detail=f"Нет на складе продукта «{name}»")
    available = wh_item.quantity - (wh_item.defective_quantity or 0)
    if available < needed:
        product = db.get(Product, product_id)
        name = product.name if product else f"#{product_id}"
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно продукта «{name}». Нужно: {needed}, доступно: {available}",
        )
    wh_item.quantity -= needed
    db.add(wh_item)
    db.add(StockWriteoff(
        item_type="product",
        product_id=product_id,
        quantity=needed,
        reason=f"Заказ #{order_id}" if order_id else "Списание по заказу",
        order_id=order_id,
    ))


def _do_deduct(db: Session, oi, raw_material_id: int, needed: float, order_id: int = None):
    from app.models.raw_material import RawMaterial
    from app.models.stock_writeoff import StockWriteoff
    wh_item = db.execute(
        select(WarehouseItem).where(WarehouseItem.raw_material_id == raw_material_id)
    ).scalar_one_or_none()
    if not wh_item:
        material = db.get(RawMaterial, raw_material_id)
        name = material.name if material else f"#{raw_material_id}"
        product_name = oi.product_name_snapshot or (oi.product_name_snapshot or f"#{oi.id}")
        raise HTTPException(status_code=400, detail=f"Нет на складе материала «{name}» для «{product_name}»")
    available = wh_item.quantity - (wh_item.defective_quantity or 0)
    if available < needed:
        material = db.get(RawMaterial, raw_material_id)
        name = material.name if material else f"#{raw_material_id}"
        product_name = oi.product_name_snapshot or (oi.product_name_snapshot or f"#{oi.id}")
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно материала «{name}» для «{product_name}». Нужно: {needed}, доступно: {available}",
        )
    old_qty = wh_item.quantity
    wh_item.quantity -= needed
    logger.debug(f"deduct: oi#{oi.id} material_id={raw_material_id} needed={needed} qty {old_qty} -> {wh_item.quantity}")
    db.add(wh_item)

    writeoff = StockWriteoff(
        item_type="raw_material",
        raw_material_id=raw_material_id,
        quantity=needed,
        reason=f"Заказ #{order_id}" if order_id else "Списание по заказу",
        order_id=order_id,
    )
    db.add(writeoff)


def _return_raw_material(order_items: list, db: Session, order_id: int = None):
    from app.models.raw_material import RawMaterial
    from app.models.stock_writeoff import StockWriteoff
    for oi in order_items:
        if oi.product_id:
            product = db.get(Product, oi.product_id)
            if not product:
                continue
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
                .order_by(OrderItemRawMaterial.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    if orm.component_product_id:
                        sub_product = db.get(Product, orm.component_product_id)
                        if not sub_product:
                            continue
                        sub_needed = oi.quantity * (orm.quantity or 1)
                        _return_product_recursive(sub_product, sub_needed, db, oi, order_id, visited=set())
                        continue
                    if not orm.raw_material_id:
                        continue
                    total_pieces = oi.quantity * (orm.quantity or 1)
                    needed = (orm.raw_material_qty or 0) * total_pieces if orm.raw_material_qty else 0
                    if needed <= 0 and orm.cut_width_mm and orm.cut_height_mm:
                        material = db.get(RawMaterial, orm.raw_material_id)
                        if material:
                            needed = _calc_single_material_needed(material, total_pieces, 1.0, db, orm.cut_width_mm, orm.cut_height_mm, oi.processing_method, order_id=order_id)
                    if needed > 0:
                        _do_return(db, oi, orm.raw_material_id, needed, order_id)
            else:
                materials_needed = _calc_all_materials_needed(product, oi.quantity, db, oi.cut_width_mm, oi.cut_height_mm, oi.processing_method, order_id=order_id)
                if materials_needed:
                    for raw_material_id, needed in materials_needed:
                        _do_return(db, oi, raw_material_id, needed, order_id)
                else:
                    _do_return_product(db, oi.product_id, oi.quantity, order_id)
        else:
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    needed = (orm.raw_material_qty or 0) * oi.quantity
                    if needed > 0:
                        _do_return(db, oi, orm.raw_material_id, needed, order_id)
            elif oi.raw_material_id and oi.raw_material_qty and oi.raw_material_qty > 0:
                _do_return(db, oi, oi.raw_material_id, oi.raw_material_qty, order_id)


def _do_return(db: Session, oi, raw_material_id: int, needed: float, order_id: int = None):
    from app.models.raw_material import RawMaterial
    from app.models.stock_writeoff import StockWriteoff
    wh_item = db.execute(
        select(WarehouseItem).where(WarehouseItem.raw_material_id == raw_material_id)
    ).scalar_one_or_none()
    if wh_item:
        old_qty = wh_item.quantity
        wh_item.quantity += needed
        logger.debug(f"return: oi#{oi.id} material_id={raw_material_id} needed={needed} qty {old_qty} -> {wh_item.quantity}")
        db.add(wh_item)

    if order_id:
        writeoffs = db.execute(
            select(StockWriteoff).where(StockWriteoff.order_id == order_id, StockWriteoff.raw_material_id == raw_material_id)
        ).scalars().all()
        for w in writeoffs:
            db.delete(w)


def _do_return_product(db: Session, product_id: int, needed: float, order_id: int = None):
    from app.models.stock_writeoff import StockWriteoff
    wh_item = db.execute(
        select(WarehouseItem).where(WarehouseItem.product_id == product_id)
    ).scalar_one_or_none()
    if wh_item:
        wh_item.quantity += needed
        db.add(wh_item)

    if order_id:
        writeoffs = db.execute(
            select(StockWriteoff).where(StockWriteoff.order_id == order_id, StockWriteoff.product_id == product_id)
        ).scalars().all()
        for w in writeoffs:
            db.delete(w)


@router.get("/stock/{product_id}")
def get_product_stock(product_id: int):
    db = SessionFactory()
    try:
        item = db.execute(
            select(WarehouseItem).where(WarehouseItem.product_id == product_id)
        ).scalar_one_or_none()
        if not item:
            return {"product_id": product_id, "quantity": 0, "min_quantity": 0}
        return {
            "product_id": product_id,
            "quantity": item.quantity,
            "min_quantity": item.min_quantity,
        }
    finally:
        db.close()


@router.get("/calculate/{product_id}")
def calculate_price(product_id: int, quantity: int = 1):
    db = SessionFactory()
    try:
        product = db.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        variables = {
            "quantity": quantity,
            "unit_price": product.unit_price,
            "price": product.unit_price,
        }

        if product.formula_script and product.formula_script.strip():
            try:
                script_data = {
                    "quantity": quantity,
                    "unit_price": product.unit_price,
                    "price": product.unit_price,
                    "product_name": product.name,
                    "product_id": product.id,
                    "product_category": product.category,
                    "product_unit_type": product.unit_type,
                    "product_description": product.description,
                }
                total, _ = run_script(product.formula_script, script_data)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Script error: {e}")
        elif product.formula and product.formula.strip():
            try:
                total = safe_eval(product.formula, variables)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Formula error: {e}")
        else:
            total = product.unit_price * quantity

        return {
            "product_id": product_id,
            "quantity": quantity,
            "unit_price": product.unit_price,
            "formula": product.formula,
            "total": round(total, 2),
        }
    finally:
        db.close()


@router.get("", response_model=list[OrderOut])
def list_orders():
    db = SessionFactory()
    try:
        orders = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .order_by(Order.id)
        ).scalars().unique().all()
        cache = _build_order_cache(orders, db)
        return [_enrich_order(o, db, cache=cache) for o in orders]
    finally:
        db.close()


@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_orders(data: dict, user: User = Depends(get_current_user)):
    ids = data.get("ids", [])
    db = SessionFactory()
    deleted = 0
    try:
        for oid in ids:
            order = db.get(Order, oid)
            if not order:
                continue
            if order.status in STATUSES_WITH_STOCK:
                items = db.execute(
                    select(OrderItem).where(OrderItem.order_id == oid)
                ).scalars().all()
                _return_raw_material(items, db, order_id=oid)
            db.execute(OrderClient.__table__.delete().where(OrderClient.order_id == oid))
            log_deleted(oid, user, db)
            db.delete(order)
            deleted += 1
        db.commit()
    finally:
        db.close()
    return {"deleted": deleted}


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int):
    db = SessionFactory()
    try:
        order = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .where(Order.id == order_id)
        ).scalars().unique().one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return _enrich_order(order, db)
    finally:
        db.close()


@router.get("/{order_id}/history", response_model=list[OrderHistoryOut])
def get_order_history(order_id: int):
    db = SessionFactory()
    try:
        rows = db.execute(
            select(OrderHistory)
            .where(OrderHistory.order_id == order_id)
            .order_by(OrderHistory.created_at.desc())
        ).scalars().all()
        return rows
    finally:
        db.close()


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(data: OrderCreate, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        client = db.get(Client, data.client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        if not data.items:
            raise HTTPException(status_code=400, detail="Order must have at least one item")

        total_price = 0.0
        order_items = []
        custom_items_data = []

        for item_data in data.items:
            if item_data.product_id:
                product = db.get(Product, item_data.product_id)
                if not product:
                    raise HTTPException(status_code=404, detail=f"Product {item_data.product_id} not found")

                variables = {
                    "quantity": item_data.quantity,
                    "unit_price": product.unit_price,
                    "price": product.unit_price,
                }

                if product.formula_script and product.formula_script.strip():
                    try:
                        script_data = {
                            "quantity": item_data.quantity,
                            "unit_price": product.unit_price,
                            "price": product.unit_price,
                            "product_name": product.name,
                            "product_id": product.id,
                            "product_category": product.category,
                            "product_unit_type": product.unit_type,
                            "product_description": product.description,
                        }
                        item_price = run_script(product.formula_script, script_data)
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=f"Script error for product {product.name}: {e}")
                elif product.formula and product.formula.strip():
                    try:
                        item_price = safe_eval(product.formula, variables)
                    except ValueError as e:
                        raise HTTPException(status_code=400, detail=f"Formula error for product {product.name}: {e}")
                else:
                    item_price = product.unit_price * item_data.quantity

                unit_price = round2(item_price / item_data.quantity) if item_data.quantity else product.unit_price
                if item_data.unit_price is not None:
                    unit_price = item_data.unit_price
                order_items.append(OrderItem(
                    product_id=item_data.product_id,
                    product_name_snapshot=product.name,
                    product_unit_snapshot=product.unit_type,
                    product_formula_snapshot=product.formula,
                    product_formula_script_snapshot=product.formula_script,
                    quantity=item_data.quantity,
                    unit_price=unit_price,
                ))
            else:
                if not item_data.product_name:
                    raise HTTPException(status_code=400, detail="Custom item must have product_name")
                user_role_name = user.roles[0].name if user.roles else "user"
                if item_data.unit_price is None and user_role_name != "designer":
                    raise HTTPException(status_code=400, detail="Custom item must have unit_price")
                item_price = (item_data.unit_price or 0) * item_data.quantity

                computed_rm_qty = item_data.raw_material_qty
                if item_data.raw_material_id and item_data.cut_width_mm and item_data.cut_height_mm:
                    rm = db.get(RawMaterial, item_data.raw_material_id)
                    if not rm:
                        raise HTTPException(status_code=400, detail="Raw material not found")
                    if rm.roll_width_m and item_data.cut_width_mm > rm.roll_width_m * 1000 and (not item_data.cut_height_mm or item_data.cut_height_mm > rm.roll_width_m * 1000):
                        raise HTTPException(status_code=400, detail=f"Отрез {item_data.cut_width_mm}×{item_data.cut_height_mm}мм не влезает в рулон шириной {rm.roll_width_m * 1000}мм ни в одном повороте")
                    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == rm.id)).scalar_one_or_none()
                    if wh_item and wh_item.stock_calculation_script:
                        from app.models.offcut import Offcut
                        offcuts = db.execute(select(Offcut).where(Offcut.raw_material_id == rm.id)).scalars().all()
                        offcuts_data = [{"width": o.width_mm, "height": o.height_mm} for o in offcuts]
                        script_data = {
                            "cut_width_mm": item_data.cut_width_mm,
                            "cut_height_mm": item_data.cut_height_mm,
                            "quantity": item_data.quantity,
                            "width_mm": rm.width_mm,
                            "height_mm": rm.height_mm,
                            "roll_width_m": rm.roll_width_m,
                            "roll_length_m": rm.roll_length_m,
                            "material_name": rm.name,
                            "processing_method": item_data.processing_method or "",
                            "offcuts": offcuts_data,
                        }
                        try:
                            script_result, script_data_out = run_script(wh_item.stock_calculation_script, script_data)
                            if script_data_out.get("error"):
                                raise HTTPException(status_code=400, detail=script_data_out["error"])
                            computed_rm_qty = script_result / item_data.quantity if item_data.quantity else script_result
                        except HTTPException:
                            raise
                        except Exception as e:
                            logger.warning(f"Script {wh_item.stock_calculation_script} failed: {e}, using default calc")
                            computed_rm_qty = _calc_custom_raw_material_qty(rm, item_data.cut_width_mm, item_data.cut_height_mm)
                    else:
                        computed_rm_qty = _calc_custom_raw_material_qty(rm, item_data.cut_width_mm, item_data.cut_height_mm)

                oi = OrderItem(
                    product_id=None,
                    product_name_snapshot=item_data.product_name,
                    product_unit_snapshot=item_data.product_unit or "шт",
                    product_formula_snapshot=item_data.product_formula,
                    product_formula_script_snapshot=item_data.product_formula_script,
                    raw_material_id=item_data.raw_material_id,
                    raw_material_qty=computed_rm_qty,
                    cut_width_mm=item_data.cut_width_mm,
                    cut_height_mm=item_data.cut_height_mm,
                    quantity=item_data.quantity,
                    unit_price=item_data.unit_price or 0,
                    processing_method=item_data.processing_method,
                    manual_writeoff_pending=item_data.manual_writeoff_pending,
                    manual_writeoff_raw_material_id=item_data.manual_writeoff_raw_material_id,
                    manual_writeoff_cut_width_mm=item_data.manual_writeoff_cut_width_mm,
                    manual_writeoff_cut_height_mm=item_data.manual_writeoff_cut_height_mm,
                    manual_writeoff_quantity=item_data.manual_writeoff_quantity,
                )
                order_items.append(oi)
                custom_items_data.append((oi, item_data))

            total_price += round2(item_price)

        role_name = user.roles[0].name if user.roles else "user"
        order = Order(
            client_id=data.client_id,
            total_price=round2(total_price),
            status=data.status,
            description=data.description,
            notes=data.notes,
            deadline=data.deadline,
            deadline_start=data.deadline_start,
            designer=data.designer,
            workers=json.dumps(data.workers, ensure_ascii=False) if data.workers else None,
            layout_type=data.layout_type,
            path=data.path,
            source=data.source,
            created_by=user.id,
            created_by_name=user.full_name or user.username,
            created_by_role=role_name,
        )
        db.add(order)
        db.flush()

        _sync_order_clients(order.id, data.client_ids, data.client_id, db)

        for oi in order_items:
            oi.order_id = order.id
            db.add(oi)
        db.flush()

        _snapshot_components(order_items, db)

        for oi, item_data in custom_items_data:
            raw_materials_list = item_data.raw_materials if item_data.raw_materials else []
            for rm_data in raw_materials_list:
                rm_id = rm_data.raw_material_id
                rm = db.get(RawMaterial, rm_id)
                if not rm:
                    continue
                computed_qty = rm_data.raw_material_qty
                if rm_data.cut_width_mm and rm_data.cut_height_mm:
                    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == rm_id)).scalar_one_or_none()
                    if wh_item and wh_item.stock_calculation_script:
                        try:
                            from app.models.offcut import Offcut
                            offcuts = db.execute(select(Offcut).where(Offcut.raw_material_id == rm_id)).scalars().all()
                            offcuts_data = [{"width": o.width_mm, "height": o.height_mm} for o in offcuts]
                            script_result, script_data_out = run_script(wh_item.stock_calculation_script, {
                                "cut_width_mm": rm_data.cut_width_mm, "cut_height_mm": rm_data.cut_height_mm,
                                "quantity": oi.quantity, "width_mm": rm.width_mm, "height_mm": rm.height_mm,
                                "roll_width_m": rm.roll_width_m, "roll_length_m": rm.roll_length_m,
                                "material_name": rm.name,
                                "processing_method": oi.processing_method or "",
                                "offcuts": offcuts_data,
                            })
                            if script_data_out.get("error"):
                                raise HTTPException(status_code=400, detail=script_data_out["error"])
                            computed_qty = script_result / oi.quantity if oi.quantity else script_result
                        except HTTPException:
                            raise
                        except Exception:
                            computed_qty = _calc_custom_raw_material_qty(rm, rm_data.cut_width_mm, rm_data.cut_height_mm)
                    else:
                        computed_qty = _calc_custom_raw_material_qty(rm, rm_data.cut_width_mm, rm_data.cut_height_mm)
                db.add(OrderItemRawMaterial(
                    order_item_id=oi.id,
                    raw_material_id=rm_id,
                    raw_material_qty=computed_qty,
                    cut_width_mm=rm_data.cut_width_mm,
                    cut_height_mm=rm_data.cut_height_mm,
                ))

        if data.status in STATUSES_WITH_STOCK:
            logger.debug(f"create: deducting stock for status={data.status}")
            _deduct_raw_material(order_items, db, order_id=order.id)
        else:
            logger.debug(f"create: checking stock availability for status={data.status}")
            _check_stock_sufficiency(order_items, db)

        db.commit()
        db.refresh(order)

        if data.status in STATUSES_WITH_STOCK:
            _process_order_offcuts(db, order.id, order_items, user)

        log_created(order, user, db)

        try:
            notify_all("order.created", {
                "order_id": order.id,
                "client_id": order.client_id,
                "client_name": client.name,
                "total_price": order.total_price,
                "status": order.status,
            }, db)
        except Exception:
            pass

        order = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .where(Order.id == order.id)
        ).scalars().unique().one()
        return _enrich_order(order, db)
    finally:
        db.close()


@router.put("/{order_id}", response_model=OrderOut)
def update_order(order_id: int, data: OrderUpdate, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        old_status = order.status
        stock_was_active = old_status in STATUSES_WITH_STOCK
        changes = {}

        if data.client_id is not None and data.client_id != order.client_id:
            changes["client_id"] = (order.client_id, data.client_id)
            order.client_id = data.client_id
        if data.status is not None and data.status != old_status:
            new_stock_active = data.status in STATUSES_WITH_STOCK
            current_items = db.execute(
                select(OrderItem).where(OrderItem.order_id == order_id)
            ).scalars().all()

            if data.status == "ready":
                items_without_method = [
                    i for i in current_items
                    if i.raw_material_id and not i.processing_method
                ]
                if items_without_method:
                    names = [i.product_name_snapshot or f"#{i.id}" for i in items_without_method]
                    raise HTTPException(
                        status_code=400,
                        detail=f"Нельзя установить статус «Готов»: не указан способ обработки для позиций: {', '.join(names)}"
                    )

            if not stock_was_active and new_stock_active:
                _deduct_raw_material(current_items, db, order_id=order_id)
            elif stock_was_active and not new_stock_active:
                _return_raw_material(current_items, db, order_id=order_id)

            order.status = data.status
            if data.status == "ready":
                for i in current_items:
                    i.is_completed = True
            elif data.status not in ("new", "in_progress", "post_processing"):
                pass
            else:
                for i in current_items:
                    i.is_completed = False
        if data.description is not None and data.description != order.description:
            changes["description"] = (order.description, data.description)
            order.description = data.description
        if data.notes is not None and data.notes != order.notes:
            changes["notes"] = (order.notes, data.notes)
            order.notes = data.notes
        if data.deadline is not None and data.deadline != order.deadline:
            changes["deadline"] = (str(order.deadline) if order.deadline else None, str(data.deadline))
            order.deadline = data.deadline
        if data.deadline_start is not None and data.deadline_start != order.deadline_start:
            changes["deadline_start"] = (str(order.deadline_start) if order.deadline_start else None, str(data.deadline_start))
            order.deadline_start = data.deadline_start
        if data.designer is not None and data.designer != order.designer:
            changes["designer"] = (order.designer, data.designer)
            order.designer = data.designer
        if data.workers is not None:
            new_workers_json = json.dumps(data.workers, ensure_ascii=False) if data.workers else None
            if new_workers_json != order.workers:
                changes["workers"] = (order.workers, new_workers_json)
                order.workers = new_workers_json
        if data.layout_type is not None and data.layout_type != order.layout_type:
            changes["layout_type"] = (order.layout_type, data.layout_type)
            order.layout_type = data.layout_type
        if data.path is not None and data.path != order.path:
            changes["path"] = (order.path, data.path)
            order.path = data.path
        if data.source is not None and data.source != order.source:
            changes["source"] = (order.source, data.source)
            order.source = data.source

        if data.items is not None:
            if not data.items:
                raise HTTPException(status_code=400, detail="Order must have at least one item")

            old_items = db.execute(
                select(OrderItem).where(OrderItem.order_id == order_id)
            ).scalars().all()

            if order.status in STATUSES_WITH_STOCK:
                _return_raw_material(old_items, db, order_id=order_id)

            db.query(OrderItemRawMaterial).filter(
                OrderItemRawMaterial.order_item_id.in_([i.id for i in old_items])
            ).delete(synchronize_session=False)
            db.query(OrderItem).filter(OrderItem.order_id == order_id).delete()

            total_price = 0.0
            new_order_items = []
            new_custom_items_data = []
            for item_data in data.items:
                if item_data.product_id:
                    product = db.get(Product, item_data.product_id)
                    if not product:
                        raise HTTPException(status_code=404, detail=f"Product {item_data.product_id} not found")

                    variables = {
                        "quantity": item_data.quantity,
                        "unit_price": product.unit_price,
                        "price": product.unit_price,
                    }

                    if product.formula_script and product.formula_script.strip():
                        try:
                            script_data = {
                                "quantity": item_data.quantity,
                                "unit_price": product.unit_price,
                                "price": product.unit_price,
                                "product_name": product.name,
                                "product_id": product.id,
                                "product_category": product.category,
                                "product_unit_type": product.unit_type,
                                "product_description": product.description,
                            }
                            item_price, _ = run_script(product.formula_script, script_data)
                        except Exception as e:
                            raise HTTPException(status_code=400, detail=f"Script error for product {product.name}: {e}")
                    elif product.formula and product.formula.strip():
                        try:
                            item_price = safe_eval(product.formula, variables)
                        except ValueError as e:
                            raise HTTPException(status_code=400, detail=f"Formula error for product {product.name}: {e}")
                    else:
                        item_price = product.unit_price * item_data.quantity

                    unit_price = round2(item_price / item_data.quantity) if item_data.quantity else product.unit_price
                    if item_data.unit_price is not None:
                        unit_price = item_data.unit_price
                    oi = OrderItem(
                        order_id=order_id,
                        product_id=item_data.product_id,
                        product_name_snapshot=product.name,
                        product_unit_snapshot=product.unit_type,
                        product_formula_snapshot=product.formula,
                        product_formula_script_snapshot=product.formula_script,
                        quantity=item_data.quantity,
                        unit_price=unit_price,
                    )
                else:
                    if not item_data.product_name:
                        raise HTTPException(status_code=400, detail="Custom item must have product_name")
                    user_role_name = user.roles[0].name if user.roles else "user"
                    if item_data.unit_price is None and user_role_name != "designer":
                        raise HTTPException(status_code=400, detail="Custom item must have unit_price")
                    item_price = (item_data.unit_price or 0) * item_data.quantity

                    computed_rm_qty = item_data.raw_material_qty
                    if item_data.raw_material_id and item_data.cut_width_mm and item_data.cut_height_mm:
                        rm = db.get(RawMaterial, item_data.raw_material_id)
                        if not rm:
                            raise HTTPException(status_code=400, detail="Raw material not found")
                        if rm.roll_width_m and item_data.cut_width_mm > rm.roll_width_m * 1000 and (not item_data.cut_height_mm or item_data.cut_height_mm > rm.roll_width_m * 1000):
                            raise HTTPException(status_code=400, detail=f"Отрез {item_data.cut_width_mm}×{item_data.cut_height_mm}мм не влезает в рулон шириной {rm.roll_width_m * 1000}мм ни в одном повороте")
                        computed_rm_qty = _calc_custom_raw_material_qty(rm, item_data.cut_width_mm, item_data.cut_height_mm)

                    oi = OrderItem(
                        order_id=order_id,
                        product_id=None,
                        product_name_snapshot=item_data.product_name,
                        product_unit_snapshot=item_data.product_unit or "шт",
                        product_formula_snapshot=item_data.product_formula,
                        product_formula_script_snapshot=item_data.product_formula_script,
                        raw_material_id=item_data.raw_material_id,
                        raw_material_qty=computed_rm_qty,
                        cut_width_mm=item_data.cut_width_mm,
                        cut_height_mm=item_data.cut_height_mm,
                        quantity=item_data.quantity,
                        unit_price=item_data.unit_price or 0,
                        processing_method=item_data.processing_method,
                        manual_writeoff_pending=item_data.manual_writeoff_pending,
                        manual_writeoff_raw_material_id=item_data.manual_writeoff_raw_material_id,
                        manual_writeoff_cut_width_mm=item_data.manual_writeoff_cut_width_mm,
                        manual_writeoff_cut_height_mm=item_data.manual_writeoff_cut_height_mm,
                        manual_writeoff_quantity=item_data.manual_writeoff_quantity,
                    )

                total_price += round2(item_price)
                db.add(oi)
                new_order_items.append(oi)
                if not item_data.product_id:
                    new_custom_items_data.append((oi, item_data))

            db.flush()

            _snapshot_components(new_order_items, db)

            for oi, item_data in new_custom_items_data:
                raw_materials_list = item_data.raw_materials if item_data.raw_materials else []
                if not raw_materials_list and item_data.raw_material_id:
                    raw_materials_list = [type("RM", (), {"raw_material_id": item_data.raw_material_id, "raw_material_qty": item_data.raw_material_qty, "cut_width_mm": item_data.cut_width_mm, "cut_height_mm": item_data.cut_height_mm})()]
                for rm_data in raw_materials_list:
                    rm_id = rm_data.raw_material_id
                    rm = db.get(RawMaterial, rm_id)
                    if not rm:
                        continue
                    computed_qty = rm_data.raw_material_qty
                    if rm_data.cut_width_mm and rm_data.cut_height_mm:
                        wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == rm_id)).scalar_one_or_none()
                        if wh_item and wh_item.stock_calculation_script:
                            try:
                                from app.models.offcut import Offcut
                                offcuts = db.execute(select(Offcut).where(Offcut.raw_material_id == rm_id)).scalars().all()
                                offcuts_data = [{"width": o.width_mm, "height": o.height_mm} for o in offcuts]
                                script_result, script_data_out = run_script(wh_item.stock_calculation_script, {
                                    "cut_width_mm": rm_data.cut_width_mm, "cut_height_mm": rm_data.cut_height_mm,
                                    "quantity": oi.quantity, "width_mm": rm.width_mm, "height_mm": rm.height_mm,
                                    "roll_width_m": rm.roll_width_m, "roll_length_m": rm.roll_length_m,
                                    "material_name": rm.name,
                                    "processing_method": oi.processing_method or "",
                                    "offcuts": offcuts_data,
                                })
                                if script_data_out.get("error"):
                                    raise HTTPException(status_code=400, detail=script_data_out["error"])
                                computed_qty = script_result / oi.quantity if oi.quantity else script_result
                            except HTTPException:
                                raise
                            except Exception:
                                computed_qty = _calc_custom_raw_material_qty(rm, rm_data.cut_width_mm, rm_data.cut_height_mm)
                        else:
                            computed_qty = _calc_custom_raw_material_qty(rm, rm_data.cut_width_mm, rm_data.cut_height_mm)
                    db.add(OrderItemRawMaterial(
                        order_item_id=oi.id,
                        raw_material_id=rm_id,
                        raw_material_qty=computed_qty,
                        cut_width_mm=rm_data.cut_width_mm,
                        cut_height_mm=rm_data.cut_height_mm,
                    ))
                    if not raw_materials_list or len(raw_materials_list) == 1:
                        oi.raw_material_qty = computed_qty
                        oi.raw_material_id = rm_id

            if order.status in STATUSES_WITH_STOCK:
                _deduct_raw_material(new_order_items, db, order_id=order_id)
            else:
                _check_stock_sufficiency(new_order_items, db)

            order.total_price = round2(total_price)

        if data.client_ids is not None or data.client_id is not None:
            _sync_order_clients(order.id, data.client_ids, data.client_id or order.client_id, db)

        db.commit()
        db.refresh(order)

        if order.status in STATUSES_WITH_STOCK:
            current_items = db.execute(
                select(OrderItem).where(OrderItem.order_id == order_id)
            ).scalars().all()
            _process_order_offcuts(db, order.id, current_items, user)

        if changes:
            log_updated(order, changes, user, db)

        if data.status is not None and data.status != old_status:
            log_status_changed(order, old_status, data.status, user, db)
            try:
                notify_all("order.status_changed", {
                    "order_id": order.id,
                    "old_status": old_status,
                    "new_status": order.status,
                }, db)
            except Exception:
                pass

        order = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .where(Order.id == order.id)
        ).scalars().unique().one()
        return _enrich_order(order, db)
    finally:
        db.close()


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status in STATUSES_WITH_STOCK:
            items = db.execute(
                select(OrderItem).where(OrderItem.order_id == order_id)
            ).scalars().all()
            _return_raw_material(items, db, order_id=order_id)

        oid = order.id
        db.execute(OrderClient.__table__.delete().where(OrderClient.order_id == oid))
        log_deleted(oid, user, db)
        db.delete(order)
        db.commit()
        try:
            notify_all("order.deleted", {"order_id": oid}, db)
        except Exception:
            pass
        order_upload_dir = UPLOAD_DIR / str(oid)
        if order_upload_dir.exists():
            shutil.rmtree(order_upload_dir)
    finally:
        db.close()


UPLOAD_DIR = Path("uploads/orders")
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = {"image/jpeg", "image/png"}


@router.post("/{order_id}/upload-image")
def upload_image(order_id: int, file: UploadFile = File(...), user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Допустимые форматы: JPEG, PNG")

    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        data = file.file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Максимальный размер файла 20 MB")

        ext = "png" if file.content_type == "image/png" else "jpg"
        filename = f"{uuid.uuid4().hex}.{ext}"
        order_dir = UPLOAD_DIR / str(order_id)
        order_dir.mkdir(parents=True, exist_ok=True)
        (order_dir / filename).write_bytes(data)

        image_entry = {
            "url": f"/uploads/orders/{order_id}/{filename}",
            "name": file.filename or filename,
            "size": len(data),
        }

        desc = order.description
        if desc and desc.strip().startswith("{"):
            try:
                parsed = json.loads(desc)
                parsed.setdefault("text", "")
                parsed.setdefault("images", [])
                parsed["images"].append(image_entry)
                order.description = json.dumps(parsed, ensure_ascii=False)
            except json.JSONDecodeError:
                order.description = json.dumps({"text": desc, "images": [image_entry]}, ensure_ascii=False)
        else:
            order.description = json.dumps({"text": desc or "", "images": [image_entry]}, ensure_ascii=False)

        db.commit()
        return image_entry
    finally:
        db.close()


@router.delete("/{order_id}/images/{filename}")
def delete_image(order_id: int, filename: str, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        file_path = UPLOAD_DIR / str(order_id) / filename
        if file_path.exists():
            file_path.unlink()

        if order.description and order.description.strip().startswith("{"):
            try:
                parsed = json.loads(order.description)
                parsed["images"] = [img for img in parsed.get("images", []) if not img["url"].endswith(filename)]
                order.description = json.dumps(parsed, ensure_ascii=False)
                db.commit()
            except json.JSONDecodeError:
                pass

        return {"ok": True}
    finally:
        db.close()


@router.put("/{order_id}/items/{item_id}/toggle", response_model=OrderOut)
def toggle_item_completed(order_id: int, item_id: int, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        item = db.execute(
            select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == order_id)
        ).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Order item not found")

        product = db.get(Product, item.product_id) if item.product_id else None
        item_name = product.name if product else (item.product_name_snapshot or f"#{item.id}")

        item.is_completed = not item.is_completed
        if item.is_completed:
            item.is_printed = True
        db.flush()

        log_item_completed(order, item_name, item.is_completed, user, db)

        all_items = db.execute(
            select(OrderItem).where(OrderItem.order_id == order_id)
        ).scalars().all()

        any_completed = any(i.is_completed for i in all_items)
        all_completed = all(i.is_completed for i in all_items)
        old_status = order.status
        new_status = None

        if all_completed and order.status != "ready":
            items_without_method = [
                i for i in all_items
                if i.raw_material_id and not i.processing_method
            ]
            if items_without_method:
                names = [i.product_name_snapshot or f"#{i.id}" for i in items_without_method]
                item.is_completed = False
                db.flush()
                raise HTTPException(
                    status_code=400,
                    detail=f"Нельзя завершить заказ: не указан способ обработки для позиций: {', '.join(names)}"
                )
            order.status = "ready"
            new_status = "ready"
        elif any_completed and not all_completed and order.status == "new":
            order.status = "in_progress"
            new_status = "in_progress"
        elif order.status == "ready" and not all_completed:
            order.status = "in_progress"
            new_status = "in_progress"

        if new_status and new_status in STATUSES_WITH_STOCK and old_status not in STATUSES_WITH_STOCK:
            logger.debug(f"toggle: deducting stock old={old_status} new={new_status}")
            _deduct_raw_material(all_items, db, order_id=order_id)
        elif new_status and new_status not in STATUSES_WITH_STOCK and old_status in STATUSES_WITH_STOCK:
            logger.debug(f"toggle: returning stock old={old_status} new={new_status}")
            _return_raw_material(all_items, db, order_id=order_id)
        else:
            logger.debug(f"toggle: no stock change old={old_status} new={new_status}")

        db.commit()

        if new_status and new_status in STATUSES_WITH_STOCK and old_status not in STATUSES_WITH_STOCK:
            _process_order_offcuts(db, order_id, all_items, user)

        if new_status:
            log_status_changed(order, old_status, new_status, user, db)
            try:
                notify_all("order.status_changed", {
                    "order_id": order.id,
                    "old_status": old_status,
                    "new_status": new_status,
                }, db)
            except Exception:
                pass

        order = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .where(Order.id == order_id)
        ).scalars().unique().one()
        return _enrich_order(order, db)
    finally:
        db.close()


@router.put("/{order_id}/items/{item_id}/processing-method", response_model=OrderOut)
def set_processing_method(order_id: int, item_id: int, data: dict, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        item = db.execute(
            select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == order_id)
        ).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Order item not found")
        item.processing_method = data.get("processing_method", "")
        db.commit()
        order = db.execute(
            select(Order).options(joinedload(Order.items)).where(Order.id == order_id)
        ).scalars().unique().one()
        return _enrich_order(order, db)
    finally:
        db.close()


@router.put("/{order_id}/items/{item_id}/toggle-printed", response_model=OrderOut)
def toggle_item_printed(order_id: int, item_id: int, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        item = db.execute(
            select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == order_id)
        ).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Order item not found")

        product = db.get(Product, item.product_id) if item.product_id else None
        item_name = product.name if product else (item.product_name_snapshot or f"#{item.id}")

        item.is_printed = not item.is_printed
        if not item.is_printed:
            item.is_completed = False
        db.flush()

        log_item_printed(order, item_name, item.is_printed, user, db)

        db.commit()

        order = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .where(Order.id == order_id)
        ).scalars().unique().one()
        return _enrich_order(order, db)
    finally:
        db.close()


@router.put("/{order_id}/items/{item_id}/save-as-product", response_model=OrderOut)
def save_item_as_product(order_id: int, item_id: int, user: User = Depends(get_current_user)):
    db = SessionFactory()
    try:
        order = db.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        item = db.execute(
            select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == order_id)
        ).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Order item not found")

        if item.product_id:
            raise HTTPException(status_code=400, detail="Item is already linked to a product")

        if not item.product_name_snapshot:
            raise HTTPException(status_code=400, detail="Item has no name to save")

        product = Product(
            name=item.product_name_snapshot,
            unit_price=item.unit_price,
            unit_type=item.product_unit_snapshot or "piece",
            formula=item.product_formula_snapshot,
            formula_script=item.product_formula_script_snapshot,
        )
        db.add(product)
        db.commit()
        db.refresh(product)

        item.product_id = product.id
        db.commit()

        order = db.execute(
            select(Order)
            .options(joinedload(Order.items))
            .where(Order.id == order_id)
        ).scalars().unique().one()
        return _enrich_order(order, db)
    finally:
        db.close()


def _enrich_order(order: Order, db: Session, cache: dict | None = None) -> OrderOut:
    client = (cache["clients"].get(order.client_id) if cache else None) or (db.get(Client, order.client_id) if order.client_id else None)
    items = []
    for oi in (order.items or []):
        if oi.product_id:
            product = cache["products"].get(oi.product_id) if cache else db.get(Product, oi.product_id)
            product_name = product.name if product else oi.product_name_snapshot
            product_unit = product.unit_type if product else oi.product_unit_snapshot
        else:
            product_name = oi.product_name_snapshot
            product_unit = oi.product_unit_snapshot

        if cache:
            orm_entries = cache["item_raw_materials"].get(oi.id, [])
        else:
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
            ).scalars().all()
        raw_materials_out = []
        for orm in orm_entries:
            rm = (cache["raw_materials"].get(orm.raw_material_id) if cache and orm.raw_material_id else (db.get(RawMaterial, orm.raw_material_id) if orm.raw_material_id else None))
            sub_product = None
            if orm.component_product_id:
                sub_product = (cache["products"].get(orm.component_product_id) if cache else db.get(Product, orm.component_product_id))
            raw_materials_out.append({
                "raw_material_id": orm.raw_material_id,
                "component_product_id": orm.component_product_id,
                "raw_material_qty": orm.raw_material_qty,
                "cut_width_mm": orm.cut_width_mm,
                "cut_height_mm": orm.cut_height_mm,
                "raw_material_name": rm.name if rm else None,
                "component_product_name": sub_product.name if sub_product else None,
                "name": orm.name,
                "quantity": orm.quantity or 1,
                "unit_price": orm.unit_price,
            })

        items.append({
            "id": oi.id,
            "product_id": oi.product_id,
            "quantity": oi.quantity,
            "unit_price": oi.unit_price,
            "is_completed": oi.is_completed,
            "is_printed": oi.is_printed,
            "product_name": product_name,
            "product_unit": product_unit,
            "is_custom": oi.product_id is None,
            "raw_material_id": oi.raw_material_id,
            "raw_material_qty": oi.raw_material_qty,
            "cut_width_mm": oi.cut_width_mm,
            "cut_height_mm": oi.cut_height_mm,
            "raw_materials": raw_materials_out,
            "manual_writeoff_pending": oi.manual_writeoff_pending,
            "manual_writeoff_raw_material_id": oi.manual_writeoff_raw_material_id,
            "manual_writeoff_cut_width_mm": oi.manual_writeoff_cut_width_mm,
            "manual_writeoff_cut_height_mm": oi.manual_writeoff_cut_height_mm,
            "manual_writeoff_quantity": oi.manual_writeoff_quantity,
            "manual_writeoff_raw_material_name": None,
            "processing_method": getattr(oi, "processing_method", None),
        })

    for item in items:
        if item["manual_writeoff_pending"] and item["manual_writeoff_raw_material_id"]:
            rm = (cache["raw_materials"].get(item["manual_writeoff_raw_material_id"]) if cache else db.get(RawMaterial, item["manual_writeoff_raw_material_id"]))
            item["manual_writeoff_raw_material_name"] = rm.name if rm else None

    total_items = len(items)
    completed_items = sum(1 for i in items if i["is_completed"])
    progress = round(completed_items / total_items * 100, 1) if total_items > 0 else 0.0

    auto_desc = _build_description(order, items)

    workers = []
    if order.workers:
        try:
            workers = json.loads(order.workers)
        except (json.JSONDecodeError, TypeError):
            workers = []

    if cache:
        order_clients = cache["order_clients"].get(order.id, [])
    else:
        order_clients = _get_order_clients(order.id, db)

    return OrderOut(
        id=order.id,
        client_id=order.client_id,
        total_price=order.total_price,
        status=order.status,
        description=order.description or auto_desc,
        notes=order.notes,
        deadline=order.deadline,
        deadline_start=order.deadline_start,
        designer=order.designer,
        workers=workers,
        layout_type=order.layout_type,
        path=order.path,
        source=order.source,
        created_by=order.created_by,
        created_by_name=order.created_by_name,
        created_by_role=order.created_by_role,
        created_at=order.created_at,
        updated_at=order.updated_at,
        client_name=client.name if client else None,
        clients=order_clients,
        items=items,
        progress=progress,
    )


def _build_order_cache(orders: list[Order], db: Session) -> dict:
    """Preload all related data for a batch of orders in a few queries instead of N+1."""
    order_ids = [o.id for o in orders]
    if not order_ids:
        return {"clients": {}, "products": {}, "raw_materials": {}, "item_raw_materials": {}, "order_clients": {}}

    all_item_ids = [oi.id for o in orders for oi in (o.items or [])]
    all_product_ids = list({oi.product_id for o in orders for oi in (o.items or []) if oi.product_id})
    all_client_ids = list({o.client_id for o in orders if o.client_id})
    all_manual_rm_ids = list({
        oi.manual_writeoff_raw_material_id
        for o in orders for oi in (o.items or [])
        if oi.manual_writeoff_pending and oi.manual_writeoff_raw_material_id
    })

    # OrderItemRawMaterial for all items at once
    item_raw_materials: dict[int, list] = {}
    if all_item_ids:
        orm_rows = db.execute(
            select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id.in_(all_item_ids))
        ).scalars().all()
        for orm in orm_rows:
            item_raw_materials.setdefault(orm.order_item_id, []).append(orm)

    # Collect all raw_material_ids (from OrderItemRawMaterial + manual_writeoff + oi.raw_material_id)
    all_rm_ids = set(all_manual_rm_ids)
    for orm_list in item_raw_materials.values():
        for orm in orm_list:
            if orm.raw_material_id:
                all_rm_ids.add(orm.raw_material_id)
            if orm.component_product_id:
                all_product_ids.append(orm.component_product_id)
    all_product_ids = list(set(all_product_ids))
    for o in orders:
        for oi in (o.items or []):
            if oi.raw_material_id:
                all_rm_ids.add(oi.raw_material_id)

    # Batch-load RawMaterials
    raw_materials: dict[int, RawMaterial] = {}
    if all_rm_ids:
        rm_rows = db.execute(
            select(RawMaterial).where(RawMaterial.id.in_(list(all_rm_ids)))
        ).scalars().all()
        for rm in rm_rows:
            raw_materials[rm.id] = rm

    # Batch-load Products
    products: dict[int, Product] = {}
    if all_product_ids:
        prod_rows = db.execute(
            select(Product).where(Product.id.in_(all_product_ids))
        ).scalars().all()
        for p in prod_rows:
            products[p.id] = p

    # Batch-load Clients (from order.client_id + OrderClient)
    order_clients_rows = db.execute(
        select(OrderClient).where(OrderClient.order_id.in_(order_ids))
        .order_by(OrderClient.is_primary.desc(), OrderClient.id)
    ).scalars().all()
    oc_client_ids = list({oc.client_id for oc in order_clients_rows})
    all_client_ids = list(set(all_client_ids + oc_client_ids))

    clients: dict[int, Client] = {}
    if all_client_ids:
        client_rows = db.execute(
            select(Client).where(Client.id.in_(all_client_ids))
        ).scalars().all()
        for c in client_rows:
            clients[c.id] = c

    # Group order_clients by order_id
    order_clients: dict[int, list[dict]] = {}
    for oc in order_clients_rows:
        c = clients.get(oc.client_id)
        if c:
            order_clients.setdefault(oc.order_id, []).append({"id": c.id, "name": c.name})

    return {
        "clients": clients,
        "products": products,
        "raw_materials": raw_materials,
        "item_raw_materials": item_raw_materials,
        "order_clients": order_clients,
    }


_UNIT_LABELS = {"piece": "шт.", "sheet": "лист", "m2": "м²", "roll": "рулон", "set": "комплект"}


def _build_description(order, items):
    parts = []
    for item in items:
        name = item["product_name"] or f"#{item.get('product_id', '?')}"
        unit = _UNIT_LABELS.get(item["product_unit"], item["product_unit"] or "шт.")
        parts.append(f"{name} — {item['quantity']} {unit}")
    return "\n".join(parts) if parts else None
