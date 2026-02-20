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
    <div className="flex min-h-screen bg-[#F3F4F6] text-slate-800 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0B1120] text-white flex-col hidden md:flex shrink-0">
        <div className="p-8 flex items-center gap-3">
           <div className="bg-[#10B981] p-2 rounded-xl shadow-lg shadow-green-900/20"><MusicNoteIcon /></div>
           <h1 className="text-2xl font-black tracking-tighter">vibeQ</h1>
        </div>
        <nav className="px-4 py-2 space-y-1">
            <div className="flex items-center gap-3 p-4 bg-[#1F2937] border-l-4 border-[#10B981] text-white">
                <SearchIcon sx={{ fontSize: 20 }}/>
                <span className="text-sm font-bold">Search Music</span>
            </div>
            <a href="/admin" className="flex items-center gap-3 p-4 text-gray-400 hover:text-white rounded-lg transition-all">
                <span className="text-sm">Host Dashboard</span>
            </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-200 h-20 flex items-center px-12 shrink-0">
            <h2 className="font-bold text-lg text-gray-800 uppercase tracking-widest">Guest Mode</h2>
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
                <div key={track.id} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-transparent hover:border-[#10B981] flex items-center justify-between transition-all group hover:shadow-xl hover:scale-[1.02]">
                    <div className="flex items-center gap-5">
                        <img 
                            src={track.album_art || 'https://via.placeholder.com/150'} 
                            className="w-16 h-16 rounded-2xl object-cover shadow-md" 
                            alt="" 
                        />
                        <div>
                            <p className="font-black text-slate-900 leading-tight">{track.name}</p>
                            <p className="text-sm text-slate-400 font-medium">{track.artist}</p>
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