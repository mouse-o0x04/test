def calculate(data):
    q = data["quantity"]
    p = data["unit_price"]
    cat = data.get("product_category") or ""
    if cat == "premium":
        return q * p * 1.5
    return q * p
