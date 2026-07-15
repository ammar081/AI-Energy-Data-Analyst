from fastapi import APIRouter

from app.api.advanced_routes import router as advanced_router
from app.api.auth_routes import router as auth_router
from app.api.routes import router as dataset_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(dataset_router)
router.include_router(advanced_router)

__all__ = ["router"]
