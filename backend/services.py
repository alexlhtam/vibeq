# backend/services.py

import requests
import os
import time
import base64
import urllib.parse
from typing import List, Dict, Any, Optional, Set
from dotenv import load_dotenv

load_dotenv()

class SpotifyService:
    def __init__(self, db):
        self.db = db
        self.client_id = os.getenv("SPOTIFY_CLIENT_ID")
        self.client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

    def get_token(self) -> str:
        import models 
        host = self.db.query(models.User).filter(models.User.spotify_id == "host").first()
        
        if not host:
            print("vibeQ ERROR: No host user found in database.")
            return None
        if not host.refresh_token:
            print("vibeQ ERROR: Host found, but no refresh_token available.")
            return None

        current_time = int(time.time())
        # Refresh if token is expired or missing
        if not host.access_token or current_time > (host.token_expires_at - 60):
            print("vibeQ: Token expired or missing. Refreshing...")
            
            auth_str = f"{self.client_id}:{self.client_secret}"
            auth_b64 = base64.b64encode(auth_str.encode()).decode()

            try:
                response = requests.post(
                    "https://accounts.spotify.com/api/token",
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": host.refresh_token
                    },
                    headers={
                        "Authorization": f"Basic {auth_b64}",
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    host.access_token = data.get("access_token")
                    host.token_expires_at = current_time + data.get("expires_in", 3600)
                    if "refresh_token" in data:
                        host.refresh_token = data["refresh_token"]
                    
                    self.db.commit()
                    return host.access_token
                else:
                    print(f"vibeQ ERROR: Refresh failed ({response.status_code}): {response.text}")
                    return None
            except Exception as e:
                print(f"vibeQ ERROR: Exception during refresh: {e}")
                return None

        return host.access_token

    def search(self, query: str) -> List[Dict[str, Any]]:
        if not query or len(query.strip()) < 3:
            return []

        token = self.get_token()
        if not token:
            print("vibeQ ERROR: No token available for search. Has the host connected?")
            return []

        headers = {
            "Authorization": f"Bearer {token}"
        }

        params = {
            "q": query.strip(),
            "type": "track",
            "limit": 10
        }

        try:
            resp = requests.get("https://api.spotify.com/v1/search", headers=headers, params=params)
            
            if resp.status_code != 200:
                print(f"vibeQ ERROR: Spotify API {resp.status_code}")
                print(f"Response: {resp.text}")
                return []

            data = resp.json()
            tracks = data.get('tracks', {}).get('items', [])
            
            return [{
                "id": t['id'],
                "name": t['name'],
                "artist": t['artists'][0]['name'],
                "album_art": t['album']['images'][0]['url'] if t['album']['images'] else "",
                "duration_ms": t['duration_ms'],
                "explicit": t.get('explicit', False)
            } for t in tracks]
            
        except Exception as e:
            print(f"vibeQ ERROR: Search Exception: {e}")
            return []

    def get_suggestions_by_artists(self, artist_names: list, exclude_track_ids: Optional[set] = None) -> list:
        """Get track suggestions by searching for tracks by the same artists.
        Uses the Search API which works reliably in Spotify dev mode."""
        if not artist_names:
            return []

        token = self.get_token()
        if not token:
            return []

        headers = {"Authorization": f"Bearer {token}"}
        exclude_track_ids = exclude_track_ids or set()

        results = []
        for artist_name in artist_names[:5]:  # Limit to 5 artists
            try:
                resp = requests.get(
                    "https://api.spotify.com/v1/search",
                    headers=headers,
                    params={"q": f"artist:{artist_name}", "type": "track", "limit": 10}
                )
                if resp.status_code == 200:
                    tracks = resp.json().get("tracks", {}).get("items", [])
                    print(f"vibeQ: Search for '{artist_name}' returned {len(tracks)} tracks")
                    results.extend(self._format_tracks(tracks, exclude_track_ids))
                else:
                    print(f"vibeQ: Search fallback {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                print(f"vibeQ: Error in search fallback: {e}")

        # Deduplicate and limit
        seen = set()
        unique = []
        for t in results:
            if t["id"] not in seen:
                seen.add(t["id"])
                unique.append(t)
        return unique[:20]

    def _format_tracks(self, tracks: list, exclude_ids: set) -> list:
        """Format Spotify track objects into our standard shape, filtering exclusions."""
        formatted = []
        for t in tracks:
            if not t or t["id"] in exclude_ids:
                continue
            formatted.append({
                "id": t["id"],
                "name": t["name"],
                "artist": t["artists"][0]["name"] if t.get("artists") else "Unknown",
                "album_art": t["album"]["images"][0]["url"] if t.get("album", {}).get("images") else "",
                "duration_ms": t.get("duration_ms", 0),
                "explicit": t.get("explicit", False)
            })
        return formatted


def get_spotify_client(db):
    return SpotifyService(db)


# --- Settings helpers ---
def get_setting(db, key: str, default: str = "") -> str:
    import models
    setting = db.query(models.Settings).filter(models.Settings.key == key).first()
    return setting.value if setting else default

def set_setting(db, key: str, value: str):
    import models
    setting = db.query(models.Settings).filter(models.Settings.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = models.Settings(key=key, value=value)
        db.add(setting)
    db.commit()


# --- Musixmatch lyrics-based PG check ---
class MusixmatchService:
    """Check if a song's lyrics contain profanity/non-family-friendly content.
    Uses free Musixmatch API (2,000 calls/day)."""

    # Words/phrases that indicate non-family-friendly content
    PG_WORD_LIST = {
        "fuck", "shit", "bitch", "ass", "damn", "hell", "dick", "pussy",
        "cock", "nigga", "nigger", "whore", "slut", "cunt", "motherfuck",
        "bullshit", "goddamn", "asshole", "bastard", "dopeman", "cocaine",
        "heroin", "molly", "ecstasy", "blunt", "weed", "stripper"
    }

    def __init__(self):
        self.api_key = os.getenv("MUSIXMATCH_API_KEY", "")

    def is_available(self) -> bool:
        return bool(self.api_key)

    def check_lyrics(self, track_name: str, artist_name: str) -> dict:
        """Returns {has_lyrics: bool, is_pg_safe: bool, flagged_words: []}."""
        if not self.api_key:
            return {"has_lyrics": False, "is_pg_safe": True, "flagged_words": []}

        try:
            # Step 1: Find the track
            resp = requests.get(
                "https://api.musixmatch.com/ws/1.1/matcher.lyrics.get",
                params={
                    "q_track": track_name,
                    "q_artist": artist_name,
                    "apikey": self.api_key
                },
                timeout=5
            )
            data = resp.json()
            status_code = data.get("message", {}).get("header", {}).get("status_code")

            if status_code != 200:
                return {"has_lyrics": False, "is_pg_safe": True, "flagged_words": []}

            lyrics_body = data.get("message", {}).get("body", {}).get("lyrics", {})
            lyrics_text = lyrics_body.get("lyrics_body", "").lower()
            explicit_flag = lyrics_body.get("explicit", 0)

            if not lyrics_text:
                return {"has_lyrics": False, "is_pg_safe": True, "flagged_words": []}

            # Step 2: Check for flagged words
            flagged = []
            for word in self.PG_WORD_LIST:
                if word in lyrics_text:
                    flagged.append(word)

            is_safe = len(flagged) == 0 and explicit_flag == 0
            return {"has_lyrics": True, "is_pg_safe": is_safe, "flagged_words": flagged}

        except Exception as e:
            print(f"vibeQ: Musixmatch error: {e}")
            return {"has_lyrics": False, "is_pg_safe": True, "flagged_words": []}


def get_musixmatch_client():
    return MusixmatchService()