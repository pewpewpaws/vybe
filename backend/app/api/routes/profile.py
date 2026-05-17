from fastapi import APIRouter, Depends

from backend.app.auth.dependencies import AuthenticatedUser, get_current_user
from backend.app.schemas.profile import ProfileResponse, ProfileUpdateRequest
from backend.app.services.profile_service import ProfileService

router = APIRouter()
profile_service = ProfileService()


@router.get("/me", response_model=ProfileResponse)
def get_my_profile(current_user: AuthenticatedUser = Depends(get_current_user)) -> ProfileResponse:
    return ProfileResponse(**current_user.profile)


@router.patch("/me", response_model=ProfileResponse)
def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ProfileResponse:
    updated = profile_service.update_profile(
        current_user.profile["id"],
        payload.model_dump(exclude_none=True, by_alias=False),
    )
    return ProfileResponse(**updated)
