def calculate(data):
    """Раскрой листовых материалов, двухэтапный алгоритм.

    Этап 1: Лист делится на заготовки подходящего размера для станка
    Этап 2: Каждая заготовка раскраивается на изделия

    data:
        quantity: количество изделий
        width_mm: ширина листа, мм
        height_mm: высота листа, мм
        cut_width_mm: ширина отреза, мм
        cut_height_mm: высота отреза, мм
        material_name: название материала
        processing_method: способ обработки (Фреза/Лазер/Ручная резка)
        offcuts: обрезки [{"width": мм, "height": мм}]
    returns: dict
    """
    quantity = data.get('quantity', 0)
    sheet_w = data.get('width_mm', 0)
    sheet_h = data.get('height_mm', 0)
    cut_w = data.get('cut_width_mm', 0)
    cut_h = data.get('cut_height_mm', 0)
    processing_method = data.get('processing_method', '')
    offcuts = data.get('offcuts', [])

    if not quantity or not sheet_w or not sheet_h or not cut_w or not cut_h:
        return {"sheets_to_write_off": 0, "new_offcuts": [], "error": "Не указаны размеры"}

    KERF = 3

    MACHINES = {
        "Лазер": {"blank_w": 1300, "blank_h": 900},
        "Фреза": {"blank_w": 1000, "blank_h": 2000},
        "Ручная резка": {"blank_w": sheet_w, "blank_h": sheet_h},
    }

    # Размер заготовки
    if processing_method and processing_method in MACHINES:
        blank_w = min(sheet_w, MACHINES[processing_method]["blank_w"])
        blank_h = min(sheet_h, MACHINES[processing_method]["blank_h"])
    else:
        blank_w = sheet_w
        blank_h = sheet_h

    # Проверяем влезает ли изделие в заготовку (с учётом KERF и поворота)
    c_w = cut_w + KERF
    c_h = cut_h + KERF
    fits_a = c_w <= blank_w and c_h <= blank_h
    fits_b = c_h <= blank_w and c_w <= blank_h
    if not fits_a and not fits_b:
        return {
            "error": f"Изделие {cut_w}×{cut_h} (с зазором {c_w}×{c_h}) не влезает в заготовку {blank_w}×{blank_h}",
            "sheets_to_write_off": 0, "new_offcuts": [],
        }

    # ЭТАП 1: Сколько заготовок влезает в лист
    blanks_x = int(sheet_w // blank_w)
    blanks_y = int(sheet_h // blank_h)
    blanks_per_sheet = blanks_x * blanks_y

    # Остаток после деления листа на заготовки
    rem_w = sheet_w - blanks_x * blank_w
    rem_h = sheet_h - blanks_y * blank_h

    # ЭТАП 2: Сколько изделий на одной заготовке (с учётом поворота)
    fit_a = int(blank_w // c_w) * int(blank_h // c_h)
    fit_b = int(blank_w // c_h) * int(blank_h // c_w)
    items_per_blank = max(fit_a, fit_b)

    if items_per_blank < 1:
        return {"sheets_to_write_off": 0, "new_offcuts": [], "error": "Изделие не влезает на заготовку"}

    items_per_sheet = blanks_per_sheet * items_per_blank

    # РАСЧЁТ: сначала обрезки, потом полные листы
    remaining = quantity
    offcuts_used = []
    used_full_sheets = 0
    blanks_unused_last = 0
    items_in_last_blank = 0

    sorted_offcuts = sorted(offcuts, key=lambda o: o.get('width', 0) * o.get('height', 0), reverse=True)
    for offcut in sorted_offcuts:
        if remaining <= 0:
            break
        ow, oh = offcut.get('width', 0), offcut.get('height', 0)
        # Проверяем: изделие влезает напрямую в обрезок (без заготовки)
        fits_a = c_w <= ow and c_h <= oh
        fits_b = c_h <= ow and c_w <= oh
        if fits_a:
            cols = int(ow // c_w)
            rows = int(oh // c_h)
            items_from_offcut = cols * rows
            items_used = min(items_from_offcut, remaining)
            full_rows = items_used // cols
            last_cols = items_used % cols
            used_rows = full_rows + (1 if last_cols > 0 else 0)
            oc_rem_w = ow
            oc_rem_h = oh - used_rows * c_h
            if oc_rem_h >= c_h:
                offcuts_used.append({
                    "width": ow, "height": oh,
                    "items_used": items_used,
                    "remaining_width": oc_rem_w,
                    "remaining_height": oc_rem_h
                })
            else:
                offcuts_used.append({
                    "width": ow, "height": oh,
                    "items_used": items_used,
                    "remaining_width": 0,
                    "remaining_height": 0
                })
        elif fits_b:
            cols = int(ow // c_h)
            rows = int(oh // c_w)
            items_from_offcut = cols * rows
            items_used = min(items_from_offcut, remaining)
            full_rows = items_used // cols
            last_cols = items_used % cols
            used_rows = full_rows + (1 if last_cols > 0 else 0)
            oc_rem_w = ow
            oc_rem_h = oh - used_rows * c_w
            if oc_rem_h >= c_w:
                offcuts_used.append({
                    "width": ow, "height": oh,
                    "items_used": items_used,
                    "remaining_width": oc_rem_w,
                    "remaining_height": oc_rem_h
                })
            else:
                offcuts_used.append({
                    "width": ow, "height": oh,
                    "items_used": items_used,
                    "remaining_width": 0,
                    "remaining_height": 0
                })
        else:
            continue

        if items_from_offcut >= remaining:
            remaining = 0
        else:
            remaining -= items_from_offcut

    while remaining > 0:
        blanks_needed_total = -(-remaining // items_per_blank)
        sheets_needed = -(-blanks_needed_total // blanks_per_sheet)
        used_full_sheets += sheets_needed

        blanks_in_last_sheet = blanks_needed_total - (sheets_needed - 1) * blanks_per_sheet
        items_on_full_sheets = (sheets_needed - 1) * items_per_sheet
        items_in_last_sheet = remaining - items_on_full_sheets
        items_in_last_blank = items_in_last_sheet - (blanks_in_last_sheet - 1) * items_per_blank
        blanks_unused_last = blanks_per_sheet - blanks_in_last_sheet

        remaining = 0

    # ОБРЕЗКИ после деления листа на заготовки (только если использовали листы)
    new_offcuts = []
    if used_full_sheets > 0:
    # Остатки от деления листа на заготовки (боковые полосы)
        if rem_w > 0 and blank_h > 0:
            new_offcuts.append({"width": rem_w, "height": blank_h * blanks_y})
        if rem_h > 0 and blank_w > 0:
            new_offcuts.append({"width": blank_w * blanks_x, "height": rem_h})

    # Неиспользованные заготовки с последнего листа
        for _ in range(blanks_unused_last):
            new_offcuts.append({"width": blank_w, "height": blank_h})

    # Остаток последней использованной заготовки
        if items_in_last_blank > 0 and items_in_last_blank < items_per_blank:
            if fit_a >= fit_b:
                cols = int(blank_w // c_w)
                item_h_used = c_h
            else:
                cols = int(blank_w // c_h)
                item_h_used = c_w
            used_rows = -(-items_in_last_blank // cols)
            blank_rem_h = blank_h - used_rows * item_h_used
            min_dim = min(c_w, c_h)
            if blank_rem_h > 0 and blank_w >= min_dim and blank_rem_h >= min_dim:
                new_offcuts.append({"width": blank_w, "height": blank_rem_h})

    return {
        "sheets_to_write_off": used_full_sheets,
        "offcuts_used": offcuts_used,
        "new_offcuts": new_offcuts,
        "items_per_blank": items_per_blank,
    }


def format(data):
    """Отображение остатков листового материала — только целые листы."""
    total = data.get("totalQuantity", 0)
    w = data.get("width_mm", 0)
    h = data.get("height_mm", 0)
    whole = int(total)
    if w and h:
        sub = f"Лист {w}×{h} мм"
    else:
        sub = ""
    if whole == 0:
        main = "0 листов"
    elif whole == 1:
        main = "1 лист"
    else:
        main = f"{whole} лист(ов)"
    return {"main": main, "sub": sub}
