# vibeQ (MVP)

vibeQ is a "Democratic Jukebox" application. It allows guests to search for music and request songs, while the Host (Admin) manages an active queue and controls live playback via a custom dashboard.

## Quick Start (Docker)
The easiest way to run the app on any machine (Mac, Windows, or Linux) is using Docker.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/alexlhtam/vibeq.git
   cd vibeq
   ```

2. **Setup Environment Variables:**
   - Copy the `.env.example` file and rename it to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and fill in the `SOUNDCLOUD_CLIENT_ID` (See the tutorial below).

3. **Launch the Container:**
   ```bash
   docker-compose up --build
   ```

4. **Open the App:**
   - **Guest Search:** [http://localhost:3000](http://localhost:3000)
   - **Host Dashboard:** [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Manual Setup (Local Development)

### 1. Backend (FastAPI + Python)
- Navigate to the folder: `cd backend`
- Create a virtual environment: `python -m venv venv`
- Activate it:
  - **Mac/Linux:** `source venv/bin/activate`
  - **Windows:** `venv\Scripts\activate`
- Install dependencies: `pip install -r requirements.txt`
- Run the server: `uvicorn main:app --reload --port 8000`

### 2. Frontend (Next.js + Tailwind)
- Navigate to the folder: `cd frontend`
- Install dependencies: `npm install`
- Run the app: `npm run dev`

---

## How to get a SoundCloud Client ID
SoundCloud's developer portal is currently restricted. To make the app work, you must "borrow" a client ID from the live SoundCloud website:

1. Go to [SoundCloud.com](https://soundcloud.com).
2. Right-click anywhere and select **Inspect**.
3. Go to the **Network** tab.
4. Type `search` into the filter box.
5. Perform any search on the SoundCloud website.
6. Look for a network request starting with `search?q=...`.
7. Click it and find the **Request URL**.
8. Copy the string of characters immediately following `client_id=`.
9. Paste that string into your `.env` file for both variables:
   - `SOUNDCLOUD_CLIENT_ID`
   - `NEXT_PUBLIC_SOUNDCLOUD_CLIENT_ID`

---

## Tech Stack
- **Frontend:** Next.js 14, Tailwind CSS v4, Material UI Icons.
- **Backend:** FastAPI (Python), SQLAlchemy.
- **Database:** PostgreSQL.
- **Playback Engine:** SoundCloud Widget SDK.

---

## Important Limitations
- **Previews:** Due to SoundCloud's free-tier API restrictions, major label songs (e.g., Linkin Park, Avril Lavigne) will only play as **30-second previews** and then fade out. Independent tracks and remixes typically play in full.
- **Browser Autoplay:** Browsers block audio until a user interacts with the page. On the Host Dashboard, you **must** click the "Start the Vibe" button to allow music to play.

---

## Project Structure
```text
vibeq/
├── docker-compose.yml     # Docker Orchestrator
├── backend/
│   ├── Dockerfile         # Python Container Setup
│   ├── main.py            # API Endpoints
│   ├── services.py        # SoundCloud Logic (Adapter)
│   ├── models.py          # Database Schema
│   └── .env               # Private Backend Secrets
├── frontend/
│   ├── Dockerfile         # Node.js Container Setup
│   ├── app/
│   │   ├── page.tsx       # Guest View
│   │   └── admin/page.tsx # Host Dashboard
│   └── .env               # Public Frontend Secrets
└── .env                   # Root Environment Variables
```