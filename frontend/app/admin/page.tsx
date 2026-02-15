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
  LibraryMusic as SpotifyIcon
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
        <p className="font-bold text-slate-800 text-sm">{req.title}</p>
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
  
  const searchParams = useSearchParams();
  const status = searchParams.get('status');

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const fetchQueue = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:8000/queue");
      setQueue(res.data?.queue || []);
    } catch (error) { console.error(error); }
  }, []);

  const fetchToken = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:8000/spotify/token");
      if (res.data.token) { setToken(res.data.token); return res.data.token; }
    } catch (e) { console.log("Not logged in"); }
    return null;
  }, []);

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
          getOAuthToken: (cb: any) => { cb(currentToken); },
          volume: 0.5
        });

        p.addListener('ready', ({ device_id }: any) => { setDeviceId(device_id); });
        
        p.addListener('player_state_changed', (state: any) => {
          if (!state) return;
          setIsPaused(state.paused);
          setPosition(state.position);
          setDuration(state.duration);
          
          if (state.paused && state.position === 0 && state.track_window.next_tracks.length === 0) {
            const current = queue.find(r => r.status === 'APPROVED');
            if (current) handleSkip(current.id);
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

  // Sync logic
  useEffect(() => {
    const nowPlayingTrack = queue.find(r => r.status === 'APPROVED');
    if (nowPlayingTrack && token && deviceId) {
      player?.getCurrentState().then((state: any) => {
        if (!state || state.track_window.current_track.id !== nowPlayingTrack.spotify_track_id) {
          fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${nowPlayingTrack.spotify_track_id}`] }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          });
        }
      });
    } else if (!nowPlayingTrack && player) {
      // No more tracks in queue — pause playback
      player.pause();
      setIsPaused(true);
      setPosition(0);
      setDuration(0);
    }
  }, [queue, deviceId, token, player]);

  const handleSkip = async (id: number) => {
    await axios.post(`http://localhost:8000/request/${id}/played`);
    fetchQueue();
  };

  const handleRemove = async (id: number) => {
    await axios.post(`http://localhost:8000/request/${id}/remove`);
    fetchQueue();
  };

  const handleShuffle = async () => {
    await axios.post(`http://localhost:8000/queue/shuffle`);
    fetchQueue();
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
          <h1 className="text-4xl font-black text-white tracking-tighter">vibeQ Admin</h1>
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
          <h1 className="text-3xl font-black tracking-tighter">vibeQ</h1>
        </div>
        <nav className="px-6 space-y-2">
          <a href="/" target="_blank" className="flex items-center gap-4 p-4 text-gray-400 hover:text-white transition-all"><SearchIcon /><span>Guest View</span></a>
        </nav>
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
                      <div><p className="font-bold text-slate-800 text-sm">{req.title}</p><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{req.artist}</p></div>
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