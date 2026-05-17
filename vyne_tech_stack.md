# ⚙️ Vyne — Tech Stack Documentation

## 1. Overview

Vyne is a music-based identity discovery application built as a modern web app with a rich, animated user experience and a Python-powered backend.

The stack is designed to support:
- immersive UI
- animated discovery screens
- music-based onboarding
- profile and match flows
- recommendation logic
- Spotify-standardized data
- scalable backend services

---

## 2. Frontend Stack

### Core Frontend
- **Vite**
- **React**
- **TypeScript**
- **Tailwind CSS**

### Additional Frontend Libraries
- **React Router** for routing
- **Framer Motion** for interface animations and motion systems
- **TanStack Query** for server state and API synchronization
- **Zustand** for lightweight local application state where needed

### Frontend Responsibilities
The frontend handles:
- ETLab login handoff
- session restoration after ETLab verification
- onboarding
- animated song-card carousel background
- bubble-based discovery screen
- profile preview flows
- accepted match screens
- song sending and reaction flows
- leaderboard and featured match views

### Why This Frontend Stack
This stack supports:
- high-speed development
- custom UI architecture
- animated interactions
- flexible screen composition
- modern React patterns
- strong developer experience

---

## 3. Animation and Interaction Stack

Vyne is designed as a visually alive product. Animation is a first-class part of the experience.

### Motion Tools
- **Framer Motion** for component transitions, shared layout motion, microinteractions, hover states, tap states, modal transitions, and page transitions
- **CSS keyframes** for ambient background movement such as song-card carousels
- **Transform-based positioning** for floating bubble systems
- **Optional Canvas / advanced render layer later** for richer interactive visualizations if the product expands

### Animation Use Cases
The animation system supports:
- moving song cards on the login screen
- floating bubble discovery UI
- bubble expansion on tap
- page transitions
- bottom sheet and modal transitions
- interactive profile transitions
- animated leaderboard entries
- smooth content reveal for accepted matches

### Core UI Motion Identity
The app should feel:
- fluid
- ambient
- immersive
- premium
- music-driven

---

## 4. Backend Stack

### Core Backend
- **FastAPI**
- **Python**
- **Pydantic**
- **Supabase Python Client**

### Backend Responsibilities
The backend handles:
- ETLab proxy authentication verification
- session issuance / refresh coordination with Supabase
- Spotify account linking
- taste profile ingestion
- song normalization
- match generation
- match requests and acceptance logic
- song interaction storage
- recommendation generation
- admin-only internal testing routes

### Why This Backend Stack
This stack supports:
- strong API design
- direct integration with Python-based matching logic
- easy validation with Pydantic
- automatic API documentation through FastAPI
- clean expansion into recommendation and analytics workflows

---

## 5. Database Stack

### Core Database and Backend-as-a-Service
- Supabase Cloud (PostgreSQL)

### Database Responsibilities
The database stores:
- users
- linked Spotify identities
- songs and audio metadata
- taste profiles
- generated user vectors
- match candidates
- match requests
- accepted matches
- song interactions and reactions
- internal experimental relationship records

### Why Supabase
Supabase is used because it supports:
- strong relational modeling
- reliable joins across user and match data
- structured product logic
- stable long-term growth
- expressive queries for leaderboards, interactions, and profile data

---

## 6. Music Data Layer

### Core Music Source
- **Spotify API**

### Spotify Responsibilities
Spotify acts as the source of truth for:
- authentication linkage
- track search
- playlist resolution
- song metadata
- artist metadata
- audio features
- normalized internal song identity

### Input Sources Supported by the Product
Users can provide music through:
- Spotify account connection
- playlist links
- manual song search inside the app

All valid songs are resolved into Spotify-standardized track records.

---

## 7. Matching and Recommendation Layer

### Core Libraries
- **NumPy**
- **pandas**
- **scikit-learn**

### Responsibilities
This layer handles:
- feature extraction
- user taste vector creation
- cosine similarity scoring
- candidate ranking
- overlap-based recommendation logic
- content-based recommendation logic
- collaborative recommendation experiments
- feedback-driven refinement over time

### Why This Stack
This stack gives the project:
- a direct path from data to matching logic
- mature numerical tooling
- easy experimentation
- clear ML pipeline implementation
- tight integration with the Python backend

---

## 8. Authentication Stack

### App Authentication (Primary)
- **ETLab proxy** for the primary login flow and campus identity verification.
- **Supabase** for session persistence, profile state, and downstream authorization after ETLab verification.

### Authentication Model
- Users do not create accounts with standalone email/password as the main app flow.
- The frontend starts authentication by redirecting or handing off to the ETLab proxy.
- The backend validates the ETLab-authenticated user and then establishes or refreshes the Supabase-backed app session.

### Music Metadata & Identity (Linking)
- **Spotify OAuth** linkage for taste profile ingestion and real-time activity.
- Spotify is used as a data source and social identity layer, not for primary app account creation.

### Authorization Layers
- Supabase Row Level Security (RLS)
- admin-only internal routes for private product testing (managed via Supabase roles/metadata)

---

## 9. Development Tooling

### Core Tooling
- **npm** for frontend package management
- **Python virtual environment** for backend dependencies
- **ESLint** for frontend linting
- **Prettier** for frontend formatting
- **Supabase CLI** for database migrations and local development

### Why This Tooling
This toolchain supports:
- clean code
- predictable dependency management
- migration tracking
- collaborative development
- maintainable project structure

---

## 10. Deployment Stack

### Frontend Deployment
- **Vercel** or **Netlify**

### Backend Deployment
- **Render**
- **Railway**
- **Fly.io**

### Database hosting and Auth
- Supabase Cloud

### Deployment Responsibilities
The deployment setup should support:
- separate frontend and backend hosting
- API-based communication
- environment variable management
- scalable database hosting
- continuous deployment workflows

---

## 11. API Architecture

### API Style
- REST API using FastAPI

### Main API Areas
- authentication (ETLab proxy-based)
- Spotify linking
- onboarding and taste profile creation
- match discovery
- match request actions
- full match profile retrieval
- song send and reaction flows
- leaderboard retrieval
- internal admin-only endpoints

### Why REST
REST is appropriate because the product primarily needs:
- predictable resource access
- clean CRUD flows
- match and interaction endpoints
- easy frontend integration

---

## 12. High-Level System Architecture

Vite + React + TypeScript frontend
        ↓
 ETLab proxy / FastAPI auth layer
        ↓
    Supabase session + data layer
        ↑
FastAPI backend (for matching engine and ML logic)
        ↓
   Spotify API

---

## 13. Recommended Project Structure

### Frontend
- `src/pages` for route-level screens
- `src/components` for reusable UI components
- `src/features` for product modules such as onboarding, discovery, matches, and songs
- `src/lib` for utilities
- `src/hooks` for reusable React hooks
- `src/store` for app state
- `src/services` for API clients and external integrations

### Backend
- `app/api` for custom route definitions
- `app/schemas` for Pydantic schemas
- `app/services` for business logic (where Supabase Client is used)
- `app/matching` for vector creation and similarity logic
- `app/recommendations` for recommendation flows
- `app/supabase` for Supabase client initialization
- `app/auth` for authorization checks
- `app/internal` for admin-only testing features

---

## 14. UI and Visual System Support

The selected stack fully supports the visual identity of Vyne, including:
- animated login backgrounds
- bubble-based discovery visualization
- premium profile transitions
- ambient motion layers
- bottom sheets and modals
- rich match reveal experiences
- animated leaderboard presentation

This stack is especially well suited for an interface where interaction, motion, and discovery are central to the product.

---

## 15. Final Stack Summary

### Frontend
- Vite
- React
- TypeScript
- Tailwind CSS
- React Router
- Framer Motion
- TanStack Query
- Zustand

### Backend
- FastAPI
- Python
- Pydantic
- Supabase Python Client
- ETLab proxy integration (via custom service)

### Database
- Supabase Cloud (PostgreSQL)

### Music Source
- Spotify API

### Matching / Recommendation
- NumPy
- pandas
- scikit-learn

### Tooling
- npm
- virtual environment
- ESLint
- Prettier
- Supabase CLI

### Deployment
- Vercel / Netlify (Frontend)
- Render / Railway / Fly.io (Backend matching engine)
- Supabase Cloud (Database, Storage, Session)
- ETLab proxy (Primary Credential Provider)

---

## 16. Conclusion

The Vyne tech stack is built to support a highly visual, animated, music-first social discovery experience.

It combines:
- a fast and modern React frontend
- a structured Python backend
- a reliable relational database
- Spotify-standardized music data
- a matching layer built for experimentation and growth

This stack gives the product a strong foundation for both expressive UI and intelligent matching.
