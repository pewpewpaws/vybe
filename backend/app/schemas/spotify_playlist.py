from pydantic import BaseModel

class SpotifyPlaylistInfo(BaseModel):
    id: str
    name: str
    image_url: str | None

class SpotifyPlaylistsResponse(BaseModel):
    items: list[SpotifyPlaylistInfo]
