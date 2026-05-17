## Backend Env

Copy `backend/.env.example` to `backend/.env` and fill in the required values.

New artist-page enrichment uses Last.fm for:
- artist bio/about text
- artist tags
- similar artists

Playlist-link ingestion uses:
- `YOUTUBE_API_KEY` for YouTube and YouTube Music playlist imports

Required env for that feature:

```env
LASTFM_API_KEY=your_lastfm_api_key
YOUTUBE_API_KEY=your_youtube_data_api_key
```
