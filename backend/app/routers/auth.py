from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.session import get_db
from app.schemas.common import LoginRequest, TokenOut, UserOut
from app.services import authenticate_user, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _optional_oauth2_form(
    request: Request,
) -> OAuth2PasswordRequestForm | None:
    """Parse OAuth2 form data ONLY if the request is form-encoded; otherwise None.

    This lets /api/auth/login accept either JSON body (frontend) or
    application/x-www-form-urlencoded (Swagger UI / OAuth2 clients) without
    raising 422 for JSON-only requests.
    """
    ctype = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" not in ctype and "multipart/form-data" not in ctype:
        return None
    try:
        form = await request.form()
    except Exception:
        return None
    username = form.get("username") or ""
    password = form.get("password") or ""
    scope = form.get("scope") or ""
    return OAuth2PasswordRequestForm(
        username=username,
        password=password,
        scope=scope,
        grant_type=form.get("grant_type") or "password",
        client_id=form.get("client_id"),
        client_secret=form.get("client_secret"),
    )


@router.post("/login", response_model=TokenOut)
async def login(
    req: LoginRequest | None = None,
    form: Annotated[OAuth2PasswordRequestForm | None, Depends(_optional_oauth2_form)] = None,
    db: Session = Depends(get_db),
) -> TokenOut:
    """Accept either JSON body (preferred) or OAuth2 form data for tools like Swagger UI."""
    username = ""
    password = ""
    if req is not None:
        username = req.username
        password = req.password
    if not username and form is not None:
        username = form.username or ""
        password = form.password or ""
    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username_and_password_required",
        )
    user = authenticate_user(db, username, password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    token = create_access_token(subject=user.id)
    from app.core.config import settings
    return TokenOut(access_token=token, token_type="bearer", expires_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)


@router.get("/me", response_model=UserOut)
def me(current_user=Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)
