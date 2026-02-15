from sqlalchemy import Column, Integer, String, BigInteger
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    spotify_id = Column(String, unique=True, index=True)
    access_token = Column(String)
    refresh_token = Column(String)
    token_expires_at = Column(BigInteger)

class SongRequest(Base):
    __tablename__ = "song_requests"
    id = Column(Integer, primary_key=True, index=True)
    spotify_track_id = Column(String, index=True)
    title = Column(String)
    artist = Column(String)
    album_art_url = Column(String)
    duration_ms = Column(Integer)
    status = Column(String, default="PENDING") # PENDING, APPROVED, REJECTED, COMPLETED
    position = Column(Integer, default=0)