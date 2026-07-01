import json
import os
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent.parent / "scripts"
SCRIPTS_DIR.mkdir(exist_ok=True)

DENIED_BUILTINS = {"open", "exec", "eval", "__import__", "compile", "breakpoint", "exit", "quit"}
DENIED_MODULES = {"os", "sys", "subprocess", "shutil", "pathlib", "socket", "http", "urllib", "requests", "ctypes", "importlib"}


def list_scripts() -> list[dict]:
    scripts = []
    for f in sorted(SCRIPTS_DIR.glob("*.py")):
        scripts.append({
            "name": f.stem,
            "filename": f.name,
            "size": f.stat().st_size,
            "modified": f.stat().st_mtime,
        })
    return scripts


def get_script(name: str) -> str | None:
    path = SCRIPTS_DIR / f"{name}.py"
    if not path.exists():
        return None
    return path.read_text()


def save_script(name: str, content: str) -> dict:
    safe_name = "".join(c for c in name if c.isalnum() or c in "_-")
    if not safe_name:
        raise ValueError("Invalid script name")
    path = SCRIPTS_DIR / f"{safe_name}.py"
    path.write_text(content)
    return {"name": safe_name, "filename": path.name, "size": path.stat().st_size}


def delete_script(name: str) -> bool:
    path = SCRIPTS_DIR / f"{name}.py"
    if path.exists():
        path.unlink()
        return True
    return False


def run_script(name: str, data: dict) -> float:
    path = SCRIPTS_DIR / f"{name}.py"
    if not path.exists():
        raise FileNotFoundError(f"Script '{name}' not found")

    code = path.read_text()

    safe_builtins = {k: v for k, v in __builtins__.__dict__.items() if k not in DENIED_BUILTINS} if hasattr(__builtins__, "__dict__") else {}

    namespace = {
        "__builtins__": safe_builtins,
        "json": json,
        "math": __import__("math"),
        "round": round,
        "int": int,
        "float": float,
        "str": str,
        "bool": bool,
        "len": len,
        "min": min,
        "max": max,
        "abs": abs,
        "sum": sum,
        "enumerate": enumerate,
        "zip": zip,
        "sorted": sorted,
        "map": map,
        "filter": filter,
        "list": list,
        "dict": dict,
        "tuple": tuple,
        "set": set,
        "True": True,
        "False": False,
        "None": None,
    }

    exec(code, namespace)

    calc_fn = namespace.get("calculate")
    if calc_fn is None:
        raise ValueError(f"Script '{name}' must define a calculate(data) function")

    result = calc_fn(data)

    if not isinstance(result, (int, float)):
        raise ValueError(f"Script '{name}' must return a number, got {type(result).__name__}")

    return float(result)


def run_display_script(name: str, data: dict) -> dict:
    """Run a display format script. Must define format(data) -> dict with 'main' and 'sub' keys."""
    path = SCRIPTS_DIR / f"{name}.py"
    if not path.exists():
        raise FileNotFoundError(f"Script '{name}' not found")

    code = path.read_text()

    safe_builtins = {k: v for k, v in __builtins__.__dict__.items() if k not in DENIED_BUILTINS} if hasattr(__builtins__, "__dict__") else {}

    namespace = {
        "__builtins__": safe_builtins,
        "json": json,
        "math": __import__("math"),
        "round": round,
        "int": int,
        "float": float,
        "str": str,
        "bool": bool,
        "len": len,
        "min": min,
        "max": max,
        "abs": abs,
        "sum": sum,
        "enumerate": enumerate,
        "zip": zip,
        "sorted": sorted,
        "map": map,
        "filter": filter,
        "list": list,
        "dict": dict,
        "tuple": tuple,
        "set": set,
        "True": True,
        "False": False,
        "None": None,
    }

    exec(code, namespace)

    format_fn = namespace.get("format")
    if format_fn is None:
        raise ValueError(f"Script '{name}' must define a format(data) function")

    result = format_fn(data)

    if not isinstance(result, dict):
        raise ValueError(f"Script '{name}' must return a dict, got {type(result).__name__}")

    return result
