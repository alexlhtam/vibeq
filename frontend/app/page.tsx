"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import SearchIcon from '@mui/icons-material/Search';
import AddCircleIcon from '@mui/icons-material/AddCircle'; 
import MusicNoteIcon from '@mui/icons-material/MusicNote';

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (query.length < 3) { setResults([]); return; }
    const delay = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get(`http://localhost:8000/search?query=${query}`);
        setResults(res.data.tracks.items);
      } catch (err) { console.error("Search error:", err); } 
      finally { setIsSearching(false); }
    }, 500);
    return () => clearTimeout(delay);
  }, [query]);

  const addToQueue = async (track: any) => {
    try {
      await axios.post("http://localhost:8000/request", {
        spotify_track_id: track.id,
        title: track.name,
        artist: track.artists[0].name,
        album_art_url: track.album.images[0]?.url || "",
        duration_ms: track.duration_ms,
      });
      alert(`Requested "${track.name}"!`);
      setQuery(""); 
      setResults([]);
    } catch (err) { console.error("Request error:", err); }
  };

  return (
    <div className="flex min-h-screen bg-[#F3F4F6] text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0B1120] text-white flex-col hidden md:flex shrink-0">
        <div className="p-6 flex items-center gap-3">
           <div className="bg-[#10B981] p-1.5 rounded-lg"><MusicNoteIcon style={{ color: 'white', fontSize: 20 }} /></div>
           <h1 className="text-xl font-bold tracking-tight">vibeQ</h1>
        </div>
        <nav className="px-4 py-2 space-y-1">
            <div className="flex items-center gap-3 p-3 bg-[#1F2937] border-l-4 border-[#10B981] text-white">
                <SearchIcon sx={{ fontSize: 20 }}/>
                <span className="text-sm">Search Music</span>
            </div>
            <a href="/admin" className="flex items-center gap-3 p-3 text-gray-400 hover:text-white hover:bg-[#1F2937] rounded-lg transition-all">
                <span className="text-sm">Host Dashboard</span>
            </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-200 h-16 flex items-center px-8 justify-between shrink-0">
            <h2 className="font-semibold text-gray-800 text-lg">Guest Request</h2>
        </header>
        
        <div className="flex-1 overflow-y-auto p-8">
            <div className="relative max-w-2xl mx-auto">
                <input 
                    type="text" 
                    value={query} 
                    onChange={(e) => setQuery(e.target.value)} 
                    placeholder="Search for a song or artist..." 
                    className="w-full p-4 pl-12 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-[#10B981] focus:outline-none transition-all" 
                    autoFocus 
                />
                <SearchIcon className="absolute left-4 top-4 text-gray-400" />
            </div>

            <div className="max-w-2xl mx-auto space-y-3 mt-8">
                {isSearching && <p className="text-center text-gray-500">Searching SoundCloud...</p>}
                {results.map((track) => (
                <div key={track.id} className="bg-white p-4 rounded-xl shadow-sm border border-transparent hover:border-[#10B981] flex items-center justify-between transition-all group">
                    <div className="flex items-center gap-4">
                        <img 
                            src={track.album.images[0]?.url || 'https://via.placeholder.com/150'} 
                            className="w-14 h-14 rounded-lg object-cover shadow-inner" 
                            alt={track.name} 
                        />
                        <div>
                            <p className="font-bold text-gray-900">{track.name}</p>
                            <p className="text-sm text-gray-500">{track.artists[0].name}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => addToQueue(track)} 
                        className="text-gray-300 group-hover:text-[#10B981] transition-colors"
                    >
                        <AddCircleIcon sx={{ fontSize: 32 }} />
                    </button>
                </div>
                ))}
            </div>
        </div>
      </main>
    </div>
  );
}