import re

from fastapi import HTTPException, status

from backend.app.services.etlab_service import ETLabService
from backend.app.services.profile_service import ProfileService


class ETLabVerificationService:
    REGISTER_NUMBER_PATTERN = re.compile(r"^[A-Za-z0-9]+$")

    def __init__(self) -> None:
        self.etlab_service = ETLabService()
        self.profile_service = ProfileService()

    def verify_profile(self, profile: dict, username: str, password: str) -> dict:
        identity = self.etlab_service.authenticate_with_credentials(username=username, password=password)

        register_number = identity.register_number.strip()
        if not self.REGISTER_NUMBER_PATTERN.fullmatch(register_number):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ETLab register number is not alphanumeric.",
            )

        return self.profile_service.mark_etlab_verified(
            profile["id"],
            etlab_id=identity.etlab_id,
            register_number=register_number,
            name=identity.name.strip(),
            raw_payload=identity.raw_payload,
        )

    @staticmethod
    def _normalize_value(value: str) -> str:
        return "".join(char.lower() for char in value if char.isalnum())
