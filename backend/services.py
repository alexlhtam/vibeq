# backend/services.py

import requests
import urllib.parse
import os
from typing import Dict, Any
from dotenv import load_dotenv

# Load the variables from .env relative to this file's location
basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, ".env"))

SOUNDCLOUD_API_BASE = "https://api-v2.soundcloud.com"

def get_spotify_client():
    client_id = os.getenv("SOUNDCLOUD_CLIENT_ID")
    if not client_id:
        print(f"FATAL ERROR: SOUNDCLOUD_CLIENT_ID not found in {os.path.join(basedir, '.env')}")
    return SoundCloudClient(client_id)

class SoundCloudClient:
    def __init__(self, client_id):
        self.client_id = client_id

    def search_tracks(self, query: str) -> Dict[str, Any]:
        if not query or not self.client_id:
            return {"tracks": {"items": []}}

        encoded_query = urllib.parse.quote(query)
        # Search endpoint for tracks
        url = f"{SOUNDCLOUD_API_BASE}/search/tracks?q={encoded_query}&client_id={self.client_id}&limit=12"
        
        # We add these headers to mimic a real web browser, 
        # which helps bypass the 403 Forbidden error.
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://soundcloud.com/',
            'Origin': 'https://soundcloud.com'
        }
        
        try:
            response = requests.get(url, headers=headers)
            
            if response.status_code == 403:
                print("❌ SEARCH BLOCKED: Your SoundCloud Client ID is restricted.")
                print("👉 ACTION: Open soundcloud.com, search for something, and find the 'client_id' in your Browser Network tab to use in your .env.")
                return {"tracks": {"items": []}}

            response.raise_for_status() 
            data = response.json()
            
            # SoundCloud returns results in a 'collection' array
            soundcloud_items = data.get('collection', [])
            
            spotify_style_items = []
            
            for item in soundcloud_items:
                # SoundCloud uses 'large' by default (100x100), we swap to 't500x500' for the UI
                artwork = item.get('artwork_url', '')
                if artwork:
                    artwork = artwork.replace('large', 't500x500')
                else:
                    # Fallback to the artist's avatar if the track has no artwork
                    artwork = item.get('user', {}).get('avatar_url', '').replace('large', 't500x500')

                mapped_item = {
                    "id": str(item.get('id')), 
                    "name": item.get('title'),
                    "artists": [{"name": item.get('user', {}).get('username', 'Unknown Artist')}],
                    "album": { 
                        "images": [{"url": artwork}] 
                    },
                    "duration_ms": item.get('duration', 0)
                }
                spotify_style_items.append(mapped_item)

            return {"tracks": {"items": spotify_style_items}}
            
        except Exception as e:
            print(f"❌ SoundCloud API Error: {e}")
            return {"tracks": {"items": []}}


    # Stubs for architectural consistency with previous Spotify logic
    def get_auth_url(self): 
        return "http://localhost:3000"
    
    def get_tokens(self, code): 
        return {"access_token": "fake"}