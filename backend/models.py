# backend/models.py

from sqlalchemy import Column, Integer, String, ForeignKey, JSON, BigInteger
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # We keep 'spotify_id' as the column name for legacy compatibility, 
    # even though we are using SoundCloud or other services now.
    spotify_id = Column(String, unique=True, index=True)
    access_token = Column(String)
    refresh_token = Column(String)
    # BigInteger is required here because timestamp integers can exceed standard Integer limits
    token_expires_at = Column(BigInteger)
    
    sessions = relationship("Session", back_populates="host")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"))
    room_code = Column(String, unique=True, index=True)
    settings = Column(JSON)
    
    host = relationship("User", back_populates="sessions")
    guests = relationship("Guest", back_populates="session")
    requests = relationship("SongRequest", back_populates="session")

class Guest(Base):
    __tablename__ = "guests"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    username = Column(String)
    session_token = Column(String, unique=True)
    
    session = relationship("Session", back_populates="guests")
    requests = relationship("SongRequest", back_populates="guest")

class SongRequest(Base):
    __tablename__ = "song_requests"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    guest_id = Column(Integer, ForeignKey("guests.id"))
    
    # This stores the ID from the music service (SoundCloud ID, Deezer ID, etc.)
    spotify_track_id = Column(String, index=True)
    
    title = Column(String)
    artist = Column(String)
    album_art_url = Column(String)
    duration_ms = Column(Integer)
    
    # Status can be: 'PENDING', 'APPROVED', 'REJECTED', 'PLAYED'
    status = Column(String, default="PENDING")
    
    session = relationship("Session", back_populates="requests")
    guest = relationship("Guest", back_populates="requests")