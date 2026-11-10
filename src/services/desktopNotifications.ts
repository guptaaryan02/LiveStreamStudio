import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import type { StreamInstance } from '../types';
import { sanitizeLogMessage } from './ffmpegEngine';
export type NotificationPermission = 'granted'|'denied'|'default'|'unsupported';
const native = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export async function notificationPermission(request=false): Promise<NotificationPermission> {
  if(native()) {
    if(await isPermissionGranted()) return 'granted';
    return request ? await requestPermission() : 'default';
  }
  if(typeof Notification==='undefined') return 'unsupported';
  return request ? await Notification.requestPermission() : Notification.permission;
}
export async function deliverNotification(title:string, body:string): Promise<boolean> {
  if(await notificationPermission() !== 'granted') return false;
  const safe={title:sanitizeLogMessage(title),body:sanitizeLogMessage(body)};
  if(native()) await invoke('send_desktop_notification',safe);
  else new Notification(safe.title,{body:safe.body});
  return true;
}
export function streamStatusNotice(previous:StreamInstance|undefined, next:StreamInstance): {title:string;body:string}|null {
  if(next.stopping || (previous?.status===next.status && !(previous?.stopping && next.status==='idle'))) return null;
  const title=next.status==='live' ? 'Stream is live' : next.status==='reconnecting' ? 'Stream reconnecting' : next.status==='error' ? 'Stream needs attention' : next.status==='idle' && previous && (previous.stopping || ['live','connecting','reconnecting'].includes(previous.status)) ? 'Stream stopped' : null;
  if(!title) return null;
  const detail=next.status==='reconnecting' ? 'The connection dropped. Studio is retrying.' : next.status==='error' ? 'Open Studio logs to check the error.' : next.status==='live' ? 'The encoder is sending output.' : 'The encoder has stopped.';
  // Destination names only; never include URLs, keys or encoder stderr.
  return {title,body:`${sanitizeLogMessage(next.name)}: ${detail}`};
}
