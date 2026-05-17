from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from backend.app.auth.dependencies import AuthenticatedUser, get_current_user
from backend.app.core.settings import get_settings
from backend.app.schemas.spotify import SpotifyConnectResponse, SpotifyConnectStartResponse
from backend.app.services.onboarding_service import OnboardingService
from backend.app.services.spotify_service import SpotifyService

router = APIRouter()
spotify_service = SpotifyService()
onboarding_service = OnboardingService()


@router.get("/connect", response_model=SpotifyConnectStartResponse)
def start_spotify_connect(
    response: Response,
    _: AuthenticatedUser = Depends(get_current_user),
) -> SpotifyConnectStartResponse:
    return spotify_service.start_connect_flow(response)

@router.get("/playlists")
def get_spotify_playlists(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    items = spotify_service.get_user_playlists(current_user.profile["id"], limit=limit)
    return {"items": [{"id": p["id"], "name": p["name"], "image_url": p["images"][0]["url"] if p.get("images") else None} for p in items if p]}

@router.get("/search")
def search_spotify_tracks(
    q: str,
    search_type: str = "all",
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    items = spotify_service.search_tracks(current_user.profile["id"], q, search_type=search_type)
    return {"items": items}

@router.get("/artists/{artist_id}")
def get_spotify_artist(
    artist_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return spotify_service.get_artist_details(current_user.profile["id"], artist_id)

@router.get("/artists/{artist_id}/similar")
def get_spotify_artist_similar(
    artist_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return spotify_service.get_artist_similar(current_user.profile["id"], artist_id)

@router.get("/albums/{album_id}")
def get_spotify_album(
    album_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return spotify_service.get_album_details(current_user.profile["id"], album_id)

@router.post("/playlists/{playlist_id}/import")
def import_spotify_playlist(
    playlist_id: str,
    payload: dict | None = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    tracks = spotify_service.get_playlist_tracks(current_user.profile["id"], playlist_id)
    imported = onboarding_service.import_songs_to_user_taste_profile(
        current_user.profile["id"],
        tracks,
        source="spotify",
    )
    return {"imported": imported}
    
@router.post("/top-tracks/import")
def import_spotify_top_tracks(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    tracks = spotify_service.get_user_top_tracks(current_user.profile["id"])
    imported = onboarding_service.import_songs_to_user_taste_profile(
        current_user.profile["id"],
        tracks,
        source="spotify",
    )
    return {"imported": imported}

@router.post("/liked-songs/import")
def import_spotify_liked_songs(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    tracks = spotify_service.get_user_liked_songs(current_user.profile["id"])
    imported = onboarding_service.import_songs_to_user_taste_profile(
        current_user.profile["id"],
        tracks,
        source="spotify",
    )
    return {"imported": imported}

@router.get("/callback")
def spotify_callback(
    request: Request,
    response: Response,
    state: str,
    code: str | None = None,
    error: str | None = None,
):
    settings = get_settings()

    if error or not code:
        return RedirectResponse(url=f"{settings.frontend_origin}/onboarding?spotify_error={quote(error or 'missing_code')}")

    try:
        current_user = get_current_user(request)
    except HTTPException:
        return RedirectResponse(url=f"{settings.frontend_origin}/onboarding?spotify_error=session_expired")

    try:
        spotify_service.handle_callback(
            user_id=current_user.profile["id"],
            code=code,
            state=state,
            request=request,
            response=response,
        )
    except HTTPException as exc:
        return RedirectResponse(
            url=f"{settings.frontend_origin}/onboarding?spotify_error={quote(str(exc.detail or 'spotify_callback_failed'))}"
        )

    settings = get_settings()
    return RedirectResponse(url=f"{settings.frontend_origin}/onboarding?spotify_connected=true")
