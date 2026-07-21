from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user, require_permission
from app.auth.jwt import create_access_token, hash_password, verify_password
from app.database import SessionCore, get_db_core
from app.models.user import Permission, Role, User
from app.schemas.auth import (
    LoginRequest,
    PermissionCreate,
    PermissionOut,
    RoleCreate,
    RoleOut,
    TokenResponse,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/auth", tags=["auth"])

DEFAULT_PERMISSIONS = [
    ("clients.view", "View clients"),
    ("clients.create", "Create clients"),
    ("clients.edit", "Edit clients"),
    ("clients.delete", "Delete clients"),
    ("products.view", "View products"),
    ("products.create", "Create products"),
    ("products.edit", "Edit products"),
    ("products.delete", "Delete products"),
    ("orders.view", "View orders"),
    ("orders.create", "Create orders"),
    ("orders.edit", "Edit orders"),
    ("orders.delete", "Delete orders"),
    ("warehouse.view", "View warehouse"),
    ("warehouse.create", "Create warehouse items"),
    ("warehouse.edit", "Edit warehouse items"),
    ("warehouse.delete", "Delete warehouse items"),
    ("hermes.view", "View hermes agents"),
    ("hermes.manage", "Manage hermes agents"),
    ("users.view", "View users"),
    ("users.manage", "Manage users"),
    ("roles.manage", "Manage roles"),
    ("prices.view", "View prices"),
    ("prices.revenue", "View total revenue"),
]


def _ensure_default_data(db: Session):
    existing = db.execute(select(Permission).limit(1)).scalar_one_or_none()
    if existing:
        existing_names = {p.name for p in db.execute(select(Permission)).scalars().all()}
        new_perms = [(n, d) for n, d in DEFAULT_PERMISSIONS if n not in existing_names]
        if new_perms:
            for name, desc in new_perms:
                db.add(Permission(name=name, description=desc))
            db.flush()
            admin_role = db.execute(select(Role).where(Role.name == "admin")).scalar_one_or_none()
            if admin_role:
                all_perms = db.execute(select(Permission)).scalars().all()
                admin_role.permissions = list(all_perms)
            user_role = db.execute(select(Role).where(Role.name == "user")).scalar_one_or_none()
            if user_role:
                all_perms = db.execute(select(Permission)).scalars().all()
                user_role.permissions = [p for p in all_perms if p.name.endswith(".view")]
            db.commit()
        return

    perm_map = {}
    for name, desc in DEFAULT_PERMISSIONS:
        p = Permission(name=name, description=desc)
        db.add(p)
        db.flush()
        perm_map[name] = p

    admin_role = Role(name="admin", description="Администратор")
    director_role = Role(name="director", description="Руководитель")
    manager_role = Role(name="manager", description="Менеджер")
    designer_role = Role(name="designer", description="Дизайнер")
    production_role = Role(name="production", description="Работник производства")
    user_role = Role(name="user", description="Пользователь")
    db.add_all([admin_role, director_role, manager_role, designer_role, production_role, user_role])
    db.flush()

    all_perm_names = list(perm_map.keys())

    view_perms = [perm_map[n] for n in all_perm_names if n.endswith(".view")]
    edit_perms = [perm_map[n] for n in all_perm_names if not n.endswith(".view") and not n.endswith(".delete")]

    admin_role.permissions = [perm_map[n] for n in all_perm_names]

    director_role.permissions = [perm_map[n] for n in all_perm_names if n != "roles.manage" and n != "users.manage"]

    manager_role.permissions = [
        perm_map[n] for n in all_perm_names
        if (n.endswith(".view") or n.endswith(".create") or n.endswith(".edit"))
        and not n.startswith("warehouse.") and not n.startswith("hermes.")
        and not n.startswith("users.") and not n.startswith("roles.")
    ]
    manager_role.permissions.append(perm_map["prices.view"])

    designer_role.permissions = [perm_map[n] for n in all_perm_names if n.endswith(".view") and n != "prices.view" and n != "prices.revenue"]

    production_role.permissions = [
        perm_map[n] for n in all_perm_names
        if (n.endswith(".view") or n.endswith(".edit"))
        and not n.startswith("clients.") and not n.startswith("orders.")
        and not n.startswith("hermes.") and not n.startswith("users.")
        and not n.startswith("roles.") and n != "prices.view" and n != "prices.revenue"
    ]

    user_role.permissions = [perm_map[n] for n in all_perm_names if n.endswith(".view") and n != "prices.view" and n != "prices.revenue"]

    db.flush()

    admin_user = User(
        username="admin",
        email="admin@crm.local",
        hashed_password=hash_password("admin"),
        full_name="Administrator",
        is_superuser=True,
    )
    admin_user.roles = [admin_role]
    db.add(admin_user)
    db.commit()


def _ensure_order_settings():
    from app.models.order_settings import OrderSettings
    from sqlalchemy import select as sa_select
    core_db = SessionCore()
    try:
        existing = core_db.execute(sa_select(OrderSettings).limit(1)).scalar_one_or_none()
        if existing:
            return

        defaults = [
            ("status_color", "Новый", "#1677ff", 0),
            ("status_color", "В работе", "#fa8c16", 1),
            ("status_color", "Готов", "#52c41a", 2),
            ("status_color", "Отдали", "#8c8c8c", 3),
            ("designer_color", "Анна К.", "#1677ff", 0),
            ("designer_color", "Сергей М.", "#52c41a", 1),
            ("designer_color", "Елена В.", "#fa8c16", 2),
            ("worker_color", "Павел Т.", "#1677ff", 0),
            ("worker_color", "Николай Л.", "#52c41a", 1),
            ("worker_color", "Дмитрий С.", "#fa8c16", 2),
            ("worker_color", "Максим Г.", "#722ed1", 3),
            ("layout", "Макет клиента", "#1677ff", 0),
            ("layout", "Разработка макета", "#fa8c16", 1),
            ("layout", "Правка макета", "#52c41a", 2),
            ("source", "Сайт", "#1677ff", 0),
            ("source", "Телефон", "#fa8c16", 1),
            ("source", "Личный визит", "#52c41a", 2),
            ("source", "Рекомендация", "#722ed1", 3),
            ("source", "Telegram", "#13c2c2", 4),
        ]
        for stype, name, color, order in defaults:
            core_db.add(OrderSettings(setting_type=stype, name=name, color=color, sort_order=order))
        core_db.commit()
    finally:
        core_db.close()


def _user_to_out(user: User) -> UserOut:
    perm_names = set()
    for role in (user.roles or []):
        for perm in (role.permissions or []):
            perm_names.add(perm.name)
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        role_ids=[r.id for r in user.roles] if user.roles else [],
        permissions=sorted(perm_names),
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db_core)):
    user = db.execute(
        select(User).options(joinedload(User.roles).joinedload(Role.permissions))
        .where(User.username == data.username)
    ).unique().scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=_user_to_out(user))


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db_core)):
    existing = db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
    )
    if data.role_ids:
        roles = db.execute(select(Role).where(Role.id.in_(data.role_ids))).scalars().all()
        user.roles = list(roles)

    db.add(user)
    db.commit()
    db.refresh(user)
    user = db.execute(
        select(User).options(joinedload(User.roles)).where(User.id == user.id)
    ).unique().scalar_one()
    return _user_to_out(user)


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return _user_to_out(user)


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(db: Session = Depends(get_db_core), _: User = Depends(require_permission("roles.manage"))):
    return db.execute(select(Permission).order_by(Permission.name)).scalars().all()


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db_core), _: User = Depends(require_permission("roles.manage"))):
    roles = db.execute(
        select(Role).options(joinedload(Role.permissions)).order_by(Role.id)
    ).scalars().unique().all()
    return [
        RoleOut(id=r.id, name=r.name, description=r.description, permission_ids=[p.id for p in r.permissions])
        for r in roles
    ]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(data: RoleCreate, db: Session = Depends(get_db_core), _: User = Depends(require_permission("roles.manage"))):
    existing = db.execute(select(Role).where(Role.name == data.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Role already exists")

    role = Role(name=data.name, description=data.description)
    if data.permission_ids:
        perms = db.execute(select(Permission).where(Permission.id.in_(data.permission_ids))).scalars().all()
        role.permissions = list(perms)

    db.add(role)
    db.commit()
    db.refresh(role)
    return RoleOut(id=role.id, name=role.name, description=role.description, permission_ids=data.permission_ids)


@router.put("/roles/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    data: RoleCreate,
    db: Session = Depends(get_db_core),
    _: User = Depends(require_permission("roles.manage")),
):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    role.name = data.name
    role.description = data.description
    if data.permission_ids is not None:
        perms = db.execute(select(Permission).where(Permission.id.in_(data.permission_ids))).scalars().all()
        role.permissions = list(perms)

    db.commit()
    db.refresh(role)
    return RoleOut(id=role.id, name=role.name, description=role.description, permission_ids=data.permission_ids)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, db: Session = Depends(get_db_core), _: User = Depends(require_permission("roles.manage"))):
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    db.delete(role)
    db.commit()


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db_core), _: User = Depends(require_permission("users.view"))):
    users = db.execute(
        select(User).options(joinedload(User.roles)).order_by(User.id)
    ).scalars().unique().all()
    return [_user_to_out(u) for u in users]


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db_core), _: User = Depends(require_permission("users.view"))):
    user = db.execute(
        select(User).options(joinedload(User.roles)).where(User.id == user_id)
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_out(user)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db_core),
    _: User = Depends(require_permission("users.manage")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for key, val in data.model_dump(exclude_unset=True).items():
        if key == "role_ids" and val is not None:
            roles = db.execute(select(Role).where(Role.id.in_(val))).scalars().all()
            user.roles = list(roles)
        else:
            setattr(user, key, val)

    db.commit()
    db.refresh(user)
    user = db.execute(
        select(User).options(joinedload(User.roles)).where(User.id == user.id)
    ).unique().scalar_one()
    return _user_to_out(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db_core), _: User = Depends(require_permission("users.manage"))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
