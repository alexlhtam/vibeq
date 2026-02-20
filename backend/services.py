# backend/services.py

import requests
import os
import time
import base64
import urllib.parse
from typing import List, Dict, Any
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
                "duration_ms": t['duration_ms']
            } for t in tracks]
            
        except Exception as e:
            print(f"vibeQ ERROR: Search Exception: {e}")
            return []

def get_spotify_client(db):
    return SpotifyService(db)
