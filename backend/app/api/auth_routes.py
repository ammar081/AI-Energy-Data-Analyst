from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_admin
from app.config import get_settings
from app.database.db import get_db
from app.models.db import DatasetRecord, ReportRecord, UserRecord
from app.models.schemas import (
    AdminStatsResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
    UserUpdateRequest,
)
from app.services.auth_service import create_access_token, hash_password, normalize_email, verify_password

router = APIRouter()
settings = get_settings()


def _token_response(user: UserRecord) -> TokenResponse:
    token, expires_in = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user_count = db.query(UserRecord).count()
    if user_count > 0 and not settings.allow_self_registration:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self-registration is disabled")

    email = normalize_email(request.email)
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Enter a valid email address")
    if db.query(UserRecord).filter(UserRecord.email == email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account already exists for this email")

    user = UserRecord(
        id=str(uuid4()),
        email=email,
        full_name=request.full_name.strip(),
        password_hash=hash_password(request.password),
        role="admin" if user_count == 0 else "analyst",
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account already exists for this email") from exc
    return _token_response(user)


@router.post("/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(UserRecord).filter(UserRecord.email == normalize_email(request.email)).first()
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled")
    return _token_response(user)


@router.get("/auth/me", response_model=UserOut)
def current_user(user: UserRecord = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/admin/users", response_model=list[UserOut])
def list_users(_: UserRecord = Depends(require_admin), db: Session = Depends(get_db)) -> list[UserOut]:
    users = db.query(UserRecord).order_by(UserRecord.created_at.asc()).all()
    return [UserOut.model_validate(user) for user in users]


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    request: UserUpdateRequest,
    current: UserRecord = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(UserRecord, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current.id and (request.is_active is False or (request.role is not None and request.role != "admin")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove your own administrator access")
    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/admin/stats", response_model=AdminStatsResponse)
def admin_stats(_: UserRecord = Depends(require_admin), db: Session = Depends(get_db)) -> AdminStatsResponse:
    return AdminStatsResponse(
        users=db.query(UserRecord).count(),
        active_users=db.query(UserRecord).filter(UserRecord.is_active.is_(True)).count(),
        datasets=db.query(DatasetRecord).count(),
        reports=db.query(ReportRecord).count(),
        rows_processed=int(sum(record.row_count for record in db.query(DatasetRecord).all())),
    )
