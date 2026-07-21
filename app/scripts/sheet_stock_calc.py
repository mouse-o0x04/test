def calculate(data):
    """Расход листового материала (бумага).

    Округление вверх до половины листа — на складе учитываются
    только целые листы (1) или половинки (0.5).

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

    raw = (1.0 / fit) * qty
    half_sheets = math.ceil(raw * 2)
    return half_sheets / 2


def format(data):
    """Отображение остатков листового материала — целые листы и половинки."""
    total = data.get("totalQuantity", 0)
    w = data.get("width_mm", 0)
    h = data.get("height_mm", 0)
    if w and h:
        sub = f"Лист {w}×{h} мм"
    else:
        sub = ""
    if total == int(total):
        whole = int(total)
        if whole == 0:
            main = "0 листов"
        elif whole == 1:
            main = "1 лист"
        else:
            main = f"{whole} лист(ов)"
    else:
        main = f"{total} лист(ов)"
    return {"main": main, "sub": sub}
