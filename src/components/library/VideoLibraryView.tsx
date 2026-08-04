import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { pickVideoFiles, isStreamablePath, previewUrlForPath } from '../../services/videoImport';
import {
  FileVideo,
  Plus,
  Search,
  Trash2,
  Film,
  Clock,
  HardDrive,
  Play,
  ListPlus,
  CheckCircle,
  Folder,
  UploadCloud,
  FileText,
} from 'lucide-react';
import { VideoCategory, VideoItem } from '../../types';

export const VideoLibraryView: React.FC = () => {
  const { videos, addVideo, removeVideo, playlists, addVideoToPlaylist, setActiveTab, activePlaylistId } = useStudioStore();
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<VideoCategory>('Krishna');
  const [newPath, setNewPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const categories: (VideoCategory | 'All')[] = [
    'All',
    'Krishna',
    'Shiv',
    'Hanuman',
    'Ram',
    'Meditation',
    'Bhajan',
    'Podcast',
  ];

  const filteredVideos = videos.filter((v) => {
    const matchesCategory = selectedCategory === 'All' || v.category === selectedCategory;
    const matchesQuery = v.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  // Import via native OS picker — always yields a REAL disk path for FFmpeg.
  const handleImportFiles = async () => {
    setImportError('');
    setImporting(true);
    try {
      const category = selectedCategory === 'All' ? 'Custom' : selectedCategory;
      const result = await pickVideoFiles(category);
      if (result.error) setImportError(result.error);
      result.videos.forEach((v) => addVideo(v));
    } catch (err) {
      setImportError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleAddVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const trimmedPath = newPath.trim();
    if (!trimmedPath) {
      setImportError('Enter the absolute disk path of the video file (e.g. /Users/you/Movies/clip.mp4).');
      return;
    }
    if (!isStreamablePath(trimmedPath)) {
      setImportError('That path cannot be streamed. FFmpeg needs a real file path, not a browser blob URL.');
      return;
    }

    const isRemote = /^https?:\/\//i.test(trimmedPath);
    const newVideo: VideoItem = {
      id: `vid-${Date.now()}`,
      title: newTitle,
      category: newCategory,
      duration: 0,
      resolution: 'Unknown',
      sizeMb: 0,
      thumbnail: 'https://images.unsplash.com/photo-1609102026400-3d026938a161?w=600&auto=format&fit=crop&q=80',
      filePath: isRemote ? trimmedPath : previewUrlForPath(trimmedPath),
      localPath: trimmedPath,
      fps: 30,
    };

    addVideo(newVideo);
    setShowAddModal(false);
    setNewTitle('');
    setNewPath('');
    setImportError('');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
            <FileVideo className="w-6 h-6 text-indigo-400" />
            <span>Video Library & Folders</span>
          </h2>
          <p className="text-xs text-slate-400">
            Import real video files (.mp4, .mov, .mkv, .avi) from your computer for instant streaming.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Native OS File Selector Button */}
          <button
            onClick={handleImportFiles}
            disabled={importing}
            className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{importing ? 'Importing…' : 'Select Local Video Files'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs px-3.5 py-2.5 rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Path</span>
          </button>
        </div>
      </div>

      {importError && (
        <div className="bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs px-4 py-2.5 rounded-xl flex items-start justify-between gap-4">
          <span>{importError}</span>
          <button onClick={() => setImportError('')} className="text-amber-400 hover:text-amber-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Folder Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 max-w-2xl">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center space-x-1.5 border ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>{cat}</span>
              <span className="text-[10px] opacity-70 font-mono">
                ({cat === 'All' ? videos.length : videos.filter((v) => v.category === cat).length})
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Videos Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredVideos.map((video) => (
          <div
            key={video.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden group hover:border-slate-700 transition space-y-3 flex flex-col justify-between"
          >
            <div>
              <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                <video
                  src={video.filePath}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  muted
                  onMouseOver={(e) => e.currentTarget.play()}
                  onMouseOut={(e) => {
                    e.currentTarget.pause();
                    e.currentTarget.currentTime = 0;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60 pointer-events-none" />

                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-mono text-white pointer-events-none">
                  <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                    {formatDuration(video.duration)}
                  </span>
                  <span className="bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                    {video.resolution}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-1">
                <div className="text-[10px] uppercase font-mono font-semibold text-indigo-400 tracking-wider">
                  {video.category} Folder
                </div>
                <h3 className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug">
                  {video.title}
                </h3>
                <p
                  className={`text-[10px] font-mono truncate ${
                    isStreamablePath(video.localPath || video.filePath) ? 'text-slate-500' : 'text-red-400'
                  }`}
                  title={video.localPath || video.filePath}
                >
                  {isStreamablePath(video.localPath || video.filePath)
                    ? video.localPath || video.filePath
                    : 'No disk path — cannot be streamed'}
                </p>
              </div>
            </div>

            <div className="p-4 pt-0 flex items-center justify-between border-t border-slate-800/60 mt-2">
              <span className="text-[10px] font-mono text-slate-400">{video.sizeMb} MB</span>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (activePlaylistId) {
                      addVideoToPlaylist(activePlaylistId, video.id);
                      alert(`Added "${video.title}" to active playlist!`);
                    } else {
                      setActiveTab('playlist');
                    }
                  }}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg text-[11px] font-medium border border-indigo-500/30 transition"
                  title="Add to Active Playlist"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  <span>Add to Playlist</span>
                </button>

                <button
                  onClick={() => removeVideo(video.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Import Custom Video Path */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">Add Video by Disk Path</h3>
            <form onSubmit={handleAddVideoSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Video Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. My Channel Intro 1080p"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Folder Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as VideoCategory)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  {categories.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Exact Local Path / URL</label>
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="/Users/kesharwanidurgesh/Movies/stream.mp4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                >
                  Add Video
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
