from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://crm_user:crm_pass@localhost:5432/printing_crm"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    llama_cpp_url: str = "http://localhost:8080"
    llama_model_name: str = "local-model"
    pg_bin_path: str = "/usr/local/bin"

    class Config:
        env_file = ".env"


settings = Settings()
