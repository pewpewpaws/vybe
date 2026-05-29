from fastapi import HTTPException, status

from backend.app.core.settings import get_settings
from backend.app.db.repositories.profiles import ProfilesRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.services.etlab_service import ETLabIdentity
from backend.app.services.google_oauth_service import GoogleIdentity


class ProfileService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = ProfilesRepository(get_supabase_client())

    def get_profile_by_id(self, profile_id: str) -> dict:
        profile = self.find_profile_by_id(profile_id)
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
        return profile

    def find_profile_by_id(self, profile_id: str) -> dict | None:
        return self.repository.get_by_id(profile_id)

    def get_profile_by_google_id(self, google_id: str) -> dict | None:
        return self.repository.get_by_google_id(google_id)

    def get_profile_by_etlab_id(self, etlab_id: str) -> dict | None:
        return self.repository.get_by_etlab_id(etlab_id)

    def get_profile_by_email(self, email: str) -> dict | None:
        return self.repository.get_by_email(email.lower())

    def create_profile(self, payload: dict) -> dict:
        return self.repository.create(payload)

    def update_profile(self, profile_id: str, payload: dict) -> dict:
        if not payload:
            return self.get_profile_by_id(profile_id)
        if "name" in payload and "display_name" not in payload:
            payload = {**payload, "display_name": payload["name"]}
        return self.repository.update(profile_id, payload)

    def mark_etlab_verified(
        self,
        profile_id: str,
        *,
        etlab_id: str,
        name: str,
        academic_year: str | None = None,
    ) -> dict:
        payload = {
            "display_name": name,
            "etlab_id": etlab_id,
            "etlab_verified": True,
        }
        if academic_year:
            payload["academic_year"] = academic_year
        return self.repository.update(profile_id, payload)

    def get_or_create_from_etlab_identity(self, identity: ETLabIdentity) -> dict:
        payload = {
            "email": identity.email,
            "display_name": identity.name,
        }
        if identity.academic_year:
            payload["academic_year"] = identity.academic_year

        existing = self.get_profile_by_etlab_id(identity.etlab_id)
        if existing:
            return self.update_profile(existing["id"], payload)

        email_match = self.get_profile_by_email(identity.email)
        if email_match:
            return self.mark_etlab_verified(
                email_match["id"],
                etlab_id=identity.etlab_id,
                name=identity.name,
                academic_year=identity.academic_year,
            )

        payload.update({
            "etlab_id": identity.etlab_id,
            "etlab_verified": True,
        })
        return self.create_profile(payload)

    def get_or_create_from_google_identity(self, identity: GoogleIdentity) -> dict:
        existing = self.get_profile_by_google_id(identity.sub)
        if not existing:
            existing = self.get_profile_by_email(identity.email)

        payload = {
            "email": identity.email,
            "display_name": identity.name,
            "google_id": identity.sub,
            "google_payload": identity.raw_payload,
        }

        if existing:
            return self.update_profile(existing["id"], payload)

        return self.create_profile(payload)
