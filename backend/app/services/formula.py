import ast
import operator
import math

_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_CONSTANTS = {
    "pi": math.pi,
    "e": math.e,
}


def safe_eval(formula: str, variables: dict[str, float]) -> float:
    """Safely evaluate a mathematical formula with given variables.

    Supported: +, -, *, /, //, %, **, parentheses, pi, e.
    No function calls, no attribute access, no imports.
    """
    tree = ast.parse(formula, mode="eval")
    return _eval_node(tree.body, variables)


def _eval_node(node: ast.AST, variables: dict[str, float]) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, variables)

    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)

    if isinstance(node, ast.Name):
        name = node.id
        if name in variables:
            return float(variables[name])
        if name in _CONSTANTS:
            return _CONSTANTS[name]
        raise ValueError(f"Unknown variable: {name}")

    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in _ALLOWED_OPS:
            raise ValueError(f"Unsupported operator: {op_type.__name__}")
        left = _eval_node(node.left, variables)
        right = _eval_node(node.right, variables)
        return float(_ALLOWED_OPS[op_type](left, right))

    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _ALLOWED_OPS:
            raise ValueError(f"Unsupported operator: {op_type.__name__}")
        operand = _eval_node(node.operand, variables)
        return float(_ALLOWED_OPS[op_type](operand))

    raise ValueError(f"Unsupported expression: {ast.dump(node)}")


def validate_formula(formula: str) -> set[str]:
    """Parse formula and return set of variable names used."""
    if not formula or not formula.strip():
        return set()
    tree = ast.parse(formula, mode="eval")
    return _collect_names(tree.body)


def _collect_names(node: ast.AST) -> set[str]:
    names: set[str] = set()
    if isinstance(node, ast.Expression):
        names |= _collect_names(node.body)
    elif isinstance(node, ast.Name):
        names.add(node.id)
    elif isinstance(node, ast.BinOp):
        names |= _collect_names(node.left)
        names |= _collect_names(node.right)
    elif isinstance(node, ast.UnaryOp):
        names |= _collect_names(node.operand)
    return names
