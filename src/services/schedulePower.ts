import { invoke } from '@tauri-apps/api/core';
export interface WakeAlarm { scheduleId: string; wakeDate: string }
export interface SchedulePowerStatus { supported: boolean; idleSleepPrevented: boolean; alarms: WakeAlarm[] }
export const readSchedulePower = () => invoke<SchedulePowerStatus>('get_schedule_power_status');
export const configureScheduleWake = (scheduleId: string, run: Date | null) => invoke<void>('configure_schedule_wake', {scheduleId, startAtSeconds: run ? Math.floor(run.getTime()/1000) : null});
export function wakeDateForRun(run: Date): string {
  const date = new Date(run.getTime()-120000);
  const pad = (n: number) => String(n).padStart(2,'0');
  return `${pad(date.getMonth()+1)}/${pad(date.getDate())}/${pad(date.getFullYear()%100)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
