from fastapi import APIRouter, Depends, status

from backend.app.auth.dependencies import AuthenticatedUser, get_admin_user
from backend.app.schemas.internal import ExperimentalConnectionCreateRequest, ExperimentalConnectionResponse
from backend.app.services.internal_experiments_service import InternalExperimentsService

router = APIRouter()
service = InternalExperimentsService()


@router.get("/connections", response_model=list[ExperimentalConnectionResponse])
def list_experimental_connections(_: AuthenticatedUser = Depends(get_admin_user)) -> list[ExperimentalConnectionResponse]:
    return [ExperimentalConnectionResponse(**item) for item in service.list_connections()]


@router.post("/connections", response_model=ExperimentalConnectionResponse, status_code=status.HTTP_201_CREATED)
def create_experimental_connection(
    payload: ExperimentalConnectionCreateRequest,
    current_user: AuthenticatedUser = Depends(get_admin_user),
) -> ExperimentalConnectionResponse:
    created = service.create_connection(
        owner_user_id=current_user.profile["id"],
        payload=payload.model_dump(by_alias=False),
    )
    return ExperimentalConnectionResponse(**created)
