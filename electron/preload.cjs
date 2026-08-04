const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectVideoFiles: () => ipcRenderer.invoke('select-video-files'),
  startStream: (payload) => ipcRenderer.invoke('start-ffmpeg-stream', payload),
  stopStream: (streamId) => ipcRenderer.invoke('stop-ffmpeg-stream', streamId),
  onFFmpegLog: (callback) => {
    ipcRenderer.on('ffmpeg-log', (_event, data) => callback(data));
  },
  onFFmpegStatus: (callback) => {
    ipcRenderer.on('ffmpeg-status', (_event, data) => callback(data));
  },
});
