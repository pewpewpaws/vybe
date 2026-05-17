# 🎵 CampusBeats (Vyne)

> **Music-based identity discovery for college communities.**

CampusBeats — internally codenamed **Vyne** — is a social discovery platform where your music taste is your identity. It finds people on your campus whose vibe matches yours, using real audio data from Spotify rather than self-reported interests or swipe mechanics.

---

## ✨ What It Does

- **Discover** people who share your music DNA through a visual bubble-field UI
- **Match** algorithmically via cosine similarity on Spotify audio features (energy, valence, tempo, danceability, etc.)
- **Connect** with matched users through song exchanges — no chat, intentionally
- **Verify** your campus identity via ETLab, keeping the network exclusive to students

---

## 🗺️ User Flow

```
ETLab Campus Login → Music Setup → Vibe Generation → Discovery → Match Request → Song Exchange
```

1. **Authenticate** via ETLab (campus identity gate)
2. **Build your taste** — connect Spotify, paste a playlist link, or add songs manually
3. **Get your Vybe** — your music is resolved to Spotify, audio features are extracted, and a taste vector is generated
4. **Discover matches** — browse a bubble field of campus users ranked by similarity
5. **Connect** — send a match request; once both accept, full profiles and song sharing unlock

---

## 🏗️ Architecture

```
┌─────────────────────────────┐
│   React + Vite + TypeScript │  ← Frontend (Framer Motion · Zustand · TanStack Query)
└──────────────┬──────────────┘
               │ REST API
┌──────────────▼──────────────┐
│      FastAPI (Python)       │  ← Backend (Auth · Matching · Ingestion · Recommendations)
└──────┬──────────────┬───────┘
       │              │
┌──────▼──────┐  ┌────▼────────┐
│  Supabase   │  │ Spotify API │  ← Database (PostgreSQL) + Music source of truth
│ (PostgreSQL)│  │             │
└─────────────┘  └─────────────┘
       ↑
  ETLab Proxy  ← Campus identity verification
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS |
| **Animations** | Framer Motion |
| **State** | Zustand, TanStack Query v5 |
| **Backend** | FastAPI, Python, Pydantic v2, Uvicorn |
| **Database** | Supabase (PostgreSQL) with Row-Level Security |
| **Auth** | ETLab proxy (primary) + Supabase sessions |
| **Music** | Spotify API (search, audio features, OAuth) |
| **Supplemental** | Last.fm API, YouTube Data API |
| **Matching** | NumPy, pandas, scikit-learn (cosine similarity) |
| **Processing** | MusicSynthesizer — standalone Python pipeline |

---

## 📁 Project Structure

```
CampusBeats/
├── frontend/               # Vite + React application
│   └── src/
│       ├── pages/          # Route-level screens
│       ├── components/     # Reusable UI components
│       ├── features/       # Product modules (onboarding, discovery, matches)
│       ├── store/          # Zustand stores
│       ├── services/       # API clients
│       ├── hooks/          # Custom React hooks
│       └── lib/            # Utilities & types
│
├── backend/                # FastAPI application
│   └── app/
│       ├── api/            # Route definitions
│       ├── auth/           # Authorization helpers
│       ├── core/           # Settings & config
│       ├── db/             # Database repositories
│       ├── schemas/        # Pydantic schemas
│       ├── services/       # Business logic
│       └── internal/       # Admin-only experimental routes
│
└── MusicSynthesizer/       # Standalone audio feature extraction pipeline
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18 + **pnpm**
- **Python** ≥ 3.11
- A [Supabase](https://supabase.com) project
- A [Spotify Developer](https://developer.spotify.com) app
- ETLab credentials (campus-specific)

### 1. Clone & configure environment

```bash
git clone https://github.com/your-username/CampusBeats.git
cd CampusBeats
cp .env.example .env
# Fill in .env with your keys (see Environment Variables below)
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
make run                          # or: uvicorn app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.  
Interactive docs: `http://127.0.0.1:8000/docs`

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

The app will be available at `http://127.0.0.1:5173`.

### 4. Database schema

```bash
psql -U postgres -d your_db_url -f backend/sql/schema.sql
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only) |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | OAuth callback (default: `http://127.0.0.1:8000/api/v1/spotify/callback`) |
| `LASTFM_API_KEY` | Last.fm API key (fallback search) |
| `YOUTUBE_API_KEY` | YouTube Data API key (playlist resolution) |
| `ETLAB_REDIRECT_URI` | ETLab OAuth callback |
| `ETLAB_MOCK_MODE` | Set `true` to bypass ETLab in local dev |
| `FRONTEND_ORIGIN` | CORS origin for the frontend |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |

---

## 🎛️ MusicSynthesizer

The `MusicSynthesizer/` directory contains a standalone Python pipeline that:

1. Fetches Spotify audio features in bulk for all songs in the database
2. Extracts and normalises audio features (energy, valence, tempo, etc.)
3. Uploads processed feature vectors to Supabase

```bash
cd MusicSynthesizer
pip install -r requirements.txt
python app.py          # CLI mode
# or
python gui.py          # Desktop GUI mode (requires requirements-gui.txt)
```

---

## 🤝 Matching Algorithm

```
Songs → Spotify Standardisation
      → Feature Extraction (artist freq · genre dist · avg energy / tempo / valence / danceability)
      → User Vector (L2-normalised)
      → Cosine Similarity against all campus users
      → Ranked Match Candidates
```

A minimum of **15 analysed songs** unlocks the full Vybe Profile. Rough matches are available from 5 songs.

---

## 🔒 Privacy Model

- Unmatched users see only: match %, shared artists, vibe similarity
- Full profile, song library, and real-time listening unlock **only after mutual acceptance**
- No open profile search — discovery is algorithmic only
- Campus identity verified by ETLab; no public sign-up

---

## 📄 License

This project is private and intended for campus use. All rights reserved.
