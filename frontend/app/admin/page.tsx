"use client";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import axios from "axios";
import { useSearchParams } from 'next/navigation';
import { 
  MusicNote as MusicNoteIcon, 
  Search as SearchIcon, 
  DeleteSweep as DeleteSweepIcon, 
  CheckCircle as CheckCircleIcon, 
  Cancel as CancelIcon, 
  FastForward as FastForwardIcon, 
  PlayArrow as PlayArrowIcon, 
  Pause as PauseIcon,
  Shuffle as ShuffleIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  LibraryMusic as SpotifyIcon,
  AutoAwesome as AutoAwesomeIcon,
  AddCircle as AddCircleIcon,
  Refresh as RefreshIcon,
  Explicit as ExplicitIcon,
  FamilyRestroom as FamilyRestroomIcon
} from '@mui/icons-material';

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

declare global { interface Window { onSpotifyWebPlaybackSDKReady: any; Spotify: any; } }

function SortableSong({ req, onRemove }: { req: any, onRemove: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: req.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`p-4 bg-white rounded-2xl flex items-center gap-4 border border-slate-50 shadow-sm transition-all ${isDragging ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}>
      <div {...attributes} {...listeners} className="cursor-grab text-slate-300 hover:text-slate-600 px-1"><DragIcon fontSize="small" /></div>
      <img src={req.album_art_url} className="w-12 h-12 rounded-xl object-cover shadow-sm" alt="" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-slate-800 text-sm">{req.title}</p>
          {req.is_explicit && <span className="text-[8px] font-black bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">E</span>}
        </div>
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{req.artist}</p>
      </div>
      <button onClick={() => onRemove(req.id)} className="text-slate-200 hover:text-red-500 transition-colors p-2"><DeleteIcon fontSize="small" /></button>
    </div>
  );
}

function AdminDashboardContent() {
  const [queue, setQueue] = useState<any[]>([]);
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [player, setPlayer] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [blockExplicit, setBlockExplicit] = useState(false);
  const [blockPG, setBlockPG] = useState(false);
  const [musixmatchAvailable, setMusixmatchAvailable] = useState(false);

  // Refs for the Spotify event listener (avoids stale closure issues)
  const queueRef = useRef<any[]>([]);
  const tokenRef = useRef("");
  const deviceIdRef = useRef("");
  const isTransitioningRef = useRef(false);
  
  const searchParams = useSearchParams();
  const status = searchParams.get('status');

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const fetchQueue = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:8000/queue");
      setQueue(res.data?.queue || []);
    } catch (error) { console.error(error); }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await axios.get("http://localhost:8000/suggestions");
      setSuggestions(res.data?.suggestions || []);
    } catch (error) { console.error("Suggestions error:", error); }
    finally { setSuggestionsLoading(false); }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:8000/settings");
      setBlockExplicit(res.data.block_explicit);
      setBlockPG(res.data.block_pg);
      setMusixmatchAvailable(res.data.musixmatch_available);
    } catch (error) { console.error("Settings error:", error); }
  }, []);

  const fetchToken = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:8000/spotify/token");
      if (res.data.token) { setToken(res.data.token); return res.data.token; }
    } catch (e) { console.log("Not logged in"); }
    return null;
  }, []);

  // Keep refs in sync with state so event listeners always have fresh values
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  // Initialize Spotify Player
  useEffect(() => {
    const init = async () => {
      const currentToken = await fetchToken();
      if (!currentToken) return;

      if (!window.Spotify) {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
      }

      window.onSpotifyWebPlaybackSDKReady = () => {
        const p = new window.Spotify.Player({
          name: 'vibeQ Jukebox',
          getOAuthToken: async (cb: any) => {
            // Always fetch a fresh token (handles auto-refresh)
            try {
              const res = await axios.get("http://localhost:8000/spotify/token");
              if (res.data.token) {
                setToken(res.data.token);
                cb(res.data.token);
              } else {
                cb(tokenRef.current);
              }
            } catch {
              cb(tokenRef.current);
            }
          },
          volume: 0.5
        });

        p.addListener('ready', ({ device_id }: any) => { setDeviceId(device_id); });
        
        p.addListener('player_state_changed', (state: any) => {
          if (!state) return;
          setIsPaused(state.paused);
          setPosition(state.position);
          setDuration(state.duration);

          // Detect track ended: paused + position 0 + no Spotify-queued next tracks
          const trackEnded = state.paused && 
            state.position === 0 &&
            state.track_window.next_tracks.length === 0;

          if (trackEnded && !isTransitioningRef.current) {
            const q = queueRef.current;
            const nowPlaying = q.find((r: any) => r.status === 'APPROVED');
            if (!nowPlaying) return;

            // Verify this is actually the track that was playing (not a fresh load)
            const currentSpotifyId = state.track_window?.current_track?.id;
            if (currentSpotifyId !== nowPlaying.spotify_track_id) return;

            isTransitioningRef.current = true;
            
            // Mark current as completed, fetch new queue, then play next
            axios.post(`http://localhost:8000/request/${nowPlaying.id}/played`)
              .then(() => axios.get("http://localhost:8000/queue"))
              .then(res => {
                const newQueue = res.data?.queue || [];
                setQueue(newQueue);
                
                const nextTrack = newQueue.find((r: any) => r.status === 'APPROVED');
                const dev = deviceIdRef.current;
                const tok = tokenRef.current;
                
                if (nextTrack && dev && tok) {
                  fetch(`https://api.spotify.com/v1/me/player/play?device_id=${dev}`, {
                    method: 'PUT',
                    body: JSON.stringify({ uris: [`spotify:track:${nextTrack.spotify_track_id}`] }),
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
                  }).finally(() => {
                    // Allow next transition after a short delay
                    setTimeout(() => { isTransitioningRef.current = false; }, 2000);
                  });
                } else {
                  isTransitioningRef.current = false;
                }
              })
              .catch(() => { isTransitioningRef.current = false; });
          }
        });

        p.connect();
        setPlayer(p);
      };
    };
    init();
  }, [fetchToken, status]);

  // Update slider position every second
  useEffect(() => {
    const interval = setInterval(async () => {
      if (player && !isPaused) {
        const state = await player.getCurrentState();
        if (state) setPosition(state.position);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [player, isPaused]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Fetch suggestions on mount and every 30s
  useEffect(() => {
    fetchSuggestions();
    const interval = setInterval(fetchSuggestions, 30000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync logic — only starts playback when nothing is playing yet
  useEffect(() => {
    const nowPlayingTrack = queue.find(r => r.status === 'APPROVED');

    if (nowPlayingTrack && token && deviceId && !isTransitioningRef.current) {
      player?.getCurrentState().then((state: any) => {
        // Only start playing if nothing is currently loaded, or a completely different track is loaded
        const needsPlay = !state || state.track_window.current_track.id !== nowPlayingTrack.spotify_track_id;
        // But don't interfere if Spotify is actively playing something
        const isActivelyPlaying = state && !state.paused;
        
        if (needsPlay && !isActivelyPlaying) {
          fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${nowPlayingTrack.spotify_track_id}`] }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          });
        }
      });
    } else if (!nowPlayingTrack && player) {
      // No more tracks in queue — pause playback
      isTransitioningRef.current = false;
      player.pause();
      setIsPaused(true);
      setPosition(0);
      setDuration(0);
    }
  }, [queue, deviceId, token, player]);

  const handleSkip = async (id: number) => {
    isTransitioningRef.current = true;
    await axios.post(`http://localhost:8000/request/${id}/played`);
    const res = await axios.get("http://localhost:8000/queue");
    const newQueue = res.data?.queue || [];
    setQueue(newQueue);
    
    const nextTrack = newQueue.find((r: any) => r.status === 'APPROVED');
    if (nextTrack && deviceId && token) {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [`spotify:track:${nextTrack.spotify_track_id}`] }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
    }
    setTimeout(() => { isTransitioningRef.current = false; }, 2000);
  };

  const handleRemove = async (id: number) => {
    await axios.post(`http://localhost:8000/request/${id}/remove`);
    fetchQueue();
  };

  const handleShuffle = async () => {
    await axios.post(`http://localhost:8000/queue/shuffle`);
    fetchQueue();
  };

  const handleAddSuggestion = async (track: any) => {
    try {
      await axios.post("http://localhost:8000/suggestions/add", track);
      // Remove from local suggestions list immediately
      setSuggestions(prev => prev.filter(s => s.id !== track.id));
      fetchQueue();
    } catch (error) { console.error("Add suggestion error:", error); }
  };

  const toggleExplicit = async () => {
    const newVal = !blockExplicit;
    setBlockExplicit(newVal);
    await axios.post("http://localhost:8000/settings", { block_explicit: newVal });
  };

  const togglePG = async () => {
    const newVal = !blockPG;
    setBlockPG(newVal);
    await axios.post("http://localhost:8000/settings", { block_pg: newVal });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPos = parseInt(e.target.value, 10);
    player?.seek(newPos);
    setPosition(newPos);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = activeQueue.findIndex(i => i.id === active.id);
      const newIndex = activeQueue.findIndex(i => i.id === over.id);
      const newOrderedList = arrayMove(activeQueue, oldIndex, newIndex);
      const otherSongs = queue.filter(s => s.status !== 'APPROVED' || s.id === nowPlaying?.id);
      setQueue([...otherSongs, ...newOrderedList]);
      await axios.post("http://localhost:8000/queue/reorder", { ordered_ids: newOrderedList.map(s => s.id) });
    }
  };

  const nowPlaying = queue.find(r => r.status === 'APPROVED');
  const activeQueue = queue.filter(r => r.status === 'APPROVED' && r.id !== nowPlaying?.id);
  const pendingRequests = queue.filter(r => r.status === 'PENDING');

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-8">
          <div className="bg-[#10B981] w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-2xl"><MusicNoteIcon sx={{ fontSize: 40, color: 'white' }} /></div>
          <h1 className="text-4xl text-white tracking-tight"><span className="font-extralight">vibe</span><span className="font-black text-[#10B981]">Q</span> <span className="font-black">Admin</span></h1>
          <button onClick={() => axios.get("http://localhost:8000/login/spotify").then(res => window.location.href = res.data.url)} className="w-full py-4 bg-[#1DB954] text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl">
            <SpotifyIcon /> CONNECT SPOTIFY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-800">
      <aside className="w-72 bg-[#0B1120] text-white flex-col hidden md:flex shrink-0">
        <div className="p-10 flex items-center gap-4">
          <div className="bg-[#10B981] p-2.5 rounded-2xl shadow-lg"><MusicNoteIcon /></div>
          <h1 className="text-3xl tracking-tight"><span className="font-extralight">vibe</span><span className="font-black text-[#10B981]">Q</span></h1>
        </div>
        <nav className="px-6 space-y-2">
          <a href="/" target="_blank" className="flex items-center gap-4 p-4 text-gray-400 hover:text-white transition-all"><SearchIcon /><span>Guest View</span></a>
        </nav>

        {/* Content Filters */}
        <div className="mt-auto px-6 pb-8 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 px-4">Content Filters</p>
          
          {/* Explicit Toggle */}
          <button onClick={toggleExplicit} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white/5">
            <ExplicitIcon sx={{ fontSize: 20 }} className={blockExplicit ? 'text-red-400' : 'text-gray-600'} />
            <span className={`text-sm flex-1 text-left ${blockExplicit ? 'text-white font-bold' : 'text-gray-400'}`}>Block Explicit</span>
            <div className={`w-10 h-6 rounded-full relative transition-all ${blockExplicit ? 'bg-red-500' : 'bg-gray-700'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${blockExplicit ? 'left-5' : 'left-1'}`} />
            </div>
          </button>

          {/* PG Toggle */}
          <button onClick={togglePG} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white/5 ${!musixmatchAvailable ? 'opacity-40 cursor-not-allowed' : ''}`} disabled={!musixmatchAvailable}>
            <FamilyRestroomIcon sx={{ fontSize: 20 }} className={blockPG ? 'text-amber-400' : 'text-gray-600'} />
            <div className="flex-1 text-left">
              <span className={`text-sm block ${blockPG ? 'text-white font-bold' : 'text-gray-400'}`}>PG Mode</span>
              {!musixmatchAvailable && <span className="text-[9px] text-gray-600">Set MUSIXMATCH_API_KEY</span>}
            </div>
            <div className={`w-10 h-6 rounded-full relative transition-all ${blockPG ? 'bg-amber-500' : 'bg-gray-700'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${blockPG ? 'left-5' : 'left-1'}`} />
            </div>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b h-24 flex items-center px-12 justify-between shrink-0">
          <h2 className="font-black text-2xl text-slate-900">Host Dashboard</h2>
          <button onClick={() => axios.post("http://localhost:8000/queue/clear").then(fetchQueue)} className="text-red-400 hover:text-red-600 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all">
            <DeleteSweepIcon fontSize="small" /> Reset All
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-12 space-y-12 pb-32">
          {/* NOW PLAYING */}
          <section className="space-y-6">
            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 ml-4">Currently Playing</h3>
            <div className="bg-white p-8 rounded-[3.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
              {nowPlaying ? (
                <div className="space-y-8">
                  <div className="flex items-center gap-10">
                    <img src={nowPlaying.album_art_url} className="w-36 h-36 rounded-[2.5rem] shadow-2xl object-cover ring-8 ring-slate-50" alt="" />
                    <div className="flex-1">
                      <p className="font-black text-4xl text-slate-900 leading-tight mb-2">{nowPlaying.title}</p>
                      <p className="text-xl text-slate-400 font-medium">{nowPlaying.artist}</p>
                      <div className="mt-6 flex items-center gap-4">
                        <button onClick={() => player?.togglePlay()} className="w-12 h-12 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 transition-all">
                          {isPaused ? <PlayArrowIcon /> : <PauseIcon />}
                        </button>
                      </div>
                    </div>
                    <button onClick={() => handleSkip(nowPlaying.id)} className="w-20 h-20 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center hover:bg-[#10B981] transition-all shadow-xl active:scale-90">
                      <FastForwardIcon sx={{ fontSize: 40 }} />
                    </button>
                  </div>
                  
                  {/* FUNCTIONAL SLIDER */}
                  <div className="px-2 space-y-2">
                    <input 
                      type="range" min="0" max={duration} value={position} onChange={handleSeek}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#10B981]" 
                    />
                    <div className="flex justify-between text-[10px] font-black text-slate-300 uppercase tracking-widest">
                      <span>{Math.floor(position/60000)}:{String(Math.floor((position%60000)/1000)).padStart(2,'0')}</span>
                      <span>{Math.floor(duration/60000)}:{String(Math.floor((duration%60000)/1000)).padStart(2,'0')}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10"><p className="text-slate-300 font-bold uppercase tracking-tighter">No active track</p></div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            {/* UP NEXT */}
            <section className="space-y-6">
              <div className="flex justify-between items-center px-4">
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Active Queue</h3>
                <button onClick={handleShuffle} className="bg-white border border-slate-100 hover:bg-slate-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all">
                  <ShuffleIcon sx={{ fontSize: 16 }}/> Shuffle
                </button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={activeQueue.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {activeQueue.map(req => <SortableSong key={req.id} req={req} onRemove={handleRemove} />)}
                    {activeQueue.length === 0 && <div className="p-16 text-center text-slate-200 border-2 border-dashed border-slate-100 rounded-[3rem] font-bold">Queue Empty</div>}
                  </div>
                </SortableContext>
              </DndContext>
            </section>

            {/* REQUESTS */}
            <section className="space-y-6">
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#10B981] ml-4">Guest Requests</h3>
              <div className="space-y-4">
                {pendingRequests.map(req => (
                  <div key={req.id} className="p-5 bg-white rounded-[2rem] flex items-center justify-between shadow-sm border border-transparent hover:shadow-md transition-all">
                    <div className="flex items-center gap-5">
                      <img src={req.album_art_url} className="w-14 h-14 rounded-2xl object-cover shadow-sm" alt="" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-800 text-sm">{req.title}</p>
                          {req.is_explicit && <span className="text-[8px] font-black bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">E</span>}
                        </div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{req.artist}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => axios.post(`http://localhost:8000/request/${req.id}/approve`).then(fetchQueue)} className="text-[#10B981] hover:scale-110 transition-all"><CheckCircleIcon sx={{ fontSize: 44 }} /></button>
                      <button onClick={() => handleRemove(req.id)} className="text-red-400 hover:scale-110 transition-all"><CancelIcon sx={{ fontSize: 44 }} /></button>
                    </div>
                  </div>
                ))}
                {pendingRequests.length === 0 && <div className="p-16 text-center text-slate-200 border-2 border-dashed border-slate-100 rounded-[2rem] font-bold">No New Requests</div>}
              </div>
            </section>
          </div>

          {/* SUGGESTED TRACKS */}
          <section className="space-y-6">
            <div className="flex justify-between items-center px-4">
              <div className="flex items-center gap-3">
                <AutoAwesomeIcon sx={{ fontSize: 18 }} className="text-amber-400" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Suggested Tracks</h3>
              </div>
              <button onClick={fetchSuggestions} disabled={suggestionsLoading} className="bg-white border border-slate-100 hover:bg-slate-50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all disabled:opacity-50">
                <RefreshIcon sx={{ fontSize: 16 }} className={suggestionsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {suggestions.map(track => (
                <div key={track.id} className="p-4 bg-white rounded-2xl flex items-center gap-4 shadow-sm border border-slate-50 hover:shadow-md hover:border-amber-200 transition-all group">
                  <img src={track.album_art} className="w-12 h-12 rounded-xl object-cover shadow-sm shrink-0" alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{track.name}</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">{track.artist}</p>
                  </div>
                  <button onClick={() => handleAddSuggestion(track)} className="text-slate-200 group-hover:text-[#10B981] transition-all shrink-0 hover:scale-110">
                    <AddCircleIcon sx={{ fontSize: 32 }} />
                  </button>
                </div>
              ))}
              {suggestions.length === 0 && !suggestionsLoading && (
                <div className="col-span-full p-12 text-center text-slate-200 border-2 border-dashed border-slate-100 rounded-[2rem] font-bold">
                  {queue.length === 0 ? "Add songs to the queue to get suggestions" : "No suggestions available"}
                </div>
              )}
              {suggestionsLoading && suggestions.length === 0 && (
                <div className="col-span-full p-12 text-center text-slate-300 font-bold animate-pulse">Finding tracks you might like...</div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-black text-slate-200 uppercase tracking-widest animate-pulse">Initializing vibeQ...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}