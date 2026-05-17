from fastapi import APIRouter, Depends

from backend.app.auth.dependencies import AuthenticatedUser, get_current_user
from backend.app.schemas.auth import ETLabVerificationRequest
from backend.app.schemas.profile import ProfileResponse
from backend.app.services.etlab_verification_service import ETLabVerificationService

router = APIRouter()
verification_service = ETLabVerificationService()


@router.post("/etlab", response_model=ProfileResponse)
def verify_etlab(
    payload: ETLabVerificationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> ProfileResponse:
    """
    Verify ETLab profile.
    
    This endpoint requires the user to be authenticated and verifies their 
    ETLab credentials. If successful, it updates the user's profile with 
    the verified information.
    """
    verified = verification_service.verify_profile(
        current_user.profile,
        username=payload.username,
        password=payload.password,
    )
    return ProfileResponse(**verified)
