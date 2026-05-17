# 🎵 Vyne — Full Project Documentation

## 1. Overview

Vyne is a music-based identity discovery application designed for college communities.

It helps users:
- discover people with similar music taste (“vibe”)
- interact through music
- build lightweight social connections without chat

The system is discovery-first, meaning all user-to-user relationships in the main product originate from algorithmic matching based on music identity.

---

## 2. Product Vision

Vyne is built around one core feeling:

> “This person’s vibe is literally the same as mine.”

The app is not a streaming service, not a messaging app, and not a playlist manager. It is a social discovery layer built on top of music taste.

The product combines:
- identity through music
- lightweight interaction
- progressive trust
- low-friction onboarding
- Spotify-standardized music data

---

## 3. Core Concepts

### 3.1 Taste Profile

Each user has a Taste Profile built from songs that represent their music identity.

Sources:
- Spotify connection
- manual song addition
- playlist import from external platforms

All songs are standardized to Spotify track IDs before being stored internally.

### 3.2 Vibe

A user’s vibe is the numerical representation of their music identity.

It is derived from:
- artist distribution
- genre distribution
- audio features such as:
  - energy
  - tempo
  - valence
  - danceability
- optional listening behavior features

### 3.3 Match

A match is another user whose vibe is similar enough to be recommended.

Each recommended match includes:
- match percentage
- shared artists
- vibe similarity indicator

---

## 4. Product Principles

- discovery-first, not search-first
- identity through music
- low-effort interaction
- no chat system
- progressive reveal of user information
- privacy by design
- one core path: discover → request → accept → interact

---

## 5. User Flow

### 5.1 Onboarding

The onboarding goal is to give users value quickly.

Onboarding Flow:
1. **Authenticate through the ETLab proxy** (Mandatory campus verification)
2. **Music Identity Setup** (Choose one or more):
   - Connect Spotify (Recommended)
   - Add 5–10 songs manually
   - Paste a playlist link

Authentication note:
- ETLab proxy is the primary identity gate
- Vyne does not use email/password signup as the main account flow
- Supabase is used for session persistence and application profile state after ETLab verification

System behavior:
1. Songs are resolved to Spotify.
2. An initial taste profile is created.
3. A first-pass vibe vector is generated.
4. Rough matches are shown immediately.

This allows users to see value without completing a large setup.

### 5.2 Discovery

The main product experience begins on the discovery screen.

Users see:
- a visual bubble field of match candidates
- each bubble represents a person
- bubbles are positioned by similarity

Each match preview includes:
- name
- match %
- shared artists
- vibe similarity

Users can tap a bubble to view a preview card and send a match request.

### 5.3 Match Request Flow

A match is not considered active until both users accept.

Flow:
1. System suggests a match.
2. User A sends a request.
3. User B receives the request.
4. User B accepts.
5. The match becomes active.

### 5.4 Post-Match Interaction

Once both users accept:
- full profile access is unlocked
- song sending is enabled
- reactions are enabled
- optional real-time listening can be shown

The main interaction model is music exchange, not messaging.

---

## 6. Relationship Model

Vyne uses a two-level trust model.

### Level 0 — Discovery

Before acceptance, users only see a limited preview:
- match %
- shared artists
- vibe similarity
- small profile preview

Purpose:
- create curiosity
- help user decide whether to connect

### Level 1 — Accepted Match

After both users accept:
- full profile becomes visible
- vibe explanation is available
- full shared artist breakdown is available
- song sending and reactions are enabled
- optional live listening is available

Purpose:
- reward mutual intent with deeper interaction

---

## 7. Matching System

### 7.1 Input

The matching engine uses each user’s taste profile.

Input data includes:
- Spotify song IDs
- artist data
- genre data
- audio features

### 7.2 Processing Steps

#### Step 1: Song Standardization
All imported or manually added songs are matched to Spotify.

If a song cannot be resolved to Spotify, it is not added.

#### Step 2: Feature Extraction
Each user’s songs are transformed into features such as:
- artist frequency
- genre distribution
- average energy
- average tempo
- average mood
- average danceability

#### Step 3: User Vector Creation
All extracted features are combined into a normalized user vector.

#### Step 4: Similarity Scoring
Users are compared using cosine similarity.

#### Step 5: Match Ranking
Users are ranked by similarity and the best candidates are returned.

### 7.3 Rough Match

For new users, the system can generate rough matches from a smaller amount of data.

Minimum required:
- 5–10 songs

Ideal:
- 20–50 songs for stronger accuracy

---

## 8. Recommendation System

Vyne includes layered song recommendations between matched users.

### Layer 1 — Overlap-Based
Songs from a match’s taste profile that are not already in the user’s known set.

### Layer 2 — Content-Based
Songs similar in audio features to what the user already likes.

### Layer 3 — Collaborative
Songs liked by similar users or users with similar vibe patterns.

### Feedback Loop
Users react to received songs using:
- 👍
- 👎

This feedback can later refine recommendation quality.

---

## 9. Leaderboard

The leaderboard exists as a light social validation feature.

Purpose:
- improve retention
- add visibility
- create energy around matching

Examples:
- Top Vibe Matches
- Most Unique Taste
- Best Matches This Week

Rules:
- based only on accepted matches
- based only on ML-generated relationships
- excludes experimental or internal-only relationships

---

## 10. Platform Strategy

### Source of Truth

Spotify is the source of truth for all music data stored in the system.

### Supported Inputs
- Spotify OAuth
- playlist links from external services
- manual search and add

### Normalization Rule
All songs must map to Spotify track IDs internally.

If a song is not available on Spotify:
- it is skipped
- the user is notified

This gives the system:
- consistent metadata
- consistent audio features
- one unified feature space

---

## 11. Interaction Model

Allowed interaction:
- send songs
- receive songs
- react to songs

Not included in core product:
- chat
- direct messaging
- open profile search

The app is intentionally built around low-effort actions.

---

## 12. Internal Experimental Feature

An internal-only feature exists for testing alternative relationship flows.

### Purpose
To privately test non-core connection models without affecting the product.

### Access
- available only at an internal route such as `/internal/test-dc`
- visible only to the admin user
- protected by backend authorization tied to the admin account

### Rules
This experimental feature must not affect:
- matching
- user vectors
- similarity scoring
- leaderboard
- recommendations
- onboarding flow

It exists only for private experimentation and refinement.

---

## 13. High-Level Data Model

### User
- id
- name
- etlab identifier / campus identity
- register number
- profile metadata

### Taste Profile
- user_id
- song_ids
- song_weights

### Song
- spotify_track_id
- title
- artist
- metadata
- audio features

### Match
- user_a
- user_b
- similarity_score
- status (`pending`, `accepted`)

### Interaction
- sender_id
- receiver_id
- song_id
- reaction

### Internal Connection
- user_a
- user_b
- type (`direct`)
- status

---

## 14. Technical Summary

Suggested stack:
- Frontend: React / Next.js
- Backend: FastAPI / Supabase (with ETLab integration)
- Database: Supabase (PostgreSQL)
- Auth: ETLab (Primary) + Supabase (Session) + Spotify (Identity)
- ML/data processing: Python
- Music source: Spotify API

Core algorithm:
- standardized songs → feature extraction → user vectors → cosine similarity → ranked matches

---

## 15. What Vyne Is Not

Vyne is not:
- a streaming app
- a playlist manager
- a chat-first social app
- a general friend finder

It is a discovery-driven music identity product.

---

## 16. Summary

Vyne is a music-based identity discovery system that:
- helps users find people with similar vibe
- uses music as a signal for social connection
- reveals more information only after mutual acceptance
- encourages interaction through songs, not chat
- uses Spotify-standardized data for consistent matching
- keeps experimental features isolated from the main product
