from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def _build_engine_url(raw: str) -> str:
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw


_raw_url = settings.database_url


engine = create_engine(
    _raw_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args={"check_same_thread": False} if _raw_url.startswith("sqlite") else {},
)

Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


# aliases for backward compatibility during migration
engine_core = engine
engine_clients = engine
engine_orders = engine
engine_warehouse = engine

SessionCore = Session
SessionClients = Session
SessionOrders = Session
SessionWarehouse = Session

BaseCore = Base
BaseClients = Base
BaseOrders = Base
BaseWarehouse = Base

get_db_core = get_db
get_db_clients = get_db
get_db_orders = get_db
get_db_warehouse = get_db
