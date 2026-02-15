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
    return services.get_spotify_client(db).search(query)

@app.post("/request")
def add_request(track: dict = Body(...), db: Session = Depends(database.get_db)):
    new_req = models.SongRequest(
        spotify_track_id=track['id'], 
        title=track['name'], 
        artist=track['artist'], 
        album_art_url=track['album_art'], 
        duration_ms=track['duration_ms']
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