from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import models
from database import engine, get_db
from services import get_spotify_client

# Database Init
models.Base.metadata.create_all(bind=engine)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

class SongSchema(BaseModel):
    spotify_track_id: str
    title: str
    artist: str
    album_art_url: str
    duration_ms: int

@app.get("/search")
def search_song(query: str):
    client = get_spotify_client()
    return client.search_tracks(query)

@app.post("/request")
def add_request(song: SongSchema, db: Session = Depends(get_db)):
    if not db.query(models.Session).first():
        host = models.User(spotify_id="host", access_token="x", refresh_token="x", token_expires_at=0)
        db.add(host)
        db.commit()
        db.add(models.Session(host_id=host.id, room_code="PARTY", settings={}))
        db.commit()
    
    session = db.query(models.Session).first()
    guest = db.query(models.Guest).first() or models.Guest(session_id=session.id, username="Guest", session_token="x")
    if not guest.id: 
        db.add(guest)
        db.commit()

    new_req = models.SongRequest(
        session_id=session.id, guest_id=guest.id,
        spotify_track_id=song.spotify_track_id, title=song.title,
        artist=song.artist, album_art_url=song.album_art_url,
        duration_ms=song.duration_ms, status="PENDING"
    )
    db.add(new_req)
    db.commit()
    return {"status": "queued"}

@app.get("/queue")
def get_queue(db: Session = Depends(get_db)):
    session = db.query(models.Session).first()
    if not session:
        return {"queue": []}
    return {"queue": [
        {
            "id": r.id, "title": r.title, "artist": r.artist, 
            "album_art_url": r.album_art_url, "status": r.status,
            "spotify_track_id": r.spotify_track_id
        } for r in session.requests if r.status != "COMPLETED"
    ]}

@app.post("/queue/clear")
def clear_queue(db: Session = Depends(get_db)):
    db.query(models.SongRequest).delete()
    db.commit()
    return {"status": "cleared"}

@app.post("/request/{request_id}/approve")
def approve_request(request_id: str, db: Session = Depends(get_db)):
    req = db.query(models.SongRequest).filter(models.SongRequest.id == int(request_id)).first()
    if req:
        req.status = "APPROVED"
        db.commit()
    return {"status": "APPROVED"}

@app.post("/request/{request_id}/deny")
def deny_request(request_id: str, db: Session = Depends(get_db)):
    req = db.query(models.SongRequest).filter(models.SongRequest.id == int(request_id)).first()
    if req:
        req.status = "REJECTED"
        db.commit()
    return {"status": "REJECTED"}

# THIS IS THE MISSING ENDPOINT CAUSING THE 404
@app.post("/request/{request_id}/played")
def mark_as_played(request_id: str, db: Session = Depends(get_db)):
    req = db.query(models.SongRequest).filter(models.SongRequest.id == int(request_id)).first()
    if req:
        req.status = "COMPLETED"
        db.commit()
    return {"status": "COMPLETED"}