from pydantic import BaseModel, ConfigDict


class RoleBase(BaseModel):
    name: str
    description: str | None = None


class RoleCreate(RoleBase):
    permission_ids: list[int] = []


class RoleOut(RoleBase):
    id: int
    permission_ids: list[int] = []

    model_config = ConfigDict(from_attributes=True)


class PermissionBase(BaseModel):
    name: str
    description: str | None = None


class PermissionCreate(PermissionBase):
    pass


class PermissionOut(PermissionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserBase(BaseModel):
    username: str
    email: str
    full_name: str | None = None


class UserCreate(UserBase):
    password: str
    role_ids: list[int] = []


class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    is_active: bool | None = None
    role_ids: list[int] | None = None


class UserOut(UserBase):
    id: int
    is_active: bool
    is_superuser: bool
    role_ids: list[int] = []
    permissions: list[str] = []
    created_at: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
