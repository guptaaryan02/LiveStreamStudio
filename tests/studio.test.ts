import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { analyzePlaylistCompatibility, generateFFmpegArgs, generateSafeFFmpegCommand, generatePlaylistFileContent, getPlayableClipPaths, buildPlayoutConfig, maskStreamKey, resolveLocalPath, usePassthrough, playlistForInstance } from '../src/services/ffmpegEngine';
import { useStudioStore as store } from '../src/store/useStudioStore';
const video = (id = 'a', metadata = {}) => ({ id, title: id, category: 'Custom', duration: 2, resolution: '320x240', sizeMb: 1, thumbnail: '', filePath: `/tmp/${id}.mp4`, localPath: `/tmp/${id}.mp4`, fps: 30, metadata: { video_codec: 'h264', audio_codec: 'aac', resolution: '320x240', fps: 30, pixel_format: 'yuv420p', audio_channels: 2, sample_rate: 44100, bitrate_kbps: 500, stream_layout: 'v0,a1', ...metadata } });
const playlist = (videos = [video(), video('b')]) => ({ id: 'p', name: 'Test', videos, repeatCount: 2, isInfiniteLoop: false, shuffle: false, order: 'ascending', createdAt: '', updatedAt: '' } as any);
beforeEach(() => { store.setState({ videos: [], playlists: [], instances: [], profiles: [], schedules: [], logs: [], diagnosticLogs:[], activePlaylistId: null }); });
test('identical H264/AAC clips use remux', () => assert.equal(analyzePlaylistCompatibility(playlist()).isCompatible, true));
for (const metadata of [{stream_layout:'a0,v1'}, {resolution:'640x360'}, {audio_codec:'opus'}, {fps:60}, {stream_layout:undefined}]) {
  test(`mixed metadata forces normalization: ${JSON.stringify(metadata)}`, () => assert.equal(analyzePlaylistCompatibility(playlist([video(), video('b', metadata)])).isCompatible, false));
}
test('empty playlist fails compatibility', () => assert.equal(analyzePlaylistCompatibility(playlist([])).isCompatible, false));
test('finite playlist repeat count and RTMP output', () => { const args = generateFFmpegArgs(playlist(), 'youtube', 'rtmp://127.0.0.1/live', 'test'); assert.equal(args[args.indexOf('-stream_loop')+1], '1'); assert.equal(args.at(-1), 'rtmp://127.0.0.1/live/test'); assert.ok(args.includes('libx264')); assert.ok(args.includes('nal-hrd=cbr:force-cfr=1')); });
test('infinite playlist loops forever', () => { const p=playlist(); p.isInfiniteLoop=true; assert.equal(generateFFmpegArgs(p, 'youtube','rtmp://host/live','secret')[1], '-1'); });
test('stream keys are removed from commands and logs', () => { assert.ok(!generateSafeFFmpegCommand(playlist(),'youtube','rtmp://host/live','secret-key').includes('secret-key')); assert.ok(!maskStreamKey('output rtmps://host/live/secret-key').includes('secret-key')); });
test('real paths survive asset URL encoding', () => assert.equal(resolveLocalPath('asset://localhost/%2Ftmp%2Ftest%20clip.mp4'), '/tmp/test clip.mp4'));
test('blob entries never reach FFmpeg', () => { const v=video(); v.localPath=''; v.filePath='blob:invalid'; assert.deepEqual(getPlayableClipPaths(playlist([v])), []); assert.match(generatePlaylistFileContent(playlist([v])), /^# NO_LOCAL_FILES/); });
test('playout output honors requested fps, resolution, repeat and custom binary', () => { const c=buildPlayoutConfig(playlist(),'rtmp://host/live','key','Software',1000,{outputResolution:'720p',outputFps:'60',useCustomFfmpeg:true,ffmpegPath:'/custom/ffmpeg'} as any); assert.equal(c.width,1280); assert.equal(c.fps,60); assert.equal(c.repeatCount,2); assert.equal(c.ffmpegPath,'/custom/ffmpeg'); });
test('library rejects blobs and accepts local media', () => { store.getState().addVideo({...video(),localPath:'',filePath:'blob:bad'} as any); assert.equal(store.getState().videos.length,0); store.getState().addVideo(video() as any); assert.equal(store.getState().videos.length,1); });
test('playlist creation, add, reorder and remove', () => { const s=store.getState(); s.addVideo(video() as any); s.addVideo(video('b') as any); const p=s.createPlaylist('test',['a']); s.addVideoToPlaylist(p.id,'b'); s.reorderPlaylistVideos(p.id,0,1); assert.equal(store.getState().playlists[0].videos[0].id,'b'); s.removeVideoFromPlaylist(p.id,0); assert.equal(store.getState().playlists[0].videos.length,1); });
test('deleting active playlist selects a surviving playlist', () => { store.setState({playlists:[playlist(),{...playlist(),id:'other'}],activePlaylistId:'p'}); store.getState().deletePlaylist('p'); assert.equal(store.getState().activePlaylistId,'other'); });
test('missing stream key blocks launch', async () => { const s=store.getState(); const i=s.createStreamInstance('test','p','youtube','rtmp://host/live','','Software'); await s.startStream(i.id); assert.equal(store.getState().instances[0].status,'error'); assert.match(store.getState().debugStatus,/Stream key is required/); });
test('missing playlist blocks launch', async () => { const s=store.getState(); const i=s.createStreamInstance('test','p','youtube','rtmp://host/live','key','Software'); await s.startStream(i.id); assert.equal(store.getState().instances[0].status,'error'); });
test('schedule IDs remain unique in same millisecond', () => { const s=store.getState(); const item={title:'test',profileId:'p',profileName:'test',scheduledTime:'12:00 PM',repeatDays:['Mon'],autoStart:true,autoStop:false,isActive:true}; for(let n=0;n<10;n++) s.addSchedule(item); assert.equal(new Set(store.getState().schedules.map(x=>x.id)).size,10); });
test('profile saving and deletion', () => { const s=store.getState(); const p=s.saveProfile({name:'test',playlistId:'p',platform:'youtube',rtmpUrl:'rtmp://host/live',streamKey:'key',repeatCount:2,isInfiniteLoop:false,hardwareAcc:'Software',targetBitrateKbps:900,resolution:'720p',fps:60}); assert.equal(store.getState().profiles.length,1); s.deleteProfile(p.id); assert.equal(store.getState().profiles.length,0); });

const credentialProfile = () => ({name:'Credential QA',playlistId:'p',platform:'custom' as const,rtmpUrl:'rtmp://localhost/live',streamKey:'fake-test-key',repeatCount:1,isInfiniteLoop:false,hardwareAcc:'Software' as const,targetBitrateKbps:4500,resolution:'1080p',fps:30});
async function withNativeCredentials(run:(calls:{command:string;args:any}[])=>Promise<void>, reply:(command:string)=>unknown=()=>undefined) {
  const previous=(globalThis as any).window;const calls:{command:string;args:any}[]=[];
  (globalThis as any).window={navigator:{userAgent:'Tauri'},__TAURI_INTERNALS__:{invoke:async(command:string,args:any)=>{calls.push({command,args});return reply(command);}}};
  try {await run(calls);} finally {if(previous===undefined)delete (globalThis as any).window;else (globalThis as any).window=previous;}
}

test('saving a profile is session-only and never accesses Keychain implicitly', async()=>{
  await withNativeCredentials(async(calls)=>{
    const p=store.getState().saveProfile({...credentialProfile(),keyStorage:'keychain'});
    assert.equal(p.keyStorage,'session');assert.equal(calls.length,0);
    assert.equal(await store.getState().loadProfileKey(p.id),false);
    assert.equal(calls.length,0);
    const {profilesWithoutKeys}=await import('../src/services/profileCredentials');
    const saved=profilesWithoutKeys(store.getState().profiles);
    assert.equal(saved[0].streamKey,'');assert.equal(saved[0].keyStorage,'session');
    assert.ok(!JSON.stringify(saved).includes('fake-test-key'));
  });
});

test('explicit remember, load and remove target only the chosen saved key', async()=>{
  await withNativeCredentials(async(calls)=>{
    const s=store.getState();const p=s.saveProfile(credentialProfile());
    assert.equal(await s.rememberProfileKey(p.id),true);
    assert.equal(store.getState().profiles[0].keyStorage,'keychain');
    s.setProfileSessionKey(p.id,'');
    assert.equal(await s.loadProfileKey(p.id),true);
    assert.equal(store.getState().profiles[0].streamKey,'restored-test-key');
    assert.equal(await s.removeSavedProfileKey(p.id),true);
    assert.equal(store.getState().profiles[0].keyStorage,'session');
    assert.equal(store.getState().profiles[0].streamKey,'restored-test-key');
    assert.deepEqual(calls.map(c=>c.command),['save_profile_stream_key','get_profile_stream_key','delete_profile_stream_key']);
    assert.ok(calls.every(c=>c.args.profileId===p.id));
  },command=>command==='get_profile_stream_key' ? 'restored-test-key' : undefined);
});

test('cancelled Keychain save preserves a usable session key and never claims storage', async()=>{
  await withNativeCredentials(async()=>{
    const s=store.getState();const p=s.saveProfile(credentialProfile());
    assert.equal(await s.rememberProfileKey(p.id),false);
    assert.equal(store.getState().profiles[0].keyStorage,'session');
    assert.equal(store.getState().profiles[0].streamKey,'fake-test-key');
  },()=>{throw new Error('Access cancelled');});
});

test('legacy keys load only explicitly; cancelled removal retains saved-copy status', async()=>{
  await withNativeCredentials(async(calls)=>{
    const s=store.getState();const p=s.saveProfile(credentialProfile());
    store.setState({profiles:[{...p,keyStorage:undefined,streamKey:''}]});
    assert.equal(await s.launchProfile(p.id),false);assert.equal(calls.length,0);
    assert.equal(await s.loadProfileKey(p.id),true);
    assert.equal(await s.removeSavedProfileKey(p.id),false);
    assert.equal(store.getState().profiles[0].keyStorage,'keychain');
  },command=>{if(command==='delete_profile_stream_key')throw new Error('Access cancelled');return 'legacy-test-key';});
});

test('unattended due schedule waits for a prepared key without Keychain access or consuming its run', async()=>{
  await withNativeCredentials(async(calls)=>{
    const s=store.getState();const p=s.saveProfile(credentialProfile());
    store.setState({profiles:[{...p,keyStorage:'keychain',streamKey:''}]});
    s.addSchedule({title:'waiting for key',profileId:p.id,profileName:p.name,scheduledAt:new Date(Date.now()-1000).toISOString(),scheduledTime:'',repeatDays:[],autoStart:true,autoStop:false,isActive:true});
    s.checkSchedules();s.checkSchedules();await new Promise(r=>setTimeout(r,5));
    assert.equal(calls.length,0);assert.equal(store.getState().schedules[0].lastRunDate,undefined);
    assert.equal(store.getState().schedules[0].isActive,true);assert.equal(store.getState().logs.length,1);
    const originalStart=s.startStream;const launches:string[]=[];
    store.setState({startStream:(id)=>{launches.push(id);}});
    try {
      s.setProfileSessionKey(p.id,'prepared-session-key');s.checkSchedules();s.checkSchedules();
      await new Promise(r=>setTimeout(r,5));
      assert.equal(launches.length,1);assert.equal(calls.length,0);
      assert.equal(store.getState().schedules[0].isActive,false);
    } finally {store.setState({startStream:originalStart});}
  });
});
test('logs redact RTMP keys and cap history', () => { for(let n=0;n<510;n++) store.getState().addLog({id:String(n),streamId:'x',streamName:'test',timestamp:'',level:'INFO',message:'rtmp://host/live/secret'}); assert.equal(store.getState().logs.length,500); assert.ok(!store.getState().logs[0].message.includes('secret')); });
test('settings updates preserve other preferences', () => { const settings=store.getState().settings; store.getState().updateSettings({defaultBitrateKbps:2000}); assert.equal(store.getState().settings.defaultBitrateKbps,2000); assert.equal(store.getState().settings.autoRecoveryEnabled,settings.autoRecoveryEnabled); });
test('deleting running instance stops its backend process', async () => {
  const originalFetch=globalThis.fetch; const calls: string[]=[];
  globalThis.fetch=(async (url:any) => { calls.push(String(url)); return new Response('{}'); }) as any;
  try { const i=store.getState().createStreamInstance('test','p','custom','rtmp://host/live','key','Software'); store.setState({instances:[{...i,status:'live'}]}); await store.getState().deleteStreamInstance(i.id); assert.deepEqual(calls,['/api/ffmpeg/stop']); assert.equal(store.getState().instances.length,0); } finally { globalThis.fetch=originalFetch; }
});
test('scheduled auto-stop stops expired streams', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async () => new Response('{}')) as any;
  try { const i=store.getState().createStreamInstance('timer','p','custom','rtmp://host/live','key','Software'); store.setState({instances:[{...i,status:'live',scheduledStopTime:new Date(Date.now()-1000).toISOString()}]}); await store.getState().tickTelemetry(); assert.equal(store.getState().instances[0].status,'idle'); } finally { globalThis.fetch=originalFetch; }
});
test('profile launch passes configured bitrate and fps', async () => {
  const s=store.getState(); const p=s.saveProfile({name:'test',playlistId:'p',platform:'youtube',rtmpUrl:'rtmp://host/live',streamKey:'key',repeatCount:2,isInfiniteLoop:false,hardwareAcc:'Software',targetBitrateKbps:900,resolution:'720p',fps:60}); await s.launchProfile(p.id); const i=store.getState().instances[0]; assert.equal(i.fps,60); assert.equal(i.targetBitrate,900);
});
for (const loopCount of [2,3,10]) test(`real RTMP broadcast finishes both clips after ${loopCount} complete loops`, async () => {
  const { spawn, spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { createServer } = await import('node:net');
  const dir=mkdtempSync(join(tmpdir(),'studio-rtmp-'));
  const ffmpeg=resolve('src-tauri/resources/ffmpeg/ffmpeg');
  const ffprobe=resolve('src-tauri/resources/ffmpeg/ffprobe');
  let receiver:any, sender:any;
  const completed=(child:any) => new Promise<number|null>((resolve,reject) => { child.once('error',reject); child.once('close',resolve); });
  try {
    const videos=[];
    for(const name of ['red','blue']) {
      const path=join(dir,`${name}.mp4`);
      const gen=spawnSync(ffmpeg,['-v','error','-y','-f','lavfi','-i',`color=c=${name}:s=320x240:r=30`,'-f','lavfi','-i','sine=sample_rate=44100','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2',path]);
      assert.equal(gen.status,0,String(gen.stderr)); videos.push({...video(name),localPath:path,filePath:path});
    }
    const server=createServer(); await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    const port=(server.address() as any).port; await new Promise<void>(r=>server.close(()=>r()));
    const target=`rtmp://127.0.0.1:${port}/live`;
    const output=join(dir,'received.flv');
    receiver=spawn(ffmpeg,['-v','error','-y','-listen','1','-i',`${target}/test`,'-c','copy','-f','flv',output],{stdio:'ignore'});
    const received=completed(receiver);
    await new Promise(r=>setTimeout(r,300));
    const original=playlist(videos); original.isInfiniteLoop=true;
    const p=playlistForInstance(original,{playbackLoopLimit:loopCount}); writeFileSync(join(dir,'playlist.txt'),generatePlaylistFileContent(p));
    sender=spawn(ffmpeg,['-hide_banner',...generateFFmpegArgs(p,'custom',target,'test','Software',1000,{outputResolution:'720p',outputFps:'30',useSourceBitrate:loopCount===10} as any)],{cwd:dir,stdio:'ignore'});
    const timeout=setTimeout(()=>{sender.kill('SIGKILL');receiver.kill('SIGKILL');},30000);
    try { assert.equal(await completed(sender),0); await received; } finally { clearTimeout(timeout); }
    const probe=spawnSync(ffprobe,['-v','error','-count_frames','-show_streams','-of','json',output]);
    assert.equal(probe.status,0,String(probe.stderr));
    const streams=JSON.parse(String(probe.stdout)).streams;
    const frames=Number(streams.find((x:any)=>x.codec_type==='video').nb_read_frames);
    // CFR encoding can pad a clip to its slightly longer AAC container end.
    // Direct copy must preserve the exact source video packet count.
    const expected=loopCount*60;
    assert.ok(frames>=expected-2 && frames<=expected+(loopCount===10 ? 0 : loopCount*2),`Expected ${expected} source frames with bounded CFR padding, received ${frames}`);
    assert.equal(streams.find((x:any)=>x.codec_type==='audio').codec_name,'aac');
  } finally { sender?.kill();receiver?.kill();rmSync(dir,{recursive:true,force:true}); }
});
test('daily schedules launch once and preserve profile output settings', async () => {
  const originalStart=store.getState().startStream; const launches:string[]=[];
  store.setState({startStream:(id)=>{launches.push(id);}});
  try {
    const s=store.getState(); const p=s.saveProfile({name:'timer',playlistId:'p',platform:'custom',rtmpUrl:'rtmp://host/live',streamKey:'key',repeatCount:1,isInfiniteLoop:false,hardwareAcc:'Software',targetBitrateKbps:1200,resolution:'720p',fps:60});
    const now=new Date(); const time=`${String(now.getHours()%12||12).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} ${now.getHours()>=12?'PM':'AM'}`;
    s.addSchedule({title:'daily test',profileId:p.id,profileName:p.name,scheduledTime:time,repeatDays:['Daily'],autoStart:true,autoStop:true,stopAfterMinutes:1,isActive:true});
    s.checkSchedules(); s.checkSchedules();
    assert.equal(launches.length,1); assert.equal(store.getState().instances[0].targetBitrate,1200); assert.equal(store.getState().instances[0].fps,60); assert.ok(store.getState().instances[0].scheduledStopTime);
  } finally { store.setState({startStream:originalStart}); }
});
test('early stream failures do not trigger runaway recovery', () => {
  const s=store.getState(); const i=s.createStreamInstance('fail','p','custom','rtmp://host/live','key','Software'); store.setState({instances:[{...i,status:'live',startTime:new Date(Date.now()-100).toISOString()}]}); s.handleStreamExit(i.id); s.handleStreamExit(i.id); assert.equal(store.getState().instances[0].status,'error'); assert.equal(store.getState().logs.length,1);
});
test('disabled recovery leaves disconnected stream in error', () => {
  const s=store.getState(); const settings=s.settings; const i=s.createStreamInstance('fail','p','custom','rtmp://host/live','key','Software'); store.setState({settings:{...settings,autoRecoveryEnabled:false},instances:[{...i,status:'live',startTime:new Date(Date.now()-60000).toISOString()}]}); s.handleStreamExit(i.id); assert.equal(store.getState().instances[0].status,'error'); store.setState({settings});
});

test('a quick failed reconnect of a working stream uses the remaining recovery budget', (context)=>{
  context.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  const s=store.getState();const originalStart=s.startStream;const originalSettings=s.settings;let attempts=0;
  const a=s.createStreamInstance('recover A','p','custom','rtmp://host/live','test-a','Software');
  const b=s.createStreamInstance('healthy B','p','custom','rtmp://host/live','test-b','Software');
  store.setState({settings:{...originalSettings,autoRecoveryEnabled:true,retryIntervalSeconds:3},instances:[{...a,status:'live',analyticsStarted:true,startTime:new Date(Date.now()-20*60000).toISOString()},{...b,status:'live',analyticsStarted:true}],startStream:async(id)=>{
    attempts++;store.setState(state=>({instances:state.instances.map(i=>i.id===id ? {...i,status:'connecting',startTime:new Date().toISOString()} : i)}));
  }});
  try {
    s.handleStreamExit(a.id);assert.equal(store.getState().instances[0].retryCount,1);
    context.mock.timers.tick(3000);assert.equal(attempts,1);
    context.mock.timers.tick(100);s.handleStreamExit(a.id);s.handleStreamExit(a.id);
    assert.equal(store.getState().instances[0].status,'reconnecting');
    assert.equal(store.getState().instances[0].retryCount,2);
    context.mock.timers.tick(6000);assert.equal(attempts,2);
    s.updateInstanceMetrics(a.id,{fps:30,bitrateKbps:4500});
    assert.equal(store.getState().instances[0].status,'live');
    assert.equal(store.getState().instances[1].status,'live');
  } finally {store.setState({startStream:originalStart,settings:originalSettings});}
});

test('recovery still respects the configured retry limit and preserves the stop reason', (context)=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const s=store.getState();const originalSettings=s.settings;
  const a=s.createStreamInstance('exhausted','p','custom','rtmp://host/live','test','Software');
  store.setState({settings:{...originalSettings,autoRecoveryEnabled:true},instances:[{...a,status:'connecting',analyticsStarted:true,startTime:new Date(Date.now()-100).toISOString(),retryCount:5,maxRetries:5}]});
  try {
    s.handleStreamExit(a.id);
    assert.equal(store.getState().instances[0].status,'error');
    assert.equal(store.getState().instances[0].retryCount,5);
    assert.match(store.getState().instances[0].lastStopReason || '',/5 recovery/);
  } finally {store.setState({settings:originalSettings});}
});

test('successful finite EOF records completion while unexpected infinite EOF recovers', (context)=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const s=store.getState();const settings=s.settings;const source=playlist();source.isInfiniteLoop=true;
  const finite=s.createStreamInstance('finite','p','custom','rtmp://host/live','test1','Software');
  const infinite=s.createStreamInstance('infinite','p','custom','rtmp://host/live','test2','Software');
  store.setState({settings:{...settings,autoRecoveryEnabled:true},playlists:[source],instances:[{...finite,status:'live',playbackLoopLimit:3,analyticsStarted:true},{...infinite,status:'live',analyticsStarted:true}]});
  try {
    s.handleStreamExit(finite.id,true);s.handleStreamExit(finite.id,true);
    assert.equal(store.getState().instances[0].status,'idle');
    assert.match(store.getState().instances[0].lastStopReason || '',/Completed 3/);
    s.handleStreamExit(infinite.id,true);
    assert.equal(store.getState().instances[1].status,'reconnecting');
    assert.match(store.getState().instances[1].lastFailure || '',/infinite/);
  } finally {store.setState({settings});}
});

test('failures survive another stream’s progress flood, remain redacted and restore safely', async()=>{
  const {retainDiagnostics,mergeLogHistory}=await import('../src/services/diagnostics');
  const s=store.getState();const a=s.createStreamInstance('failed','p','custom','rtmp://host/live','sensitive-test-value','Software');
  s.addLog({id:'failure',streamId:a.id,streamName:a.name,timestamp:'',level:'ERROR',message:'Broken pipe rtmp://host/live/sensitive-test-value credential sensitive-test-value'});
  for(let n=0;n<2200;n++)s.addLog({id:`progress-${n}`,streamId:'healthy',streamName:'healthy',timestamp:'',level:'INFO',message:`frame=${n} fps=30 bitrate=4500kbits/s`});
  for(let n=0;n<300;n++)s.addLog({id:`clip-${n}`,streamId:'healthy',streamName:'healthy',timestamp:'',level:'INFO',message:'Source hardware decoding enabled'});
  assert.equal(store.getState().logs.length,500);
  const retained=store.getState().diagnosticLogs;
  assert.ok(retained.some(l=>l.id==='failure'));
  assert.ok(retained.length<=400);assert.ok(!JSON.stringify(retained).includes('sensitive-test-value'));
  const restored=retainDiagnostics([],JSON.parse(JSON.stringify(retained)));
  assert.ok(mergeLogHistory([],restored).some(l=>l.id==='failure'));
  assert.ok(Number.isFinite(Date.parse(restored[0].timestamp)));
  s.clearLogs();assert.ok(store.getState().diagnosticLogs.some(l=>l.id==='failure'));
});

test('sender failure and network lines are classified as errors without requiring the word error',async()=>{
  const {classifyFFmpegLine}=await import('../src/services/diagnostics');
  for(const line of ['Broken pipe','Connection reset by peer','Operation timed out','Sender exited: success=false; exit code=1; signal=none','Destination upload fell behind shared output'])assert.equal(classifyFFmpegLine(line),'ERROR');
  assert.equal(classifyFFmpegLine('frame=120 fps=30 bitrate=4500kbits/s'),'INFO');
  assert.equal(classifyFFmpegLine('Sender exited: success=true; exit code=0; signal=none'),'INFO');
});

test('stable encoding is the default and source passthrough is explicit', () => {
  assert.equal(usePassthrough(playlist()), false);
  assert.equal(usePassthrough(playlist(), {useSourceBitrate:true} as any), true);
  assert.equal(usePassthrough(playlist([video(),video('b',{resolution:'640x360'})]), {useSourceBitrate:true} as any), false);
});
test('source passthrough keeps the original stream only when opted in', () => {
  const args=generateFFmpegArgs(playlist(),'youtube','rtmp://host/live','key','Software',4500,{useSourceBitrate:true} as any);
  assert.ok(args.includes('copy'));
});
test('starting one destination does not block another destination', async () => {
  const originalFetch=globalThis.fetch; const calls:any[]=[];
  globalThis.fetch=(async (_url:any, options:any) => { calls.push(JSON.parse(options.body)); return new Response('{}'); }) as any;
  try {
    const s=store.getState(); store.setState({playlists:[playlist()]});
    const a=s.createStreamInstance('A','p','custom','rtmp://127.0.0.1/live','a-key','Software',30,900);
    const b=s.createStreamInstance('B','p','custom','rtmp://127.0.0.1/live','b-key','Software',60,1700);
    await s.startAllStreams(); assert.equal(calls.length,2);
    assert.equal(store.getState().instances.filter(i=>i.status==='live').length,2);
    assert.deepEqual(calls.map(c=>c.config.bitrateKbps).sort((x,y)=>x-y),[900,1700]);
    await s.stopStream(a.id); assert.equal(store.getState().instances.find(i=>i.id===b.id)?.status,'live');
    await s.stopAllStreams(); assert.ok(store.getState().instances.every(i=>i.status==='idle'));
  } finally { globalThis.fetch=originalFetch; }
});
test('parallel broadcasts cannot fight over the same destination key', async () => {
  const originalFetch=globalThis.fetch; let starts=0;
  globalThis.fetch=(async () => {starts++; return new Response('{}');}) as any;
  try { const s=store.getState(); store.setState({playlists:[playlist()]});
    s.createStreamInstance('A','p','custom','rtmp://127.0.0.1/live','same-key','Software');
    s.createStreamInstance('B','p','custom','rtmp://127.0.0.1/live/','same-key','Software');
    await s.startAllStreams(); assert.equal(starts,1); assert.match(store.getState().debugStatus,/already used|Stream is live/);
  } finally { globalThis.fetch=originalFetch; }
});
test('stopping during startup cannot resurrect the stream', async () => {
  const originalFetch=globalThis.fetch; let release!:()=>void; let stops=0;
  const pending=new Promise<void>(r=>release=r);
  globalThis.fetch=(async (url:any) => {
    if(String(url).includes('playout')) {await pending; return new Response('{}');}
    stops++; return new Response('{}');
  }) as any;
  try { const s=store.getState(); store.setState({playlists:[playlist()]});
    const i=s.createStreamInstance('cancel','p','custom','rtmp://127.0.0.1/live','key','Software');
    const launch=s.startStream(i.id); await s.stopStream(i.id); release(); await launch;
    assert.equal(store.getState().instances[0].status,'idle'); assert.ok(stops>=2);
  } finally { globalThis.fetch=originalFetch; }
});
test('failed stop keeps a destination visible for retry', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async()=>new Response('{}',{status:500})) as any;
  try { const s=store.getState(); const i=s.createStreamInstance('stop failure','p','custom','rtmp://127.0.0.1/live','key','Software');
    await s.deleteStreamInstance(i.id); assert.equal(store.getState().instances.length,1); assert.equal(store.getState().instances[0].status,'error');
  } finally {globalThis.fetch=originalFetch;}
});

test('one-hour schedule waits until its exact due time and runs only once', async () => {
  const {isScheduleDue,scheduleRunToken}=await import('../src/services/schedule');
  const now=new Date('2026-10-28T12:00:00Z');
  const due=new Date(now.getTime()+3600000);
  const item={id:'hour',title:'hour',profileId:'p',profileName:'p',scheduledTime:'',scheduledAt:due.toISOString(),repeatDays:[],autoStart:true,autoStop:false,isActive:true};
  assert.equal(isScheduleDue(item,now),false);
  assert.equal(isScheduleDue(item,new Date(due.getTime()-1)),false);
  assert.equal(isScheduleDue(item,due),true);
  assert.equal(isScheduleDue({...item,lastRunDate:scheduleRunToken(item,due)},new Date(due.getTime()+60000)),false);
  assert.equal(isScheduleDue({...item,isActive:false},due),false);
});

test('weekly schedule catches up after resume once using the original run token', async () => {
  const {isScheduleDue,scheduleRunToken}=await import('../src/services/schedule');
  const due=new Date(2026,10,4,5,0,0);
  const resumed=new Date(2026,10,4,5,3,12);
  const item:any={id:'overnight',title:'overnight',profileId:'p',profileName:'p',scheduledTime:'05:00',repeatDays:['Wed'],autoStart:true,autoStop:false,isActive:true,createdAt:new Date(2026,10,3,22).toISOString()};
  assert.equal(isScheduleDue(item,new Date(due.getTime()-1)),false);
  assert.equal(isScheduleDue(item,resumed),true);
  assert.equal(scheduleRunToken(item,resumed),scheduleRunToken(item,due));
  assert.equal(isScheduleDue({...item,lastRunDate:scheduleRunToken(item,resumed)},new Date(2026,10,4,5,4)),false);
  assert.equal(isScheduleDue(item,new Date(2026,10,4,5,31)),false);
  assert.equal(isScheduleDue({...item,isActive:false},resumed),false);
  assert.equal(isScheduleDue({...item,autoStart:false},resumed),false);
});

test('resume across midnight observes the occurrence weekday and creation time', async () => {
  const {isScheduleDue,scheduleRunToken}=await import('../src/services/schedule');
  const item:any={isActive:true,autoStart:true,scheduledTime:'11:55 PM',repeatDays:['Tue']};
  const resume=new Date(2026,10,4,0,5);
  assert.equal(isScheduleDue(item,resume),true);
  assert.ok(scheduleRunToken(item,resume).endsWith('T23:55'));
  assert.equal(isScheduleDue({...item,repeatDays:['Wed']},resume),false);
  assert.equal(isScheduleDue({...item,createdAt:new Date(2026,10,4,0,0).toISOString()},resume),false);
});

test('resumed scheduler launches a missed 5 AM profile once while checking repeatedly', async (context) => {
  context.mock.timers.enable({apis:['Date'],now:new Date(2026,10,4,5,3).getTime()});
  const originalStart=store.getState().startStream;
  const launches:string[]=[];
  store.setState({startStream:(id)=>{launches.push(id);}});
  try {
    const s=store.getState();
    const p=s.saveProfile({name:'morning',playlistId:'p',platform:'custom',rtmpUrl:'rtmp://localhost/live',streamKey:'test',repeatCount:1,isInfiniteLoop:false,hardwareAcc:'Software',targetBitrateKbps:4500,resolution:'1080p',fps:30});
    s.addSchedule({title:'5 AM',profileId:p.id,profileName:p.name,scheduledTime:'05:00',repeatDays:['Wed'],autoStart:true,autoStop:true,stopAfterMinutes:60,isActive:true,createdAt:new Date(2026,10,3,22).toISOString()});
    s.checkSchedules(); s.checkSchedules(); await new Promise(r=>setTimeout(r,5)); s.checkSchedules();
    assert.equal(launches.length,1);
    assert.equal(store.getState().instances[0].targetBitrate,4500);
    assert.equal(store.getState().schedules[0].lastRunDate?.slice(-5),'05:00');
  } finally {store.setState({startStream:originalStart});}
});

test('next wake selects the future occurrence and never a completed or disabled run', async () => {
  const {nextScheduleRun}=await import('../src/services/schedule');
  const {wakeDateForRun}=await import('../src/services/schedulePower');
  const night=new Date(2026,10,3,22);
  const item:any={isActive:true,autoStart:true,scheduledTime:'05:00',repeatDays:['Wed']};
  const morning=new Date(2026,10,4,5);
  assert.equal(nextScheduleRun(item,night)?.getTime(),morning.getTime());
  assert.equal(wakeDateForRun(morning),'11/04/26 04:58:00');
  assert.equal(nextScheduleRun({...item,isActive:false},night),null);
  assert.equal(nextScheduleRun({...item,scheduledTime:'25:80'},night),null);
  assert.equal(nextScheduleRun({...item,scheduledAt:morning.toISOString()},night)?.getTime(),morning.getTime());
  assert.equal(nextScheduleRun({...item,scheduledAt:morning.toISOString(),lastRunDate:morning.toISOString()},night),null);
  assert.equal(nextScheduleRun(item,new Date(2026,10,4,5,3))?.getDate(),11);
});
test('due one-time schedule starts the saved profile once across repeated ticks', async () => {
  const originalFetch=globalThis.fetch; let starts=0;
  globalThis.fetch=(async()=>{starts++; return new Response('{}');}) as any;
  try {
    const s=store.getState(); store.setState({playlists:[playlist()]});
    const p=s.saveProfile({name:'scheduled',playlistId:'p',platform:'custom',rtmpUrl:'rtmp://localhost/live',streamKey:'test',repeatCount:2,isInfiniteLoop:false,hardwareAcc:'Software',targetBitrateKbps:900,resolution:'720p',fps:30});
    s.addSchedule({title:'one-time',profileId:p.id,profileName:p.name,scheduledAt:new Date(Date.now()-1000).toISOString(),scheduledTime:'',repeatDays:[],autoStart:true,autoStop:true,stopAfterMinutes:60,isActive:true});
    s.checkSchedules(); s.checkSchedules(); await new Promise(r=>setTimeout(r,10)); s.checkSchedules();
    assert.equal(starts,1); assert.equal(store.getState().instances.length,1);
    assert.ok(store.getState().instances[0].scheduledStopTime);
    assert.equal(store.getState().schedules[0].isActive,false);
  } finally {globalThis.fetch=originalFetch;}
});

for (const loops of [1,3,10]) test(`scheduled ${loops}-loop run overrides an infinite playlist without setting a time cutoff`, async () => {
  const originalFetch=globalThis.fetch; const requests:any[]=[];
  globalThis.fetch=(async (_url:any,options:any)=>{requests.push(JSON.parse(options.body));return new Response('{}');}) as any;
  try {
    const s=store.getState(); const source=playlist(); source.isInfiniteLoop=true; source.repeatCount=-1;
    store.setState({playlists:[source]});
    const p=s.saveProfile({name:'loops',playlistId:'p',platform:'custom',rtmpUrl:'rtmp://localhost/live',streamKey:'test',repeatCount:-1,isInfiniteLoop:true,hardwareAcc:'Software',targetBitrateKbps:4500,resolution:'1080p',fps:30});
    s.addSchedule({title:'loop run',profileId:p.id,profileName:p.name,scheduledAt:new Date(Date.now()-1000).toISOString(),scheduledTime:'',repeatDays:[],autoStart:true,autoStop:true,stopMode:'loops',stopAfterLoops:loops,stopAfterMinutes:1,isActive:true});
    s.checkSchedules(); await new Promise(r=>setTimeout(r,10)); s.checkSchedules();
    const instance=store.getState().instances[0];
    assert.equal(instance.playbackLoopLimit,loops);
    assert.equal(instance.scheduledStopTime,undefined);
    assert.equal(requests.length,1);
    assert.equal(requests[0].config.repeatCount,loops);
    assert.equal(requests[0].config.loopForever,false);
    assert.equal(source.isInfiniteLoop,true);
    assert.equal(source.repeatCount,-1);
    assert.equal(playlistForInstance(source).isInfiniteLoop,true);
  } finally {globalThis.fetch=originalFetch;}
});

test('loop limits validate whole numbers and leave time-based legacy schedules compatible', async () => {
  const {isValidLoopCount}=await import('../src/services/schedule');
  for (const bad of [0,-1,2.5,NaN,Infinity,10001,undefined]) assert.equal(isValidLoopCount(bad),false);
  assert.equal(isValidLoopCount(10),true);
  const original=playlist();
  const copy=playlistForInstance(original,{playbackLoopLimit:3});
  assert.equal(copy.repeatCount,3);assert.equal(original.repeatCount,2);
  assert.equal(buildPlayoutConfig(copy,'rtmp://host/live','test','Software',4500).repeatCount,3);
});

test('invalid saved loop count cannot silently start an infinite broadcast', async () => {
  const originalStart=store.getState().startStream;let launches=0;
  store.setState({startStream:()=>{launches++;}});
  try {
    const s=store.getState();
    const p=s.saveProfile({name:'invalid',playlistId:'p',platform:'custom',rtmpUrl:'rtmp://localhost/live',streamKey:'test',repeatCount:-1,isInfiniteLoop:true,hardwareAcc:'Software',targetBitrateKbps:4500,resolution:'1080p',fps:30});
    s.addSchedule({title:'invalid',profileId:p.id,profileName:p.name,scheduledAt:new Date(Date.now()-1000).toISOString(),scheduledTime:'',repeatDays:[],autoStart:true,autoStop:true,stopMode:'loops',stopAfterLoops:0,isActive:true});
    s.checkSchedules();await new Promise(r=>setTimeout(r,5));
    assert.equal(launches,0);assert.equal(store.getState().instances.length,0);
    assert.ok(store.getState().logs.some((l)=>l.message.includes('loop count')));
  } finally {store.setState({startStream:originalStart});}
});

test('legacy demo analytics are discarded while recorded data survives reload', async()=>{
  const {emptyAnalytics,restoreAnalytics}=await import('../src/services/analytics');
  assert.equal(restoreAnalytics({totalHoursStreamed:182.5} as any).totalHoursStreamed,0);
  assert.equal(restoreAnalytics({...emptyAnalytics(),totalStreamsRun:3}).totalStreamsRun,3);
});
test('analytics records actual output, stalls, concurrent hours and weighted bitrate', async()=>{
  const {emptyAnalytics,sampleActivity}=await import('../src/services/analytics');
  const now=Date.now();const base:any={status:'live',analyticsLastSampleAt:now-1000,lastOutputAt:now,metrics:{fps:30,bitrateKbps:4000}};
  const data=sampleActivity(emptyAnalytics(),[base,{...base,metrics:{fps:30,bitrateKbps:6000}},{...base,status:'reconnecting'}],now);
  assert.equal(data.totalLiveSeconds,2);assert.equal(data.totalObservedSeconds,3);assert.equal(data.averageBitrateKbps,5000);assert.ok(Math.abs(data.streamStabilityPercent-200/3)<.001);
  assert.equal(sampleActivity(data,[{...base,lastOutputAt:now-6000}],now).totalLiveSeconds,2);
});
test('analytics splits midnight and excludes unobserved sleep gaps',async()=>{
  const {emptyAnalytics,sampleActivity,localDay,lastSevenDays}=await import('../src/services/analytics');
  const midnight=new Date(2026,9,29).getTime();const base:any={status:'live',analyticsLastSampleAt:midnight-1000,lastOutputAt:midnight+1000,metrics:{fps:30,bitrateKbps:1000}};
  const data=sampleActivity(emptyAnalytics(),[base],midnight+1000);
  assert.equal(data.dailySeconds[localDay(new Date(midnight-1))],1);assert.equal(data.dailySeconds[localDay(new Date(midnight))],1);
  assert.equal(sampleActivity(emptyAnalytics(),[{...base,analyticsLastSampleAt:midnight-3600000}],midnight+1000).totalLiveSeconds,0);
  assert.equal(lastSevenDays(data,new Date(midnight)).length,7);
});
test('live and recovery counters require fresh output and ignore duplicate progress',()=>{
  const s=store.getState(); const i=s.createStreamInstance('stats','p','custom','rtmp://localhost/live','key','Software');
  store.setState({instances:[{...i,status:'connecting'}]});
  const before=store.getState().analytics.totalStreamsRun;
  s.updateInstanceMetrics(i.id,{fps:0,bitrateKbps:0});assert.equal(store.getState().analytics.totalStreamsRun,before);
  s.updateInstanceMetrics(i.id,{fps:30,bitrateKbps:1000});s.updateInstanceMetrics(i.id,{fps:30,bitrateKbps:1000});
  assert.equal(store.getState().analytics.totalStreamsRun,before+1);
  const recoveries=store.getState().analytics.successfulReconnections;
  store.setState({instances:store.getState().instances.map(x=>({...x,status:'connecting',analyticsRecovering:true}))});
  s.updateInstanceMetrics(i.id,{fps:30,bitrateKbps:1000});s.updateInstanceMetrics(i.id,{fps:30,bitrateKbps:1000});
  assert.equal(store.getState().analytics.successfulReconnections,recoveries+1);
});
test('stream notifications suppress unchanged metrics and premature stop notices',async()=>{
  const {streamStatusNotice}=await import('../src/services/desktopNotifications');
  const base:any={name:'QA stream',status:'live'};
  assert.equal(streamStatusNotice(base,{...base}),null);
  assert.equal(streamStatusNotice(base,{...base,status:'idle',stopping:true}),null);
  assert.equal(streamStatusNotice({...base,status:'idle',stopping:true},{...base,status:'idle',stopping:false})?.title,'Stream stopped');
  assert.equal(streamStatusNotice({...base,status:'connecting'},base)?.title,'Stream is live');
  assert.equal(streamStatusNotice(base,{...base,status:'reconnecting'})?.title,'Stream reconnecting');
  assert.equal(streamStatusNotice(base,{...base,status:'error'})?.title,'Stream needs attention');
});

test('a starved 12 FPS stream cannot report excellent 30 FPS output health',async()=>{
  const {outputHealth,encoderLabel}=await import('../src/services/streamHealth');
  assert.equal(outputHealth({fps:12,bitrateKbps:4500,droppedFrames:0},30),'Poor');
  assert.equal(outputHealth({fps:30,bitrateKbps:4500,droppedFrames:0},30),'Excellent');
  assert.equal(outputHealth({fps:27,bitrateKbps:4500,droppedFrames:0},30),'Fair');
  assert.equal(encoderLabel('Auto'),'Software CBR (Auto)');
});

test('prepared 1080p files automatically stream-copy only for matching output settings',()=>{
  const ready={...video(),metadata:{...video().metadata,resolution:'1920x1080'},resolution:'1920x1080',streamReadyProfile:{version:1,width:1920,height:1080,fps:30,bitrateKbps:4500}};
  const p=playlist([ready]);
  assert.equal(usePassthrough(p,undefined,4500,30),true);
  assert.equal(usePassthrough(p,undefined,6000,30),false);
  assert.equal(usePassthrough(p,undefined,4500,60),false);
  assert.equal(usePassthrough(p,{outputResolution:'720p'} as any,4500,30),false);
  const args=generateFFmpegArgs(p,'custom','rtmp://localhost/live','key','Auto',4500,undefined,30);
  assert.ok(args.includes('copy'));assert.ok(!args.includes('libx264'));assert.ok(!args.includes('-vf'));
});
test('mixed prepared and original clips cannot silently skip live normalization',()=>{
  const ready={...video(),streamReadyProfile:{version:1,width:1920,height:1080,fps:30,bitrateKbps:4500}};
  assert.equal(usePassthrough(playlist([ready,video('original')]),undefined,4500,30),false);
});


test('editing a future schedule preserves identity and rearms only when the start changes', async () => {
  const { editedSchedule, isScheduleDue, localDateTime } = await import('../src/services/schedule');
  const now = new Date(2026, 10, 6, 10, 0);
  const item = {id:'scheduled', title:'Morning', profileId:'p', profileName:'Profile', scheduledTime:'07:00', repeatDays:['Daily'], autoStart:true, autoStop:false, isActive:true, createdAt:new Date(2026,10,1).toISOString(), lastRunDate:localDateTime(new Date(2026,10,6,7))};
  const renamed = editedSchedule(item, {...item,title:'Renamed'}, now);
  assert.equal(renamed.lastRunDate,item.lastRunDate);
  const changed = editedSchedule(item, {...item,scheduledTime:'09:45'}, now);
  assert.equal(changed.id,item.id); assert.equal(changed.lastRunDate,undefined);
  assert.equal(isScheduleDue(changed, now),false); // Do not replay a past time on save.
  assert.equal(isScheduleDue(changed, new Date(2026,10,7,9,45)),true);
  assert.throws(() => editedSchedule(item,{...item,scheduledTime:'28:00'},now));
  const once = {...item,scheduledAt:new Date(2026,10,7,5).toISOString(),repeatDays:[]};
  const rearmed = editedSchedule({...item,isActive:false,lastRunDate:item.lastRunDate},{...once,isActive:true},now);
  assert.equal(isScheduleDue(rearmed,new Date(2026,10,7,5)),true);
});

test('instance editing updates a stopped destination and refuses all active states', () => {
  store.setState({playlists:[playlist()]});
  const instance=store.getState().createStreamInstance('Before','p','custom','rtmp://localhost/live','fake-key','Software');
  const changes={name:'Edited',playlistId:'p',platform:'custom' as const,rtmpUrl:'rtmp://localhost/updated',streamKey:'new-fake-key',hardwareAcc:'Software' as const,fps:30,targetBitrate:1500};
  assert.equal(store.getState().editStreamInstance(instance.id,changes),true);
  assert.equal(store.getState().instances[0].rtmpUrl,changes.rtmpUrl);
  for(const status of ['live','connecting','reconnecting','paused'] as const) {
    store.setState({instances:[{...store.getState().instances[0],status}]});
    assert.equal(store.getState().editStreamInstance(instance.id,{...changes,name:'Must not change'}),false);
    assert.equal(store.getState().instances[0].name,'Edited');
    assert.equal(store.getState().instances[0].status,status);
  }
});

test('editing a schedule updates it in place and leaves running stream limits unchanged', () => {
  const s=store.getState();
  s.addSchedule({title:'Daily',profileId:'p',profileName:'Test',scheduledTime:'07:00',repeatDays:['Daily'],autoStart:true,autoStop:true,stopMode:'loops',stopAfterLoops:3,isActive:true});
  const before=store.getState().schedules[0];
  store.setState({instances:[{id:'running',scheduleId:before.id,status:'live',playbackLoopLimit:3,scheduledStopTime:undefined} as any]});
  s.updateSchedule(before.id,{...before,title:'Edited daily',scheduledTime:'05:15',stopAfterLoops:10});
  assert.equal(store.getState().schedules.length,1);assert.equal(store.getState().schedules[0].id,before.id);
  assert.equal(store.getState().schedules[0].scheduledTime,'05:15');assert.equal(store.getState().schedules[0].stopAfterLoops,10);
  assert.equal(store.getState().instances[0].status,'live');assert.equal(store.getState().instances[0].playbackLoopLimit,3);
});

import { aggregateDownloadStats } from '../src/services/downloadStats';
test('download statistics count installers across versions without counting checksum files, draft assets or duplicates', () => {
  const asset = (id:number,name:string,download_count:number,state='uploaded') => ({id,name,download_count,state});
  const oldMac = asset(1,'Studio_1.0.9_aarch64.dmg',10);
  assert.deepEqual(aggregateDownloadStats([
    {draft:false,assets:[oldMac,asset(2,'Studio_x64-setup.exe',3),asset(3,'SHA256SUMS.txt',700)]},
    {draft:false,assets:[oldMac,asset(4,'Studio_amd64.AppImage',4),asset(5,'Studio_amd64.deb',2),asset(6,'Studio.x86_64.rpm',1),asset(7,'Studio_x64.msi',2),asset(8,'pending.dmg',99,'starter')]},
    {draft:true,assets:[asset(9,'draft.dmg',1000)]},
  ]),{total:22,mac:10,windows:5,linux:7});
});
test('download statistics keep real zero and reject invalid counts', () => {
  assert.deepEqual(aggregateDownloadStats([{draft:false,assets:[{id:1,name:'app.dmg',download_count:-1,state:'uploaded'},{id:2,name:'app.exe',download_count:NaN,state:'uploaded'}]}]),{total:0,mac:0,windows:0,linux:0});
});
