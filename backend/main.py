from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from dotenv import load_dotenv
import models, database, services, os, urllib.parse, time, requests, random
from typing import List
from pydantic import BaseModel

load_dotenv()

models.Base.metadata.create_all(bind=database.engine)
app = FastAPI()

# Standardized schema for incoming requests
class ReorderSchema(BaseModel):
    ordered_ids: List[int]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/login/spotify")
def login_spotify():
    redirect_uri = os.getenv("SPOTIFY_REDIRECT_URI")
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    scope = "streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state"
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": scope,
        "show_dialog": "true"
    }
    auth_url = f"https://accounts.spotify.com/authorize?{urllib.parse.urlencode(params)}"
    return {"url": auth_url}

@app.get("/callback")
def callback(code: str, db: Session = Depends(database.get_db)):
    resp = requests.post("https://accounts.spotify.com/api/token", data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": os.getenv("SPOTIFY_REDIRECT_URI"),
        "client_id": os.getenv("SPOTIFY_CLIENT_ID"),
        "client_secret": os.getenv("SPOTIFY_CLIENT_SECRET")
    })
    tokens = resp.json()
    
    if "error" in tokens:
        raise HTTPException(status_code=400, detail=tokens.get("error_description"))

    user = db.query(models.User).filter(models.User.spotify_id == "host").first()
    if not user:
        user = models.User(spotify_id="host")
        db.add(user)
    
    user.access_token = tokens['access_token']
    user.refresh_token = tokens['refresh_token']
    user.token_expires_at = int(time.time()) + tokens['expires_in']
    db.commit()
    
    return RedirectResponse(url="http://localhost:3000/admin?status=connected")

@app.get("/spotify/token")
def get_token(db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.spotify_id == "host").first()
    if not user or not user.access_token:
        return {"token": None}
    
    # services.py handles the auto-refresh if the token is old
    token = services.get_spotify_client(db).get_token()
    return {"token": token}

@app.get("/search")
def search(query: str, db: Session = Depends(database.get_db)):
    spotify = services.get_spotify_client(db)
    results = spotify.search(query)

    # Apply filters based on admin settings
    block_explicit = services.get_setting(db, "block_explicit", "false") == "true"
    block_pg = services.get_setting(db, "block_pg", "false") == "true"

    # Mark blocked explicit tracks instead of removing them
    for t in results:
        t["blocked"] = block_explicit and t.get("explicit", False)

    if block_pg:
        mx = services.get_musixmatch_client()
        if mx.is_available():
            filtered = []
            for t in results:
                check = mx.check_lyrics(t["name"], t["artist"])
                t["pg_safe"] = check["is_pg_safe"]
                if check["is_pg_safe"]:
                    filtered.append(t)
            results = filtered

    return results

@app.post("/request")
def add_request(track: dict = Body(...), db: Session = Depends(database.get_db)):
    # Check explicit filter before allowing request
    block_explicit = services.get_setting(db, "block_explicit", "false") == "true"
    if block_explicit and track.get("explicit", False):
        raise HTTPException(status_code=400, detail="Explicit songs are currently blocked")

    new_req = models.SongRequest(
        spotify_track_id=track['id'], 
        title=track['name'], 
        artist=track['artist'], 
        album_art_url=track['album_art'], 
        duration_ms=track['duration_ms'],
        is_explicit=track.get('explicit', False)
    )
    db.add(new_req)
    db.commit()
    return {"status": "success"}

@app.get("/queue")
def get_queue(db: Session = Depends(database.get_db)):
    # Sort by position first, then ID
    queue_items = db.query(models.SongRequest)\
        .filter(models.SongRequest.status != "COMPLETED")\
        .order_by(models.SongRequest.position.asc(), models.SongRequest.id.asc())\
        .all()
    return {"queue": queue_items}

@app.post("/request/{id}/approve")
def approve(id: int, db: Session = Depends(database.get_db)):
    req = db.query(models.SongRequest).filter(models.SongRequest.id == id).first()
    if req:
        # Assign it the next available position at the end of the queue
        max_pos = db.query(func.max(models.SongRequest.position)).filter(models.SongRequest.status == "APPROVED").scalar() or 0
        req.status = "APPROVED"
        req.position = max_pos + 1
        db.commit()
    return {"status": "ok"}

@app.post("/request/{id}/played")
def played(id: int, db: Session = Depends(database.get_db)):
    req = db.query(models.SongRequest).filter(models.SongRequest.id == id).first()
    if req:
        req.status = "COMPLETED"
        db.commit()
    return {"status": "ok"}

@app.post("/request/{id}/remove")
def remove_request(id: int, db: Session = Depends(database.get_db)):
    req = db.query(models.SongRequest).filter(models.SongRequest.id == id).first()
    if req:
        db.delete(req)
        db.commit()
    return {"status": "removed"}

@app.post("/queue/shuffle")
def shuffle_queue(db: Session = Depends(database.get_db)):
    approved = db.query(models.SongRequest).filter(models.SongRequest.status == "APPROVED").all()
    if not approved: return {"status": "empty"}
    
    # Shuffle the positions
    positions = [r.position for r in approved]
    random.shuffle(positions)
    
    for i, req in enumerate(approved):
        req.position = positions[i]
    
    db.commit()
    return {"status": "shuffled"}

@app.post("/queue/reorder")
def reorder_queue(data: ReorderSchema, db: Session = Depends(database.get_db)):
    for index, song_id in enumerate(data.ordered_ids):
        song = db.query(models.SongRequest).filter(models.SongRequest.id == song_id).first()
        if song:
            song.position = index + 1
    db.commit()
    return {"status": "reordered"}

@app.post("/queue/clear")
def clear_queue(db: Session = Depends(database.get_db)):
    db.query(models.SongRequest).delete()
    db.commit()
    return {"status": "cleared"}

@app.get("/suggestions")
def get_suggestions(db: Session = Depends(database.get_db)):
    """Return suggested tracks based on approved + completed songs in the queue."""
    queue_items = db.query(models.SongRequest).filter(
        models.SongRequest.status.in_(["APPROVED", "COMPLETED"])
    ).all()

    if not queue_items:
        return {"suggestions": []}

    # Collect artist names and track IDs from our own DB
    artist_names = list({item.artist for item in queue_items})
    # Exclude all tracks already in the system
    all_items = db.query(models.SongRequest).all()
    exclude_ids = {item.spotify_track_id for item in all_items}

    spotify = services.get_spotify_client(db)
    suggestions = spotify.get_suggestions_by_artists(artist_names, exclude_ids)

    # Apply explicit filter to suggestions too
    block_explicit = services.get_setting(db, "block_explicit", "false") == "true"
    if block_explicit:
        suggestions = [t for t in suggestions if not t.get("explicit", False)]

    return {"suggestions": suggestions}

@app.post("/suggestions/add")
def add_suggestion(track: dict = Body(...), db: Session = Depends(database.get_db)):
    """Admin injects a suggested track directly into the approved queue."""
    # Assign it the next position at the end of the approved queue
    max_pos = db.query(func.max(models.SongRequest.position)).filter(
        models.SongRequest.status == "APPROVED"
    ).scalar() or 0

    new_req = models.SongRequest(
        spotify_track_id=track['id'],
        title=track['name'],
        artist=track['artist'],
        album_art_url=track.get('album_art', ''),
        duration_ms=track.get('duration_ms', 0),
        is_explicit=track.get('explicit', False),
        status="APPROVED",
        position=max_pos + 1
    )
    db.add(new_req)
    db.commit()
    return {"status": "added", "id": new_req.id}

# --- Settings Endpoints ---

@app.get("/settings")
def get_settings(db: Session = Depends(database.get_db)):
    """Return all admin settings."""
    return {
        "block_explicit": services.get_setting(db, "block_explicit", "false") == "true",
        "block_pg": services.get_setting(db, "block_pg", "false") == "true",
        "musixmatch_available": services.get_musixmatch_client().is_available()
    }

@app.post("/settings")
def update_settings(data: dict = Body(...), db: Session = Depends(database.get_db)):
    """Update admin settings. Accepts {block_explicit: bool, block_pg: bool}."""
    if "block_explicit" in data:
        services.set_setting(db, "block_explicit", "true" if data["block_explicit"] else "false")
    if "block_pg" in data:
        services.set_setting(db, "block_pg", "true" if data["block_pg"] else "false")
    return {"status": "updated"}

@app.post("/lyrics/check")
def check_lyrics(track: dict = Body(...), db: Session = Depends(database.get_db)):
    """Check a specific track's lyrics for PG content (admin tool)."""
    mx = services.get_musixmatch_client()
    if not mx.is_available():
        return {"error": "Musixmatch API key not configured", "is_pg_safe": True}
    result = mx.check_lyrics(track.get("name", ""), track.get("artist", ""))
    return result