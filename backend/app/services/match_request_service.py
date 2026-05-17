from datetime import datetime, timezone

from fastapi import HTTPException, status

from backend.app.db.repositories.accepted_matches import AcceptedMatchesRepository
from backend.app.db.repositories.match_candidates import MatchCandidatesRepository
from backend.app.db.repositories.match_requests import MatchRequestsRepository
from backend.app.db.repositories.profiles import ProfilesRepository
from backend.app.db.supabase import get_supabase_client
from backend.app.schemas.matches import MatchRequestResponse
from backend.app.schemas.profile import ProfilePreview


class MatchRequestService:
    def __init__(self) -> None:
        client = get_supabase_client()
        self.request_repository = MatchRequestsRepository(client)
        self.candidate_repository = MatchCandidatesRepository(client)
        self.accepted_matches_repository = AcceptedMatchesRepository(client)
        self.profile_repository = ProfilesRepository(client)

    def create_match_request(self, requester_id: str, candidate_user_id: str) -> dict:
        if requester_id == candidate_user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot request yourself.")

        candidate = self.candidate_repository.get_candidate(requester_id, candidate_user_id)
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This user is not currently available as a discovery candidate.",
            )

        if self.accepted_matches_repository.get_between_users(requester_id, candidate_user_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already accepted matches with this user.",
            )

        pending_outgoing = self.request_repository.find_pending_between(requester_id, candidate_user_id)
        if pending_outgoing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pending match request already exists.",
            )

        pending_incoming = self.request_repository.find_pending_between(candidate_user_id, requester_id)
        if pending_incoming:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user has already requested you. Accept or decline that request instead.",
            )

        return self.request_repository.create(
            {
                "requester_id": requester_id,
                "recipient_id": candidate_user_id,
                "match_candidate_id": candidate["id"],
            }
        )

    def list_incoming_requests(self, user_id: str) -> list[MatchRequestResponse]:
        requests = self.request_repository.list_incoming(user_id)
        return self._build_request_responses(requests)

    def list_outgoing_requests(self, user_id: str) -> list[MatchRequestResponse]:
        requests = self.request_repository.list_outgoing(user_id)
        return self._build_request_responses(requests)

    def accept_request(self, user_id: str, request_id: str) -> dict:
        request = self.request_repository.get_by_id(request_id)
        if not request or request["recipient_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match request not found.")
        if request["status"] != "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This request is no longer pending.")

        responded_at = datetime.now(timezone.utc).isoformat()
        updated = self.request_repository.update_status(request_id, "accepted", responded_at)
        accepted_match = self.accepted_matches_repository.get_between_users(
            updated["requester_id"], updated["recipient_id"]
        )
        if not accepted_match:
            try:
                accepted_match = self.accepted_matches_repository.create(
                    {
                        "request_id": updated["id"],
                        "user_a_id": updated["requester_id"],
                        "user_b_id": updated["recipient_id"],
                    }
                )
            except Exception as exc:
                # Concurrent accept — another request already created the match row.
                # Retrieve the existing row and continue rather than surfacing a 500.
                if "uq_accepted_matches_pair" in str(exc) or "unique" in str(exc).lower():
                    accepted_match = self.accepted_matches_repository.get_between_users(
                        updated["requester_id"], updated["recipient_id"]
                    )
                    if not accepted_match:
                        raise
                else:
                    raise
        return {"id": updated["id"], "status": updated["status"], "accepted_match_id": accepted_match["id"]}


    def decline_request(self, user_id: str, request_id: str) -> dict:
        request = self.request_repository.get_by_id(request_id)
        if not request or request["recipient_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match request not found.")
        if request["status"] != "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This request is no longer pending.")

        updated = self.request_repository.update_status(request_id, "declined", datetime.now(timezone.utc).isoformat())
        return {"id": updated["id"], "status": updated["status"], "accepted_match_id": None}

    def serialize_request(self, request: dict) -> MatchRequestResponse:
        return self._build_request_responses([request])[0]

    def _build_request_responses(self, requests: list[dict]) -> list[MatchRequestResponse]:
        profile_ids = {
            request["requester_id"] for request in requests
        } | {request["recipient_id"] for request in requests}
        profiles = self.profile_repository.list_by_ids(list(profile_ids))
        profiles_by_id = {profile["id"]: profile for profile in profiles}

        responses: list[MatchRequestResponse] = []
        for request in requests:
            requester = profiles_by_id.get(request["requester_id"])
            recipient = profiles_by_id.get(request["recipient_id"])
            if not requester or not recipient:
                continue
            candidate = (
                self.candidate_repository.get_by_id(request["match_candidate_id"])
                if request.get("match_candidate_id")
                else None
            )
            responses.append(
                MatchRequestResponse(
                    id=request["id"],
                    requester=ProfilePreview(
                        id=requester["id"],
                        name=requester["name"],
                        avatar_url=requester.get("avatar_url"),
                    ),
                    recipient=ProfilePreview(
                        id=recipient["id"],
                        name=recipient["name"],
                        avatar_url=recipient.get("avatar_url"),
                    ),
                    match_score=float(candidate["match_score"]) if candidate else 0.0,
                    shared_artists=candidate.get("shared_artists") if candidate else [],
                    vibe_summary=candidate.get("vibe_summary") if candidate else "",
                    status=request["status"],
                    created_at=request["created_at"],
                    responded_at=request.get("responded_at"),
                )
            )
        return responses
