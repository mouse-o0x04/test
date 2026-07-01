def calculate(data):
    quantity = data["quantity"]
    unit_price = data["unit_price"]
    if quantity >= 1000:
        return quantity * unit_price * 0.8
    elif quantity >= 500:
        return quantity * unit_price * 0.9
    else:
        return quantity * unit_price
