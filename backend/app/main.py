from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.logging import add_request_logging, configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(title="EduRAG API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
        # The browser can only read the suggested file name of a download if the header is exposed
        expose_headers=["Content-Disposition"],
    )
    add_request_logging(app)
    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
