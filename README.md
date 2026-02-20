# vibeQ

vibeQ is a **Democratic Jukebox** — guests search and request songs, the host approves and manages the queue, and music plays live through Spotify. Built for house parties, kickbacks, and any gathering where everyone should have a say in the music.

## Features

- **Guest Song Requests** — Guests visit the search page, find tracks on Spotify, and submit requests to the queue.
- **Host Dashboard** — The host approves/rejects requests, reorders the queue via drag-and-drop, and controls playback (play, pause, skip).
- **Live Spotify Playback** — Music plays directly in the browser through the Spotify Web Playback SDK. Tracks auto-advance when a song ends.
- **Suggested Tracks** — When requests slow down, the admin panel shows AI-powered suggestions based on artists already in the queue. One click adds them.
- **Content Filters** — Toggle "Block Explicit" to grey out explicit tracks for guests. Optional Musixmatch-powered PG Mode filters songs by lyric content.
- **Queue Management** — Drag-and-drop reordering, shuffle, clear queue, and remove individual tracks.

---

## Prerequisites

- **Docker & Docker Compose** — [Install Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **Spotify Premium Account** — Required for the Web Playback SDK (free accounts cannot use the player)
- **Spotify Developer App** — See [Spotify Setup](#spotify-setup) below

---

## Quick Start (Docker)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/alexlhtam/vibeq.git
   cd vibeq
   ```

2. **Create your environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Fill in your Spotify credentials** (see [Spotify Setup](#spotify-setup)):
   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   SPOTIFY_REDIRECT_URI=http://localhost:8000/callback
   ```

4. **Launch the containers:**
   ```bash
   docker-compose up --build
   ```

5. **Connect your Spotify account:**
   - Open [http://localhost:3000/admin](http://localhost:3000/admin)
   - Click **"Connect Spotify"** and authorize
   - You'll be redirected back to the dashboard

6. **Start using vibeQ:**
   - **Guest Search:** [http://localhost:3000](http://localhost:3000)
   - **Host Dashboard:** [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Spotify Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in:
   - **App name:** `vibeQ` (or anything you like)
   - **Redirect URI:** `http://localhost:8000/callback`
   - **APIs used:** Check **Web API** and **Web Playback SDK**
4. Save the app, then copy your **Client ID** and **Client Secret** into your `.env` file

> **Note:** Spotify apps in development mode are limited to 25 users. Add your Spotify account's email under **Settings → User Management** in the developer dashboard if you encounter authorization issues.

---

## Manual Setup (Local Development)

If you prefer running without Docker:

### 1. PostgreSQL
Make sure PostgreSQL is running locally and create a database:
```bash
createdb vibeq_db
```

### 2. Backend (FastAPI + Python)
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

The backend expects `DB_HOST=localhost` when running outside Docker. You can set this in `backend/.env` or export it in your shell.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From your Spotify Developer App |
| `SPOTIFY_CLIENT_SECRET` | Yes | From your Spotify Developer App |
| `SPOTIFY_REDIRECT_URI` | Yes | Must match what you set in the Spotify dashboard (`http://localhost:8000/callback`) |
| `DB_USER` | No | PostgreSQL username (default: `postgres`) |
| `DB_PASSWORD` | No | PostgreSQL password (default: `mysecretpassword`) |
| `DB_NAME` | No | PostgreSQL database name (default: `vibeq_db`) |
| `MUSIXMATCH_API_KEY` | No | Enables PG Mode lyric filtering (free tier: 2,000 calls/day) |

---

## Content Filters

### Block Explicit
Toggle in the admin sidebar. When enabled:
- Explicit tracks appear greyed out on the guest search page with an "Explicit content blocked by host" message
- Guests cannot add explicit tracks to the queue
- Explicit tracks are excluded from suggestions

### PG Mode (Optional)
Requires a [Musixmatch API key](https://developer.musixmatch.com/). When enabled, songs are checked against a profanity word list via their lyrics. Non-PG tracks are filtered from search results.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, Material UI Icons |
| **Backend** | FastAPI (Python), SQLAlchemy |
| **Database** | PostgreSQL 15 |
| **Playback** | Spotify Web Playback SDK |
| **Queue UX** | @dnd-kit (drag-and-drop reordering) |
| **Lyrics Filter** | Musixmatch API (optional) |

---

## Project Structure

```text
vibeq/
├── docker-compose.yml        # Docker orchestration (3 services)
├── .env.example              # Template for environment variables
├── backend/
│   ├── Dockerfile            # Python container setup
│   ├── main.py               # FastAPI endpoints
│   ├── services.py           # Spotify + Musixmatch API clients
│   ├── models.py             # SQLAlchemy models (User, SongRequest, Settings)
│   ├── database.py           # PostgreSQL connection setup
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── Dockerfile            # Node.js container setup
│   ├── app/
│   │   ├── layout.tsx        # Root layout (Inter font, global styles)
│   │   ├── page.tsx          # Guest search page
│   │   └── admin/page.tsx    # Host dashboard (queue, playback, settings)
│   ├── globals.css           # Tailwind + custom styles
│   └── package.json          # Node dependencies
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/login/spotify` | Returns Spotify OAuth URL |
| `GET` | `/callback` | Handles Spotify OAuth callback |
| `GET` | `/spotify/token` | Returns current access token (auto-refreshes) |
| `GET` | `/search?query=...` | Search Spotify tracks |
| `POST` | `/request` | Guest submits a song request |
| `GET` | `/queue` | Get current queue |
| `POST` | `/request/{id}/approve` | Approve a pending request |
| `POST` | `/request/{id}/played` | Mark a track as completed |
| `POST` | `/request/{id}/remove` | Remove a track from the queue |
| `POST` | `/queue/shuffle` | Shuffle approved track order |
| `POST` | `/queue/reorder` | Reorder queue (drag-and-drop) |
| `POST` | `/queue/clear` | Clear entire queue |
| `GET` | `/suggestions` | Get suggested tracks based on queue artists |
| `POST` | `/suggestions/add` | Add a suggestion directly to the queue |
| `GET` | `/settings` | Get admin settings (filters) |
| `POST` | `/settings` | Update admin settings |
| `POST` | `/lyrics/check` | Check a track's lyrics for PG content |

---

## Important Notes

- **Spotify Premium Required** — The Web Playback SDK only works with Spotify Premium accounts. Free accounts will fail to initialize the player.
- **Browser Autoplay** — Browsers block audio until the user interacts with the page. On the host dashboard, click **"Start the Vibe"** to initialize the player.
- **Dev Mode Limits** — Spotify apps in development mode have a 25-user limit. For personal use this is fine. For larger events, you'd need to submit for Spotify's app review.
- **Same Network** — Guests and the host must be on the same network (or the host machine must be accessible) for guests to reach `localhost:3000`.