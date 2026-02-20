"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { Search as SearchIcon, AddCircle as AddCircleIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.length < 3) { 
      setResults([]); 
      setError("");
      return; 
    }

    const delay = setTimeout(async () => {
      setIsSearching(true);
      setError("");
      try {
        // Use 127.0.0.1 to match your Admin Dashboard setup
        const res = await axios.get(`http://127.0.0.1:8000/search?query=${query}`);
        
        if (res.data.length === 0) {
            setError("No results found. Ensure the Host has connected Spotify.");
        }
        setResults(res.data);
      } catch (err) { 
        console.error("Search error:", err); 
        setError("Search failed. Check if the backend is running.");
      } finally { 
        setIsSearching(false); 
      }
    }, 500);

    return () => clearTimeout(delay);
  }, [query]);

  const addToQueue = async (track: any) => {
    try {
      await axios.post("http://127.0.0.1:8000/request", track);
      alert(`Requested "${track.name}"!`);
      setQuery(""); 
      setResults([]);
    } catch (err) { 
      console.error("Request error:", err);
      alert("Failed to send request.");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-800">
      {/* Sidebar */}
      <aside className="w-72 bg-[#0B1120] text-white flex-col hidden md:flex shrink-0">
        <div className="p-10 flex items-center gap-4">
           <div className="bg-[#10B981] p-2.5 rounded-2xl shadow-lg"><MusicNoteIcon /></div>
           <h1 className="text-3xl tracking-tight"><span className="font-extralight">vibe</span><span className="font-black text-[#10B981]">Q</span></h1>
        </div>
        <nav className="px-6 space-y-2">
            <div className="flex items-center gap-4 p-4 bg-[#1F2937] border-l-4 border-[#10B981] text-white">
                <SearchIcon sx={{ fontSize: 20 }}/>
                <span>Search Music</span>
            </div>
            <a href="/admin" className="flex items-center gap-4 p-4 text-gray-400 hover:text-white transition-all">
                <span>Host Dashboard</span>
            </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b h-24 flex items-center px-12 shrink-0">
            <h2 className="font-black text-2xl text-slate-900">Guest Mode</h2>
        </header>
        
        <div className="flex-1 overflow-y-auto p-12">
            <div className="relative max-w-2xl mx-auto">
                <input 
                    type="text" 
                    value={query} 
                    onChange={(e) => setQuery(e.target.value)} 
                    placeholder="Search for a song..." 
                    className="w-full p-6 pl-14 rounded-[2rem] border-none shadow-2xl text-xl focus:ring-4 focus:ring-[#10B981]/20 focus:outline-none transition-all" 
                    autoFocus 
                />
                <SearchIcon className="absolute left-6 top-7 text-slate-300" />
            </div>

            <div className="max-w-2xl mx-auto mt-12 space-y-4">
                {isSearching && <p className="text-center text-slate-400 font-bold animate-pulse">Searching Spotify...</p>}
                {error && <p className="text-center text-red-400 font-medium">{error}</p>}
                
                {results.map((track) => (
                <div key={track.id} className={`p-5 rounded-[1.5rem] shadow-sm border flex items-center justify-between transition-all group ${track.blocked ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed' : 'bg-white border-transparent hover:border-[#10B981] hover:shadow-xl hover:scale-[1.02]'}`}>
                    <div className="flex items-center gap-5">
                        <img 
                            src={track.album_art || 'https://via.placeholder.com/150'} 
                            className={`w-16 h-16 rounded-2xl object-cover shadow-md ${track.blocked ? 'grayscale' : ''}`}
                            alt="" 
                        />
                        <div>
                            <div className="flex items-center gap-2">
                              <p className={`font-black leading-tight ${track.blocked ? 'text-slate-400' : 'text-slate-900'}`}>{track.name}</p>
                              {track.explicit && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${track.blocked ? 'bg-red-100 text-red-400' : 'bg-slate-200 text-slate-500'}`}>E</span>}
                            </div>
                            <p className="text-sm text-slate-400 font-medium">{track.artist}</p>
                            {track.blocked && <p className="text-[10px] text-red-400 font-bold mt-0.5">Explicit content blocked by host</p>}
                        </div>
                    </div>
                    {!track.blocked && (
                    <button 
                        onClick={() => addToQueue(track)} 
                        className="text-slate-200 group-hover:text-[#10B981] transition-all transform group-hover:scale-110"
                    >
                        <AddCircleIcon sx={{ fontSize: 44 }} />
                    </button>
                    )}
                </div>
                ))}
            </div>
        </div>
      </main>
    </div>
  );
}