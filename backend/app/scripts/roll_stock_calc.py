def calculate(data):
    """Расход рулонного материала.

    data:
        cut_width_mm: ширина отреза, мм
        cut_height_mm: высота отреза, мм
        quantity: количество отрезов
        roll_width_m: ширина рулона, м
    returns: количество метров рулона для списания
    """
    cut_w = data.get("cut_width_mm", 0)
    cut_h = data.get("cut_height_mm", 0)
    qty = data.get("quantity", 1)
    roll_width_m = data.get("roll_width_m", 0)

    if not roll_width_m or not cut_w or not cut_h:
        return 0

    roll_width_mm = roll_width_m * 1000
    options = []
    fit_a = int(roll_width_mm // cut_w)
    if fit_a >= 1:
        meters_a = (cut_h / 1000) / fit_a
        options.append(meters_a)
    fit_b = int(roll_width_mm // cut_h)
    if fit_b >= 1:
        meters_b = (cut_w / 1000) / fit_b
        options.append(meters_b)
    if not options:
        return 0
    per_piece = min(options)
    return round(per_piece * qty, 6)


def format(data):
    """Отображение остатков рулонного материала."""
    total = data.get("totalQuantity", 0)
    roll_len = data.get("rollLength", 0)
    if roll_len <= 0:
        return {"main": f"{total} м", "sub": ""}
    rolls = int(total // roll_len)
    leftover = round(total % roll_len, 2)
    roll_word = "рулон" if rolls == 1 else "рулона" if 2 <= rolls <= 4 else "рулонов"
    main = f"{rolls} {roll_word}"
    if leftover > 0:
        main += f" + {leftover} м"
    sub = f"Остаток: {total} м ({roll_len}м/рулон)"
    return {"main": main, "sub": sub}
