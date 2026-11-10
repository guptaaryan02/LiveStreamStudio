import { isTauriEnvironment } from '../../services/tauriEngine';
import { prepareStreamCopy, cancelStreamCopy } from '../../services/preparedMedia';
import { copyText } from '../../services/uiFeedback';
import { notify } from '../../services/uiFeedback';
import React, { useState, useEffect, useRef } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import {
  ListVideo,
  Plus,
  Trash2,
  Copy,
  Download,
  Repeat,
  Shuffle,
  MoveUp,
  MoveDown,
  FileText,
  Clock,
  Film,
  Play,
  UploadCloud,
  FileVideo,
  CheckSquare,
  Square as SquareIcon,
  X,
} from 'lucide-react';
import { generatePlaylistFileContent, generateLiveStreamShellScript, generateLiveStreamBatScript } from '../../services/ffmpegEngine';
import { VideoItem } from '../../types';
import {
  pickVideoFiles,
  resolveDroppedFiles,
  registerNativeFileDrop,
  importFromPaths,
  isStreamablePath,
  ImportResult,
} from '../../services/videoImport';

export const PlaylistManagerView: React.FC = () => {
  const {
    playlists,
    activePlaylistId,
    setActivePlaylistId,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    reorderPlaylistVideos,
    removeVideoFromPlaylist,
    addVideoToPlaylist,
    videos: libraryVideos,
    addVideo: addVideoToLibrary,
    createStreamInstance,
    startStream,
    setActiveTab,
  } = useStudioStore();

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showLibraryPickerModal, setShowLibraryPickerModal] = useState(false);
  const [selectedLibraryVideoIds, setSelectedLibraryVideoIds] = useState<string[]>([]);
  const [exportedText, setExportedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [preparing,setPreparing]=useState(false);
  const [preparationLabel,setPreparationLabel]=useState('');
  const [preparationProgress,setPreparationProgress]=useState(0);
  const cancelled=useRef(false);const preparationJob=useRef('');
  useEffect(()=>()=>{cancelled.current=true;if(preparationJob.current)void cancelStreamCopy(preparationJob.current);},[]);
  const prepare1080=async()=>{
    if(!activePlaylist?.videos.length) return;
    const source=activePlaylist;cancelled.current=false;setPreparing(true);setPreparationProgress(0);setImportError('');
    const ids:string[]=[];
    try {
      for(let index=0;index<source.videos.length;index++) {
        if(cancelled.current) break;
        setPreparationLabel(`${index+1} / ${source.videos.length}: ${source.videos[index].title}`);
        preparationJob.current=`prepare-${Date.now()}-${index}`;
        const copy=await prepareStreamCopy(source.videos[index],preparationJob.current,(percent)=>setPreparationProgress((index+percent/100)/source.videos.length*100));
        if(cancelled.current) break;
        const existing=useStudioStore.getState().videos.find((v)=>v.localPath===copy.localPath && v.streamReadyProfile?.version===1);
        if(existing)ids.push(existing.id);else{addVideoToLibrary(copy);ids.push(copy.id);}
      }
      if(!cancelled.current){const ready=createPlaylist(`${source.name} · 1080p Ready`,ids);updatePlaylist(ready.id,{repeatCount:source.repeatCount,isInfiniteLoop:source.isInfiniteLoop,shuffle:source.shuffle,order:source.order});notify('1080p streaming playlist ready. With 1080p, 30 FPS and 4500 Kbps output, it streams without live encoding.');}
    } catch(error){if(!cancelled.current)setImportError(String(error));}
    finally {preparationJob.current='';setPreparing(false);}
  };
  const cancelPreparation=()=>{cancelled.current=true;if(preparationJob.current)void cancelStreamCopy(preparationJob.current);setPreparationLabel('Cancelling preparation…');};

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || playlists[0];

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const calculateTotalDuration = () => {
    if (!activePlaylist) return '0m';
    const totalSecs = activePlaylist.videos.reduce((acc, curr) => acc + curr.duration, 0);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    return `${hours > 0 ? `${hours}h ` : ''}${mins}m`;
  };

  // Imported videos must carry a REAL disk path — FFmpeg cannot read blob: URLs.
  const applyImport = (result: ImportResult) => {
    if (!activePlaylist) return;
    setImportError(result.error || '');
    result.videos.forEach((video) => {
      addVideoToLibrary(video);
      addVideoToPlaylist(activePlaylist.id, video.id);
    });
  };

  const handleImportFiles = async () => {
    if (!activePlaylist) return;
    setImportError('');
    setImporting(true);
    try {
      applyImport(await pickVideoFiles('Custom'));
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!activePlaylist) return;

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return; // Tauri delivers drops through the native event instead

    setImporting(true);
    try {
      applyImport(await resolveDroppedFiles(files, 'Custom'));
    } finally {
      setImporting(false);
    }
  };

  // In the desktop app the OS drop is delivered by Tauri (with REAL file paths)
  // instead of the HTML drop event, so listen for it while this view is mounted.
  const activePlaylistIdRef = useRef<string | undefined>(activePlaylist?.id);
  activePlaylistIdRef.current = activePlaylist?.id;

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    registerNativeFileDrop(async (paths) => {
      const playlistId = activePlaylistIdRef.current;
      if (!playlistId) return;
      setIsDragging(false);
      setImporting(true);
      try {
        const result = await importFromPaths(paths, 'Custom');
        setImportError(result.error || '');
        result.videos.forEach((video) => {
          addVideoToLibrary(video);
          addVideoToPlaylist(playlistId, video.id);
        });
      } catch (err) {
        setImportError(String(err));
      } finally {
        setImporting(false);
      }
    }).then((fn) => {
      if (cancelled) fn?.();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addVideoToLibrary, addVideoToPlaylist]);

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName);
    setNewPlaylistName('');
    setShowCreateModal(false);
  };

  const handleExportPlaylist = () => {
    if (!activePlaylist) return;
    const content = generatePlaylistFileContent(activePlaylist);
    setExportedText(content);
    setShowExportModal(true);
  };

  const handleDuplicatePlaylist = () => {
    if (!activePlaylist) return;
    const newPl = createPlaylist(`${activePlaylist.name} (Copy)`, activePlaylist.videos.map((v) => v.id));
    updatePlaylist(newPl.id, {
      repeatCount: activePlaylist.repeatCount,
      isInfiniteLoop: activePlaylist.isInfiniteLoop,
      order: activePlaylist.order,
      shuffle: activePlaylist.shuffle,
    });
  };

  const handleAddSelectedFromLibrary = () => {
    if (!activePlaylist) return;
    selectedLibraryVideoIds.forEach((vidId) => {
      addVideoToPlaylist(activePlaylist.id, vidId);
    });
    setSelectedLibraryVideoIds([]);
    setShowLibraryPickerModal(false);
  };

  const toggleLibrarySelection = (vidId: string) => {
    if (selectedLibraryVideoIds.includes(vidId)) {
      setSelectedLibraryVideoIds(selectedLibraryVideoIds.filter((id) => id !== vidId));
    } else {
      setSelectedLibraryVideoIds([...selectedLibraryVideoIds, vidId]);
    }
  };

  const handleQuickGoLive = () => {
    if (!activePlaylist || activePlaylist.videos.length === 0) {
      notify('Please add at least one video to the playlist before going live!');
      return;
    }

    // Reuse a real stream key the user has already entered. Never invent one —
    // a placeholder key cannot connect, and the failed stream then sits there
    // retrying against the platform forever.
    const { instances, profiles } = useStudioStore.getState();
    const source =
      [...instances].reverse().find((i) => i.streamKey?.trim()) ||
      profiles.find((p) => p.streamKey?.trim());

    if (!source) {
      notify('No stream key configured yet. Set your platform and stream key on the Stream Dashboard, then go live from there.');
      setActiveTab('dashboard');
      return;
    }

    const inst = createStreamInstance(
      `Live: ${activePlaylist.name}`,
      activePlaylist.id,
      source.platform,
      source.rtmpUrl,
      source.streamKey
    );
    startStream(inst.id);
    setActiveTab('dashboard');
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20 select-none">
      {importError && (
        <div className="bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs px-4 py-2.5 rounded-xl flex items-start justify-between gap-4">
          <span>{importError}</span>
          <button onClick={() => setImportError('')} className="text-amber-400 hover:text-amber-100">
            Dismiss
          </button>
        </div>
      )}

      {preparing && <div role="dialog" aria-modal="true" aria-label="Preparing 1080p streaming copies" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-6"><div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4"><h3 className="font-bold text-studio-foreground">Preparing 1080p streaming copies</h3><p className="text-sm text-slate-300">{preparationLabel}</p><progress aria-label="Video preparation progress" max={100} value={preparationProgress} className="w-full"/><p className="text-xs text-slate-400">{preparationProgress.toFixed(0)}% · One video at a time to limit memory use. Your originals stay unchanged. Copies use additional disk space.</p><button onClick={cancelPreparation} className="rounded-lg bg-slate-800 px-4 py-2 text-slate-200">Cancel preparation</button></div></div>}
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-studio-foreground tracking-tight flex items-center space-x-2">
            <ListVideo className="w-6 h-6 text-indigo-400" />
            <span>Playlist Manager</span>
          </h2>
          <p className="text-xs text-slate-400">
            Add videos, reorder playlist sequence, and configure repeat/infinite loop rules. For several different streams on a low-memory laptop, prepare 1080p copies before scheduling.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {isTauriEnvironment() && <button disabled={preparing || !activePlaylist?.videos.length || activePlaylist.videos.every((v)=>v.streamReadyProfile?.version===1)} onClick={()=>{void prepare1080();}} className="rounded-xl border border-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-400 disabled:opacity-50">Prepare 1080p copy</button>}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>New Playlist</span>
          </button>
          <button
            onClick={handleExportPlaylist}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs px-4 py-2.5 rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            <span>Export playlist.txt</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar + Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Playlists List */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Saved Playlists</h3>
          <div className="space-y-2">
            {playlists.map((pl) => {
              const isSelected = pl.id === activePlaylist?.id;
              return (
                <div
                  key={pl.id}
                  role="button" tabIndex={0} aria-label={`Select playlist ${pl.name}`}
                  onKeyDown={(e)=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setActivePlaylistId(pl.id);}}}
                  onClick={() => setActivePlaylistId(pl.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/60 text-studio-foreground shadow-md'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-xs flex items-center space-x-2">
                      <Film className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{pl.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {pl.videos.length} Videos • {pl.isInfiniteLoop ? 'Infinite Loop' : `${pl.repeatCount}x`}
                    </div>
                  </div>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Playlist Editor */}
        {activePlaylist && (
          <div className="lg:col-span-3 space-y-6">
            {/* Playlist Header Card */}
            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <input
                  type="text"
                  value={activePlaylist.name}
                  onChange={(e) => updatePlaylist(activePlaylist.id, { name: e.target.value })}
                  className="bg-transparent text-lg font-bold text-studio-foreground border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none px-1 py-0.5"
                />
                <div className="flex items-center space-x-4 text-xs font-mono text-slate-400 mt-1 px-1">
                  <span className="flex items-center space-x-1">
                    <Film className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{activePlaylist.videos.length} Media Files</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Duration: {calculateTotalDuration()}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDuplicatePlaylist}
                  className="p-2 text-slate-300 hover:text-studio-foreground bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                  title="Duplicate Playlist"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deletePlaylist(activePlaylist.id)}
                  className="p-2 text-red-400 hover:text-white bg-slate-800 hover:bg-red-900/40 rounded-lg transition"
                  title="Delete Playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleQuickGoLive}
                  className="flex items-center space-x-2 bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Go Live With Playlist</span>
                </button>
              </div>
            </div>

            {/* Playback & Loop Settings */}
            <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-4">
              <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center space-x-2">
                <Repeat className="w-4 h-4" />
                <span>Playback & Loop Settings</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Loop Mode */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-slate-300 font-semibold block">Repeat Count</label>
                  <button
                    onClick={() => updatePlaylist(activePlaylist.id, { isInfiniteLoop: !activePlaylist.isInfiniteLoop, repeatCount: activePlaylist.isInfiniteLoop ? 1 : -1 })}
                    className={`w-full py-2 rounded-lg font-medium text-xs border transition ${
                      activePlaylist.isInfiniteLoop
                        ? 'bg-indigo-600 text-white border-indigo-400'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Infinite Loop (24/7 Stream)
                  </button>

                  {!activePlaylist.isInfiniteLoop && (
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Repeat Times:</span>
                        <span className="font-mono text-indigo-300 font-bold">{activePlaylist.repeatCount}x</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {[1, 2, 5, 10, 50, 100].map((cnt) => (
                          <button
                            key={cnt}
                            onClick={() => updatePlaylist(activePlaylist.id, { repeatCount: cnt, isInfiniteLoop: false })}
                            className={`px-2 py-1 rounded text-[10px] font-mono border ${
                              activePlaylist.repeatCount === cnt
                                ? 'bg-indigo-600 text-white border-indigo-400'
                                : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                          >
                            {cnt}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Shuffle */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-slate-300 font-semibold block">Shuffle Order</label>
                  <button
                    onClick={() => updatePlaylist(activePlaylist.id, { shuffle: !activePlaylist.shuffle })}
                    className={`w-full py-2 rounded-lg font-medium text-xs border transition flex items-center justify-center space-x-2 ${
                      activePlaylist.shuffle
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>{activePlaylist.shuffle ? 'Shuffle Enabled' : 'Normal Sequential'}</span>
                  </button>
                </div>

                {/* Play Order */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-slate-300 font-semibold block">Play Order</label>
                  <select
                    value={activePlaylist.order}
                    onChange={(e) => updatePlaylist(activePlaylist.id, { order: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="ascending">Ascending (1 → N)</option>
                    <option value="descending">Descending (N → 1)</option>
                    <option value="random">Random Order</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Video List & Direct File Dropzone */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Playlist Videos ({activePlaylist.videos.length})
                </h4>

                {/* PROMINENT ACTION BUTTONS TO ADD VIDEOS */}
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <button
                    onClick={handleImportFiles}
                    disabled={importing}
                    className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-md"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>{importing ? 'Importing…' : '+ Add Video Files'}</span>
                  </button>

                  <button
                    onClick={() => setShowLibraryPickerModal(true)}
                    className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-md"
                  >
                    <FileVideo className="w-4 h-4" />
                    <span>+ Pick from Library</span>
                  </button>
                </div>
              </div>

              {/* Drag & Drop Target Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleImportFiles}
                className={`p-6 rounded-2xl border-2 border-dashed transition cursor-pointer flex flex-col items-center justify-center text-center space-y-2 ${
                  isDragging
                    ? 'border-indigo-400 bg-indigo-950/40 text-indigo-200 scale-[1.01]'
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 text-slate-400'
                }`}
              >
                <UploadCloud className={`w-8 h-8 ${isDragging ? 'text-indigo-400 animate-bounce' : 'text-slate-600'}`} />
                <div className="text-xs font-medium text-slate-200">
                  Drag & Drop Video Files (.mp4, .mov, .mkv, .avi) directly here
                </div>
                <p className="text-[11px] text-slate-500">
                  or click to browse — files are added by their real disk path so FFmpeg can stream them
                </p>
              </div>

              {/* Videos List */}
              {activePlaylist.videos.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-800 text-center text-slate-500 text-xs">
                  No videos in this playlist yet. Click <strong>+ Add Video Files</strong> or drag files above.
                </div>
              ) : (
                <div className="space-y-2">
                  {activePlaylist.videos.map((vid, idx) => (
                    <div
                      key={`${vid.id}-${idx}`}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-6 text-center text-xs font-mono text-slate-500">{idx + 1}</span>
                        <video
                          src={vid.filePath}
                          className="w-16 h-10 rounded-lg object-cover border border-slate-800 bg-black"
                          muted
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-200 line-clamp-1">{vid.title}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {formatDuration(vid.duration)} • {vid.resolution} • {vid.category}
                          </div>
                          {!isStreamablePath(vid.localPath || vid.filePath) && (
                            <div className="text-[10px] font-mono text-red-400">
                              No disk path — FFmpeg cannot stream this. Re-add it with “+ Add Video Files”.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          disabled={idx === 0}
                          aria-label={`Move ${vid.title} up`}
                          onClick={() => reorderPlaylistVideos(activePlaylist.id, idx, idx - 1)}
                          className="p-1.5 text-slate-400 hover:text-studio-foreground disabled:opacity-30 rounded hover:bg-slate-800"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={idx === activePlaylist.videos.length - 1}
                          aria-label={`Move ${vid.title} down`}
                          onClick={() => reorderPlaylistVideos(activePlaylist.id, idx, idx + 1)}
                          className="p-1.5 text-slate-400 hover:text-studio-foreground disabled:opacity-30 rounded hover:bg-slate-800"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          aria-label={`Remove ${vid.title} from playlist`}
                          onClick={() => removeVideoFromPlaylist(activePlaylist.id, idx)}
                          className="p-1.5 text-red-400 hover:bg-red-950/40 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Library Multi-Select Picker */}
      {showLibraryPickerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-studio-foreground flex items-center space-x-2">
                <FileVideo className="w-5 h-5 text-indigo-400" />
                <span>Select Videos from Library</span>
              </h3>
              <button
                onClick={() => setShowLibraryPickerModal(false)}
                className="text-slate-400 hover:text-studio-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {libraryVideos.map((vid) => {
                const isSelected = selectedLibraryVideoIds.includes(vid.id);
                return (
                  <div
                    key={vid.id}
                    onClick={() => toggleLibrarySelection(vid.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-indigo-400" />
                      ) : (
                        <SquareIcon className="w-5 h-5 text-slate-600" />
                      )}
                      <video src={vid.filePath} className="w-14 h-9 rounded object-cover bg-black" muted />
                      <div>
                        <div className="text-xs font-semibold text-studio-foreground">{vid.title}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {formatDuration(vid.duration)} • {vid.resolution} • {vid.category}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-mono">
                {selectedLibraryVideoIds.length} video(s) selected
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowLibraryPickerModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSelectedFromLibrary}
                  disabled={selectedLibraryVideoIds.length === 0}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow-md"
                >
                  Add Selected Videos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Playlist */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-studio-foreground">Create New Video Playlist</h3>
            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Playlist Title</label>
                <input
                  type="text"
                  required
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="e.g. Evening Bhajan Stream 24/7"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-studio-foreground focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md"
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Export Playlist.txt */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-studio-foreground flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Generated FFmpeg playlist.txt</span>
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-xs text-slate-400 hover:text-studio-foreground"
              >
                Close
              </button>
            </div>

            <textarea
              readOnly
              rows={8}
              value={exportedText}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-emerald-400 focus:outline-none"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] font-mono text-slate-500">
                Ready for FFmpeg -f concat -safe 0
              </span>
              <button
                onClick={() => {
                  void copyText(exportedText, 'Copied playlist.txt to clipboard!');
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
