import { invoke } from '@tauri-apps/api/core';
import { sanitizeLogMessage } from './ffmpegEngine';
const desktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export function notify(message: string) {
  window.dispatchEvent(new CustomEvent('studio-notice', { detail: sanitizeLogMessage(message) }));
}
export async function copyText(text: string, message: string) {
  try {
    if (desktop()) await invoke('copy_text_to_clipboard', { text });
    else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else {
      const input=document.createElement('textarea'); input.value=text; document.body.append(input); input.select();
      const ok=document.execCommand('copy'); input.remove(); if(!ok) throw new Error('Clipboard unavailable');
    }
    notify(message);
  } catch (error) { notify(`Copy failed: ${String(error)}`); }
}
export async function saveTextFile(name: string, text: string, type='text/plain') {
  try {
    if (desktop()) {
      const saved=await invoke<boolean>('save_text_file', { name, text });
      if(saved) notify(`Saved ${name}`);
      return;
    }
    const url=URL.createObjectURL(new Blob([text],{type}));
    const a=document.createElement('a'); a.href=url; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(error) { notify(`Export failed: ${String(error)}`); }
}
