import hashlib

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
        return self.repository.create(self._apply_admin_flag(payload))

    def update_profile(self, profile_id: str, payload: dict) -> dict:
        if not payload:
            return self.get_profile_by_id(profile_id)
        if "name" in payload and "display_name" not in payload:
            payload = {**payload, "display_name": payload["name"]}
        return self.repository.update(profile_id, payload)

    def mark_onboarding_completed(self, profile_id: str) -> dict:
        return self.repository.update(profile_id, {"onboarding_completed": True})

    def mark_spotify_connected(self, profile_id: str) -> dict:
        return self.get_profile_by_id(profile_id)

    def mark_etlab_verified(
        self,
        profile_id: str,
        *,
        etlab_id: str,
        register_number: str,
        name: str,
        raw_payload: dict | None = None,
    ) -> dict:
        payload = {
            "display_name": name,
            "etlab_id": etlab_id,
            "register_number": register_number,
            "etlab_payload": raw_payload or {},
            "etlab_verified_at": "now()",  # PostgreSQL will handle this or we can use datetime.now()
        }
        
        # Using a fixed timestamp string for now() or letting DB handle it via SQL is complex in repository.update
        import datetime
        payload["etlab_verified_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        return self.repository.update(profile_id, self._apply_admin_flag(payload))

    def get_or_create_from_etlab_identity(self, identity: ETLabIdentity) -> dict:
        """Note: Per user request, Google is primary. This might be used for direct ETLab login."""
        existing = self.get_profile_by_etlab_id(identity.etlab_id)
        if existing:
            return self.update_profile(existing["id"], {
                "email": identity.email,
                "display_name": identity.name,
                "etlab_payload": identity.raw_payload,
            })

        email_match = self.get_profile_by_email(identity.email)
        if email_match:
            return self.mark_etlab_verified(
                email_match["id"],
                etlab_id=identity.etlab_id,
                register_number=identity.register_number,
                name=identity.name,
                raw_payload=identity.raw_payload,
            )

        # Rare case: Create from ETLab without Google (if allowed)
        return self.create_profile({
            "email": identity.email,
            "display_name": identity.name,
            "etlab_id": identity.etlab_id,
            "register_number": identity.register_number,
            "etlab_payload": identity.raw_payload,
        })

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

    def _apply_admin_flag(self, payload: dict) -> dict:
        payload = dict(payload)
        payload["is_admin"] = (
            payload.get("email") in self.settings.admin_emails
            or payload.get("etlab_id") in self.settings.admin_etlab_ids
        )
        return payload
