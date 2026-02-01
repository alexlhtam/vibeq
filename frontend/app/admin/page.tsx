"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import SearchIcon from '@mui/icons-material/Search';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import FastForwardIcon from '@mui/icons-material/FastForward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';

declare global { interface Window { SC?: any; } }

interface SongRequest {
  id: number;
  title: string;
  artist: string;
  album_art_url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'; 
  spotify_track_id: string; 
}

const SOUNDCLOUD_IFRAME_ID = "vibe-player-hidden";

export default function AdminDashboard() {
  const [queue, setQueue] = useState<SongRequest[]>([]);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [isPaused, setIsPaused] = useState(false);
  const playerRef = useRef<any>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:8000/queue");
      setQueue(res.data?.queue || []);
    } catch (error) { console.error("Queue fetch error", error); }
  }, []);

  const handleSkip = useCallback(async (id: number) => {
    try {
        await axios.post(`http://localhost:8000/request/${id}/played`);
        setProgress(0);
        fetchQueue();
    } catch (e) { console.error(e); }
  }, [fetchQueue]);

  const nowPlaying = queue.find(r => r.status === 'APPROVED');

  // --- RE-BINDING LOGIC ---
  // This effect runs every time nowPlaying changes to re-hook the controls
  useEffect(() => {
    if (!nowPlaying || !window.SC) return;

    // Give React a split second to mount the new iframe
    const timer = setTimeout(() => {
      const iframe = document.getElementById(SOUNDCLOUD_IFRAME_ID) as HTMLIFrameElement;
      if (iframe) {
        const widget = window.SC.Widget(iframe);
        playerRef.current = widget;

        widget.bind(window.SC.Widget.Events.READY, () => {
          console.log("Widget connected to song:", nowPlaying.title);
          
          widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (data: any) => {
            setProgress(data.relativePosition);
          });

          widget.bind(window.SC.Widget.Events.FINISH, () => {
            handleSkip(nowPlaying.id);
          });

          widget.bind(window.SC.Widget.Events.PLAY, () => setIsPaused(false));
          widget.bind(window.SC.Widget.Events.PAUSE, () => setIsPaused(true));
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [nowPlaying?.id, handleSkip]);

  // Initial setup for the script and polling
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    document.body.appendChild(script);
    
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000); 
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPoint = parseFloat(e.target.value);
    if (playerRef.current) {
        playerRef.current.getDuration((duration: number) => {
            playerRef.current.seekTo(duration * newPoint);
            setProgress(newPoint);
        });
    }
  };

  const togglePlay = () => {
    if (playerRef.current) playerRef.current.toggle();
  };

  const activeQueue = queue.filter(r => r.status === 'APPROVED' && r.id !== nowPlaying?.id);
  const pendingRequests = queue.filter(r => r.status === 'PENDING');

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-800 font-sans">
      {!hasInteracted && (
        <div className="fixed inset-0 z-[999] bg-[#0B1120]/95 backdrop-blur-md flex items-center justify-center">
            <button onClick={() => setHasInteracted(true)} className="bg-[#10B981] text-white px-12 py-6 rounded-[2rem] font-black text-2xl shadow-2xl hover:scale-105 transition-all flex items-center gap-4">
                <PlayArrowIcon sx={{ fontSize: 40 }} /> START THE VIBE
            </button>
        </div>
      )}

      <aside className="w-72 bg-[#0B1120] text-white flex-col hidden md:flex shrink-0">
        <div className="p-10 flex items-center gap-4">
            <div className="bg-[#10B981] p-2.5 rounded-2xl shadow-lg shadow-green-500/20"><MusicNoteIcon /></div>
            <h1 className="text-3xl font-black tracking-tighter">vibeQ</h1>
        </div>
        <nav className="px-6">
            <a href="/" className="flex items-center gap-4 p-4 text-gray-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all">
                <SearchIcon /><span className="font-bold">Guest View</span>
            </a>
        </nav>
      </aside>
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 h-24 flex items-center px-12 justify-between shrink-0">
          <h2 className="font-black text-2xl tracking-tight text-slate-900">Host Dashboard</h2>
          <button onClick={() => axios.post("http://localhost:8000/queue/clear").then(fetchQueue)} className="text-red-400 hover:text-red-600 transition-all flex items-center gap-2 text-sm font-black uppercase tracking-widest leading-none"><DeleteSweepIcon fontSize="small" /> Reset</button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 space-y-12 pb-32">
            
            <section className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 px-2">Now Streaming</h3>
                
                <div className="bg-white p-10 rounded-[3rem] shadow-2xl shadow-slate-200/50 border border-white">
                    {nowPlaying ? (
                        <div className="flex flex-col gap-10">
                            <div className="flex items-center gap-10">
                                <img src={nowPlaying.album_art_url} className="w-44 h-44 rounded-[3rem] shadow-2xl object-cover ring-8 ring-slate-50" />
                                <div className="flex-1">
                                    <p className="font-black text-5xl text-slate-900 tracking-tight leading-tight mb-2">{nowPlaying.title}</p>
                                    <p className="text-2xl text-slate-400 font-bold">{nowPlaying.artist}</p>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={togglePlay} className="w-20 h-20 bg-slate-100 text-slate-900 rounded-[2rem] flex items-center justify-center hover:bg-slate-200 transition-all">
                                        {isPaused ? <PlayArrowIcon sx={{ fontSize: 40 }} /> : <PauseIcon sx={{ fontSize: 40 }} />}
                                    </button>
                                    <button onClick={() => handleSkip(nowPlaying.id)} className="w-20 h-20 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center hover:bg-[#10B981] transition-all shadow-xl">
                                        <FastForwardIcon sx={{ fontSize: 40 }} />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-4 px-2">
                                <input 
                                    type="range" min="0" max="1" step="0.001" 
                                    value={progress} onChange={handleSeek}
                                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#10B981]"
                                />
                                <div className="flex justify-between text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                    <span>Live Output</span>
                                    <span>{isPaused ? 'Paused' : 'Playing'}</span>
                                </div>
                            </div>

                            {/* THE ACTUAL SOURCE (Hidden) */}
                            <div className="opacity-0 pointer-events-none absolute h-0 w-0 overflow-hidden">
                                <iframe 
                                    id={SOUNDCLOUD_IFRAME_ID}
                                    key={nowPlaying.id} // Forces re-mount when song changes
                                    width="100%" height="10" allow="autoplay; encrypted-media" 
                                    src={`https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${nowPlaying.spotify_track_id}&auto_play=true&visual=false`}
                                ></iframe>
                            </div>
                        </div>
                    ) : (
                        <div className="py-20 text-center space-y-6">
                            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                                <MusicNoteIcon className="text-slate-200" sx={{ fontSize: 48 }} />
                            </div>
                            <p className="text-slate-300 font-black text-2xl uppercase tracking-tighter italic">Waiting for requests...</p>
                        </div>
                    )}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {/* QUEUE & REQUESTS (Remaining layout unchanged) */}
                <section className="space-y-6">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 ml-4">Up Next</h3>
                    <div className="space-y-4">
                        {activeQueue.map(req => (
                            <div key={req.id} className="p-6 bg-white rounded-[2rem] flex items-center gap-6 shadow-sm">
                                <img src={req.album_art_url} className="w-20 h-20 rounded-2xl object-cover" />
                                <div className="flex-1">
                                    <p className="font-black text-xl text-slate-800 tracking-tight">{req.title}</p>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{req.artist}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="space-y-6">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#10B981] ml-4">Incoming</h3>
                    <div className="space-y-4">
                        {pendingRequests.map(req => (
                            <div key={req.id} className="p-6 bg-white rounded-[2rem] flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-6">
                                    <img src={req.album_art_url} className="w-20 h-20 rounded-2xl object-cover" />
                                    <div>
                                        <p className="font-black text-xl text-slate-800 tracking-tight">{req.title}</p>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{req.artist}</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => axios.post(`http://localhost:8000/request/${req.id}/approve`).then(fetchQueue)} className="text-slate-200 hover:text-[#10B981] transition-all"><CheckCircleIcon sx={{ fontSize: 56 }} /></button>
                                    <button onClick={() => axios.post(`http://localhost:8000/request/${req.id}/deny`).then(fetchQueue)} className="text-slate-200 hover:text-red-400 transition-all"><CancelIcon sx={{ fontSize: 56 }} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
      </main>
    </div>
  );
}