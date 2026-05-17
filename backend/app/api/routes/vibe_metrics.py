"""
vibe_metrics.py — Aggregated audio-feature endpoint for the profile page vibe bubbles.

Joins user_taste_songs → songs → song_audio_features and computes per-user
averages for the six most perceptually meaningful features.  Songs without
extracted features are silently skipped so the endpoint always returns gracefully.
"""

from __future__ import annotations

import statistics
from typing import Any

from fastapi import APIRouter, Depends

from backend.app.auth.dependencies import AuthenticatedUser, get_current_user
from backend.app.db.supabase import get_supabase_client

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _safe_mean(values: list[float]) -> float | None:
    """Return the arithmetic mean of *values*, or None if the list is empty."""
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return statistics.mean(clean)


# ── route ─────────────────────────────────────────────────────────────────────

@router.get("/vibe-metrics")
def get_vibe_metrics(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Return aggregated audio-feature averages for the authenticated user's
    taste profile.

    Response shape
    --------------
    {
      "song_count_with_features": int,
      "features": {
        "energy":            float | null,  # 0–1 (Essentia RMS energy, normalised)
        "danceability":      float | null,  # 0–3 (Essentia danceability)
        "tempo_bpm":         float | null,  # beats per minute
        "loudness":          float | null,  # dB (negative)
        "spectral_centroid": float | null,  # Hz — perceived brightness
        "spectral_contrast": float | null,  # dB — harmonic contrast (uniqueness proxy)
      }
    }
    """
    client = get_supabase_client()
    user_id: str = current_user.profile["id"]

    # 1. Fetch the user's taste song IDs
    taste_rows = (
        client.table("user_taste_songs")
        .select("song_id")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    song_ids = [row["song_id"] for row in taste_rows]

    if not song_ids:
        return {
            "song_count_with_features": 0,
            "features": {
                "energy": None,
                "danceability": None,
                "tempo_bpm": None,
                "loudness": None,
                "spectral_centroid": None,
                "spectral_contrast": None,
            },
        }

    # 2. Pull audio features for those songs.
    #    We select only the columns we need; missing rows are silently absent.
    feature_rows = (
        client.table("song_audio_features")
        .select(
            "song_id,"
            "energy_mean,"
            "danceability_mean,"
            "tempo_bpm_mean,"
            "loudness_mean,"
            "spectral_centroid_mean,"
            "spectral_contrast_mean"
        )
        .in_("song_id", song_ids)
        # Pick the most-recent feature set per song if multiple exist
        .order("computed_at", desc=True)
        .execute()
        .data
        or []
    )

    # Deduplicate: keep only the first (most-recent) row per song
    seen: set[str] = set()
    unique_rows: list[dict[str, Any]] = []
    for row in feature_rows:
        sid = row["song_id"]
        if sid not in seen:
            seen.add(sid)
            unique_rows.append(row)

    if not unique_rows:
        return {
            "song_count_with_features": 0,
            "features": {
                "energy": None,
                "danceability": None,
                "tempo_bpm": None,
                "loudness": None,
                "spectral_centroid": None,
                "spectral_contrast": None,
            },
        }

    def collect(key: str) -> list[float]:
        return [row[key] for row in unique_rows if row.get(key) is not None]

    return {
        "song_count_with_features": len(unique_rows),
        "features": {
            "energy":            _safe_mean(collect("energy_mean")),
            "danceability":      _safe_mean(collect("danceability_mean")),
            "tempo_bpm":         _safe_mean(collect("tempo_bpm_mean")),
            "loudness":          _safe_mean(collect("loudness_mean")),
            "spectral_centroid": _safe_mean(collect("spectral_centroid_mean")),
            "spectral_contrast": _safe_mean(collect("spectral_contrast_mean")),
        },
    }
