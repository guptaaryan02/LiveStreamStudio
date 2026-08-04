const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
const activeFFmpegProcesses = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'LiveStream Studio PRO',
    backgroundColor: '#020617',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
  
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC 1: Native OS File Dialog (Returns REAL absolute paths!)
ipcMain.handle('select-video-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Video Files for Playlist',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'ts', 'webm', 'flv', 'm4v', 'wmv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return [];

  return result.filePaths.map((filePath) => {
    const filename = path.basename(filePath);
    const stat = fs.statSync(filePath);
    return {
      id: `vid-file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: filename.replace(/\.[^/.]+$/, ''),
      filePath: filePath, // REAL Absolute OS path!
      durationSeconds: 300,
      sizeMb: Math.round(stat.size / (1024 * 1024)),
      resolution: '1080p',
      category: 'Custom',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      fps: 60
    };
  });
});

// IPC 2: Start Native Hardware-Accelerated FFmpeg Process
ipcMain.handle('start-ffmpeg-stream', async (event, payload) => {
  const { streamId, playlistContent, rtmpUrl, streamKey, hardwareAcc, bitrateKbps } = payload;
  const fullRtmpTarget = `${rtmpUrl}/${streamKey}`;

  const userDataPath = app.getPath('userData');
  const playlistPath = path.join(userDataPath, `playlist_${streamId}.txt`);
  fs.writeFileSync(playlistPath, playlistContent || '# Empty playlist\n', 'utf-8');

  let videoCodec = 'libx264';
  if (hardwareAcc === 'VideoToolbox') videoCodec = 'h264_videotoolbox';
  else if (hardwareAcc === 'NVENC') videoCodec = 'h264_nvenc';
  else if (hardwareAcc === 'QuickSync') videoCodec = 'h264_qsv';

  const targetBitrate = bitrateKbps || 4500;

  const ffmpegArgs = [
    '-re',
    '-f', 'concat',
    '-safe', '0',
    '-i', playlistPath,
    '-c:v', videoCodec,
    '-preset', 'veryfast',
    '-b:v', `${targetBitrate}k`,
    '-maxrate', `${targetBitrate + 500}k`,
    '-bufsize', `${targetBitrate * 2}k`,
    '-g', '60',
    '-keyint_min', '60',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    fullRtmpTarget
  ];

  const ffmpegBin = '/opt/homebrew/bin/ffmpeg';

  const child = spawn(ffmpegBin, ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  activeFFmpegProcesses.set(streamId, child);

  child.stdout?.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('ffmpeg-log', { streamId, type: 'stdout', message: data.toString() });
    }
  });

  child.stderr?.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('ffmpeg-log', { streamId, type: 'stderr', message: data.toString() });
    }
  });

  child.on('close', (code) => {
    activeFFmpegProcesses.delete(streamId);
    if (mainWindow) {
      mainWindow.webContents.send('ffmpeg-status', { streamId, status: 'stopped', code });
    }
  });

  return { success: true, pid: child.pid };
});

// IPC 3: Stop Native FFmpeg Stream
ipcMain.handle('stop-ffmpeg-stream', async (event, streamId) => {
  const child = activeFFmpegProcesses.get(streamId);
  if (child) {
    child.kill('SIGTERM');
    activeFFmpegProcesses.delete(streamId);
  }
  return { success: true };
});
