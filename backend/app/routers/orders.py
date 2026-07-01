import json
import logging
import math
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger("orders_stock")
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.database import Session as SessionFactory
from app.models.client import Client
from app.models.order import Order, OrderHistory, OrderItem
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


STATUSES_WITH_STOCK = {"in_progress", "ready", "delivered"}


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


def _calc_all_materials_needed(product: Product, quantity: int, cut_width_mm: float = None, cut_height_mm: float = None) -> list[tuple[int, float]]:
    """Return list of (raw_material_id, needed_qty) for all materials of this product."""
    from app.models.product_raw_material import ProductRawMaterial
    db = SessionFactory()
    try:
        prm_entries = db.execute(
            select(ProductRawMaterial).where(ProductRawMaterial.product_id == product.id)
        ).scalars().all()

        pw = cut_width_mm or product.default_cut_width_mm
        ph = cut_height_mm or product.default_cut_height_mm

        if prm_entries:
            results = []
            for prm in prm_entries:
                material = db.get(RawMaterial, prm.raw_material_id)
                if not material:
                    continue
                needed = _calc_single_material_needed(material, quantity, prm.coefficient, db, pw, ph)
                if needed > 0:
                    results.append((prm.raw_material_id, needed))
            return results

        if product.raw_material_id:
            material = db.get(RawMaterial, product.raw_material_id)
            if material:
                needed = _calc_single_material_needed(material, quantity, product.material_coefficient, db, pw, ph)
                if needed > 0:
                    return [(product.raw_material_id, needed)]
        return []
    finally:
        db.close()


def _calc_single_material_needed(material: RawMaterial, quantity: int, coefficient: float, db, cut_width_mm: float = None, cut_height_mm: float = None) -> float:
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
        }
        try:
            return float(run_script(wh_item.stock_calculation_script, script_data))
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


def _deduct_raw_material(order_items: list, db: Session, order_id: int = None):
    from app.models.raw_material import RawMaterial
    from app.models.stock_writeoff import StockWriteoff
    for oi in order_items:
        if oi.product_id:
            product = db.get(Product, oi.product_id)
            if not product:
                continue
            materials_needed = _calc_all_materials_needed(product, oi.quantity)
            if not materials_needed:
                logger.debug(f"deduct: skip oi#{oi.id} product={oi.product_id} no materials needed")
                continue
            for raw_material_id, needed in materials_needed:
                _do_deduct(db, oi, raw_material_id, needed, order_id)
        else:
            orm_entries = db.execute(
                select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
            ).scalars().all()
            if orm_entries:
                for orm in orm_entries:
                    needed = (orm.raw_material_qty or 0) * oi.quantity
                    if needed > 0:
                        _do_deduct(db, oi, orm.raw_material_id, needed, order_id)
            elif oi.raw_material_id and oi.raw_material_qty and oi.raw_material_qty > 0:
                needed = oi.raw_material_qty * oi.quantity
                _do_deduct(db, oi, oi.raw_material_id, needed, order_id)
            else:
                logger.debug(f"deduct: skip oi#{oi.id} no product and no raw_material info")


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
            materials_needed = _calc_all_materials_needed(product, oi.quantity)
            if not materials_needed:
                continue
            for raw_material_id, needed in materials_needed:
                _do_return(db, oi, raw_material_id, needed, order_id)
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
                total = run_script(product.formula_script, script_data)
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
        return [_enrich_order(o, db) for o in orders]
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
                if item_data.unit_price is None:
                    raise HTTPException(status_code=400, detail="Custom item must have unit_price")
                item_price = item_data.unit_price * item_data.quantity

                computed_rm_qty = item_data.raw_material_qty
                if item_data.raw_material_id and item_data.cut_width_mm and item_data.cut_height_mm:
                    rm = db.get(RawMaterial, item_data.raw_material_id)
                    if not rm:
                        raise HTTPException(status_code=400, detail="Raw material not found")
                    if rm.roll_width_m and item_data.cut_width_mm > rm.roll_width_m * 1000:
                        raise HTTPException(status_code=400, detail=f"Cut width {item_data.cut_width_mm}mm exceeds roll width {rm.roll_width_m * 1000}mm")
                    wh_item = db.execute(select(WarehouseItem).where(WarehouseItem.raw_material_id == rm.id)).scalar_one_or_none()
                    if wh_item and wh_item.stock_calculation_script:
                        script_data = {
                            "cut_width_mm": item_data.cut_width_mm,
                            "cut_height_mm": item_data.cut_height_mm,
                            "quantity": item_data.quantity,
                            "width_mm": rm.width_mm,
                            "height_mm": rm.height_mm,
                            "roll_width_m": rm.roll_width_m,
                            "roll_length_m": rm.roll_length_m,
                        }
                        try:
                            computed_rm_qty = run_script(wh_item.stock_calculation_script, script_data)
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
                    unit_price=item_data.unit_price,
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

        for oi in order_items:
            oi.order_id = order.id
            db.add(oi)
        db.flush()

        for oi, item_data in custom_items_data:
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
                            computed_qty = run_script(wh_item.stock_calculation_script, {
                                "cut_width_mm": rm_data.cut_width_mm, "cut_height_mm": rm_data.cut_height_mm,
                                "quantity": oi.quantity, "width_mm": rm.width_mm, "height_mm": rm.height_mm,
                                "roll_width_m": rm.roll_width_m, "roll_length_m": rm.roll_length_m,
                            })
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
            logger.debug(f"create: no stock deduction for status={data.status}")

        db.commit()
        db.refresh(order)

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

            if not stock_was_active and new_stock_active:
                _deduct_raw_material(current_items, db, order_id=order_id)
            elif stock_was_active and not new_stock_active:
                _return_raw_material(current_items, db, order_id=order_id)

            order.status = data.status
            if data.status == "ready":
                for i in current_items:
                    i.is_completed = True
            elif data.status not in ("new", "in_progress"):
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
                    if item_data.unit_price is None:
                        raise HTTPException(status_code=400, detail="Custom item must have unit_price")
                    item_price = item_data.unit_price * item_data.quantity

                    computed_rm_qty = item_data.raw_material_qty
                    if item_data.raw_material_id and item_data.cut_width_mm and item_data.cut_height_mm:
                        rm = db.get(RawMaterial, item_data.raw_material_id)
                        if not rm:
                            raise HTTPException(status_code=400, detail="Raw material not found")
                        if rm.roll_width_m and item_data.cut_width_mm > rm.roll_width_m * 1000:
                            raise HTTPException(status_code=400, detail=f"Cut width {item_data.cut_width_mm}mm exceeds roll width {rm.roll_width_m * 1000}mm")
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
                        unit_price=item_data.unit_price,
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
                                computed_qty = run_script(wh_item.stock_calculation_script, {
                                    "cut_width_mm": rm_data.cut_width_mm, "cut_height_mm": rm_data.cut_height_mm,
                                    "quantity": oi.quantity, "width_mm": rm.width_mm, "height_mm": rm.height_mm,
                                    "roll_width_m": rm.roll_width_m, "roll_length_m": rm.roll_length_m,
                                })
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

            if order.status in STATUSES_WITH_STOCK:
                _deduct_raw_material(new_order_items, db, order_id=order_id)

            order.total_price = round2(total_price)

        db.commit()
        db.refresh(order)

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
        log_deleted(oid, user, db)
        db.delete(order)
        db.commit()
        try:
            notify_all("order.deleted", {"order_id": oid}, db)
        except Exception:
            pass
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

        product = db.get(Product, item.product_id)
        item_name = product.name if product else f"#{item.product_id}"

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

        product = db.get(Product, item.product_id)
        item_name = product.name if product else f"#{item.product_id}"

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


def _enrich_order(order: Order, db: Session) -> OrderOut:
    client = db.get(Client, order.client_id)
    items = []
    for oi in (order.items or []):
        if oi.product_id:
            product = db.get(Product, oi.product_id)
            product_name = product.name if product else oi.product_name_snapshot
            product_unit = product.unit_type if product else oi.product_unit_snapshot
        else:
            product_name = oi.product_name_snapshot
            product_unit = oi.product_unit_snapshot

        orm_entries = db.execute(
            select(OrderItemRawMaterial).where(OrderItemRawMaterial.order_item_id == oi.id)
        ).scalars().all()
        raw_materials_out = []
        for orm in orm_entries:
            rm = db.get(RawMaterial, orm.raw_material_id)
            raw_materials_out.append({
                "raw_material_id": orm.raw_material_id,
                "raw_material_qty": orm.raw_material_qty,
                "cut_width_mm": orm.cut_width_mm,
                "cut_height_mm": orm.cut_height_mm,
                "raw_material_name": rm.name if rm else None,
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
        })

    for item in items:
        if item["manual_writeoff_pending"] and item["manual_writeoff_raw_material_id"]:
            rm = db.get(RawMaterial, item["manual_writeoff_raw_material_id"])
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

    return OrderOut(
        id=order.id,
        client_id=order.client_id,
        total_price=order.total_price,
        status=order.status,
        description=order.description or auto_desc,
        notes=order.notes,
        deadline=order.deadline,
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
        items=items,
        progress=progress,
    )


_UNIT_LABELS = {"piece": "шт.", "sheet": "лист", "m2": "м²", "roll": "рулон", "set": "комплект"}


def _build_description(order, items):
    parts = []
    for item in items:
        name = item["product_name"] or f"#{item.get('product_id', '?')}"
        unit = _UNIT_LABELS.get(item["product_unit"], item["product_unit"] or "шт.")
        parts.append(f"{name} — {item['quantity']} {unit}")
    return ", ".join(parts) if parts else None
