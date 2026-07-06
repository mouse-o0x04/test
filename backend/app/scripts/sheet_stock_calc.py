def calculate(data):
    """Расход листового материала.

    data:
        cut_width_mm: ширина отреза, мм
        cut_height_mm: высота отреза, мм
        quantity: количество отрезов
        width_mm: ширина листа, мм
        height_mm: высота листа, мм
    returns: количество листов для списания
    """
    cut_w = data.get("cut_width_mm", 0)
    cut_h = data.get("cut_height_mm", 0)
    qty = data.get("quantity", 1)
    sw = data.get("width_mm", 0)
    sh = data.get("height_mm", 0)

    if not sw or not sh or not cut_w or not cut_h:
        return 0

    fit_a = int(sw // cut_w) * int(sh // cut_h)
    fit_b = int(sw // cut_h) * int(sh // cut_w)
    fit = max(fit_a, fit_b)
    if fit < 1:
        return 0
    per_piece = 1.0 / fit
    return round(per_piece * qty, 6)


def format(data):
    """Отображение остатков листового материала."""
    total = data.get("totalQuantity", 0)
    w = data.get("width_mm", 0)
    h = data.get("height_mm", 0)
    if w and h:
        sub = f"Лист {w}×{h} мм"
    else:
        sub = ""
    main = f"{total} лист(ов)" if total != 1 else f"{total} лист"
    return {"main": main, "sub": sub}
