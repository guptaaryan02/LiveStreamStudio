import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {VideoItem} from '../types';
import { importFromPaths } from './videoImport';
export const READY_1080={version:1,width:1920,height:1080,fps:30,bitrateKbps:4500};
export async function prepareStreamCopy(video:VideoItem,jobId:string,onProgress:(percent:number)=>void):Promise<VideoItem>{
  const unlisten=await listen<{jobId:string;percent:number}>('preparation-progress',(event)=>{if(event.payload.jobId===jobId)onProgress(event.payload.percent);});
  try {
    const path=await invoke<string>('prepare_stream_video',{jobId,path:video.localPath || video.filePath,width:1920,height:1080,fps:30,bitrateKbps:4500});
    const result=await importFromPaths([path],video.category);
    if(result.error || !result.videos[0])throw new Error(result.error || 'Prepared copy could not be imported');
    return {...result.videos[0],title:video.title,streamReadyProfile:{...READY_1080}};
  } finally {unlisten();}
}
export async function cancelStreamCopy(jobId:string){return invoke<boolean>('cancel_stream_preparation',{jobId});}
