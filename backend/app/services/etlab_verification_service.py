import re

from fastapi import HTTPException, status

from backend.app.services.etlab_service import ETLabService
from backend.app.services.profile_service import ProfileService


class ETLabVerificationService:
    def __init__(self) -> None:
        self.etlab_service = ETLabService()
        self.profile_service = ProfileService()

    def verify_profile(self, profile: dict, username: str, password: str) -> dict:
        identity = self.etlab_service.authenticate_with_credentials(username=username, password=password)

        return self.profile_service.mark_etlab_verified(
            profile["id"],
            etlab_id=identity.etlab_id,
            name=identity.name.strip(),
            academic_year=identity.academic_year,
        )

    @staticmethod
    def _normalize_value(value: str) -> str:
        return "".join(char.lower() for char in value if char.isalnum())
