import type { ScheduleItem } from '../types';
export const localDateTime = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const SCHEDULE_CATCH_UP_MS = 30 * 60 * 1000;
export const isValidLoopCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 10000;

export function clock(time: string): [number, number] | null {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(time.trim());
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return [hour, minute];
}

function occurrence(schedule: ScheduleItem, day: Date): Date | null {
  const time = clock(schedule.scheduledTime);
  if (!time || (!schedule.repeatDays.includes('Daily') && !schedule.repeatDays.includes(days[day.getDay()]))) return null;
  const result = new Date(day); result.setHours(time[0], time[1], 0, 0);
  if (result.getHours() !== time[0] || result.getMinutes() !== time[1]) return null;
  return result;
}

function dueOccurrence(schedule: ScheduleItem, now: Date): Date | null {
  for (let back = 0; back <= 1; back++) {
    const day = new Date(now); day.setDate(day.getDate() - back);
    const run = occurrence(schedule, day);
    if (!run || run > now || now.getTime() - run.getTime() > SCHEDULE_CATCH_UP_MS) continue;
    // A newly created timer must not replay an earlier occurrence.
    if (schedule.createdAt && run.getTime() < Math.floor(Date.parse(schedule.createdAt)/60000)*60000) continue;
    return run;
  }
  return null;
}

export const scheduleRunToken = (schedule: ScheduleItem, now: Date) => schedule.scheduledAt || localDateTime(dueOccurrence(schedule, now) || now);
export function isScheduleDue(schedule: ScheduleItem, now: Date): boolean {
  if (!schedule.isActive || !schedule.autoStart) return false;
  if (schedule.scheduledAt) return !schedule.lastRunDate && Number.isFinite(Date.parse(schedule.scheduledAt)) && now.getTime() >= Date.parse(schedule.scheduledAt);
  const run = dueOccurrence(schedule, now);
  return !!run && schedule.lastRunDate !== localDateTime(run);
}

export function nextScheduleRun(schedule: ScheduleItem, now: Date): Date | null {
  if (!schedule.isActive || !schedule.autoStart) return null;
  if (schedule.scheduledAt) {
    const date = new Date(schedule.scheduledAt);
    return !schedule.lastRunDate && date > now ? date : null;
  }
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = new Date(now); day.setDate(day.getDate() + ahead);
    const run = occurrence(schedule, day);
    if (run && run > now && schedule.lastRunDate !== localDateTime(run)) return run;
  }
  return null;
}

// A changed recurrence starts from the edit time; title/stop-rule edits preserve deduplication.
export function editedSchedule(previous: ScheduleItem, changes: Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunDate'>, now = new Date()): ScheduleItem {
  if (!changes.title.trim() || !changes.profileId) throw new Error('Enter a name and select a profile.');
  if (changes.scheduledAt ? !Number.isFinite(Date.parse(changes.scheduledAt)) || Date.parse(changes.scheduledAt) <= now.getTime() : !clock(changes.scheduledTime) || !changes.repeatDays.length) throw new Error('Choose a future start or a valid repeat time and days.');
  if (changes.autoStop && (changes.stopMode === 'loops' ? !isValidLoopCount(changes.stopAfterLoops) : !Number.isSafeInteger(changes.stopAfterMinutes) || changes.stopAfterMinutes! < 1)) throw new Error('Enter a valid stop limit.');
  const rescheduled = previous.scheduledAt !== changes.scheduledAt || previous.scheduledTime !== changes.scheduledTime || [...previous.repeatDays].sort().join() !== [...changes.repeatDays].sort().join();
  return { ...previous, ...changes, id: previous.id, createdAt: rescheduled ? now.toISOString() : previous.createdAt, lastRunDate: rescheduled ? undefined : previous.lastRunDate };
}
