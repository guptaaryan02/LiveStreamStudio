import type { ScheduleItem } from '../../types';
import { notify } from '../../services/uiFeedback';
import { localDateTime, nextScheduleRun, isValidLoopCount, clock } from '../../services/schedule';
import { configureScheduleWake, readSchedulePower, wakeDateForRun, SchedulePowerStatus } from '../../services/schedulePower';
import { isTauriEnvironment } from '../../services/tauriEngine';
import React, { useEffect, useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { CalendarClock, Plus, Trash2, CheckCircle2, Clock, Calendar, Power, Pencil } from 'lucide-react';

export const SchedulerView: React.FC = () => {
  const { schedules, addSchedule, updateSchedule, toggleSchedule, deleteSchedule, profiles } = useStudioStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [time, setTime] = useState('07:00');
  const [mode, setMode] = useState<'once'|'weekly'>('once');
  const [scheduledAt, setScheduledAt] = useState(localDateTime(new Date(Date.now()+3600000)));
  const [repeatDays, setRepeatDays] = useState<string[]>(['Mon', 'Wed', 'Fri']);
  const [autoStart, setAutoStart] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [autoStop, setAutoStop] = useState(true);
  const [stopAfterMinutes, setStopAfterMinutes] = useState(180);
  const [stopMode, setStopMode] = useState<'time'|'loops'>('time');
  const [stopAfterLoops, setStopAfterLoops] = useState(3);
  const [wakeOnSave, setWakeOnSave] = useState(true);
  const [power, setPower] = useState<SchedulePowerStatus | null>(null);
  const [powerError, setPowerError] = useState('');
  const [wakeBusy, setWakeBusy] = useState(false);
  const refreshPower = async () => {
    try { setPower(await readSchedulePower()); setPowerError(''); }
    catch { setPowerError('Could not verify sleep protection or wake alarms.'); }
  };
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    void refreshPower();
    const timer = setInterval(() => void refreshPower(), 15000);
    return () => clearInterval(timer);
  }, []);
  const changeWake = async (id: string, run: Date | null) => {
    setWakeBusy(true);
    try {
      await configureScheduleWake(id, run);
      await refreshPower();
      return true;
    } catch (error) { notify(String(error)); return false; }
    finally { setWakeBusy(false); }
  };
  const removeWakeBefore = async (id: string, action: () => void) => {
    if (power?.alarms.some((a) => a.scheduleId === id) && !await changeWake(id, null)) return;
    action();
  };

  const daysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day]);
    }
  };

  const openSchedule = (item?: ScheduleItem) => {
    setEditingId(item?.id || null); setTitle(item?.title || ''); setProfileId(item?.profileId || profiles[0]?.id || '');
    setMode(item && !item.scheduledAt ? 'weekly' : 'once');
    setScheduledAt(item?.scheduledAt ? localDateTime(new Date(item.scheduledAt)) : localDateTime(new Date(Date.now()+3600000)));
    const parsed = clock(item?.scheduledTime || '07:00') || [7, 0];
    setTime(`${String(parsed[0]).padStart(2,'0')}:${String(parsed[1]).padStart(2,'0')}`);
    setRepeatDays(item?.repeatDays.includes('Daily') ? daysList : item?.repeatDays || daysList);
    setIsActive(item?.scheduledAt && item.lastRunDate ? true : item?.isActive ?? true);
    setAutoStart(item?.autoStart ?? true); setAutoStop(item?.autoStop ?? true);
    setStopMode(item?.stopMode || 'time'); setStopAfterMinutes(item?.stopAfterMinutes || 180); setStopAfterLoops(item?.stopAfterLoops || 3);
    setWakeOnSave(item ? !!power?.alarms.some((a) => a.scheduleId === item.id) : true); setShowAddModal(true);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !profileId) return;
    if (autoStop && stopMode === 'loops' && !isValidLoopCount(stopAfterLoops)) { notify('Enter a whole number of playlist loops from 1 to 10000.'); return; }
    if (autoStop && stopMode === 'time' && (!Number.isSafeInteger(stopAfterMinutes) || stopAfterMinutes < 1)) { notify('Enter a positive whole number of minutes.'); return; }

    if (mode === 'once' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) { notify('Choose a future date and time.'); return; }
    if (mode === 'weekly' && !repeatDays.length) { notify('Choose at least one repeat day.'); return; }
    if (mode === 'weekly' && !clock(time)) { notify('Enter a valid time in HH:mm, for example 05:30 or 22:00.'); return; }
    const prof = profiles.find((p) => p.id === profileId);
    if (!prof) { notify('Select an existing stream profile.'); return; }

    const previousIds = new Set(useStudioStore.getState().schedules.map((s) => s.id));
    const changes = {
      title,
      profileId,
      profileName: prof?.name || 'Default Profile',
      scheduledAt: mode === 'once' ? new Date(scheduledAt).toISOString() : undefined,
      scheduledTime: time,
      repeatDays: mode === 'once' ? [] : repeatDays,
      autoStart,
      autoStop,
      stopMode: autoStop ? stopMode : undefined,
      stopAfterMinutes: autoStop && stopMode === 'time' ? stopAfterMinutes : undefined,
      stopAfterLoops: autoStop && stopMode === 'loops' ? stopAfterLoops : undefined,
      isActive,
    };
    // Remove the previous alarm before editing, so it cannot wake at the old time.
    if (editingId && power?.alarms.some((a) => a.scheduleId === editingId) && !await changeWake(editingId, null)) return;
    try { if (editingId) updateSchedule(editingId, changes); else addSchedule(changes); }
    catch (error) { notify(String(error)); return; }

    setShowAddModal(false);
    setTitle('');
    const saved = useStudioStore.getState().schedules.find((s) => editingId ? s.id === editingId : !previousIds.has(s.id));
    if (saved?.isActive && saved.autoStart && power?.supported && wakeOnSave) {
      const run = nextScheduleRun(saved, new Date());
      if (run && run.getTime() >= Date.now()+180000) {
        if (await changeWake(saved.id, run)) notify('Schedule saved. macOS confirmed a wake alarm two minutes before the next run.');
      } else notify('Schedule saved. This run is too soon to set a wake alarm; keep Studio awake.');
    }
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-studio-foreground tracking-tight flex items-center space-x-2">
            <CalendarClock className="w-6 h-6 text-indigo-400" />
            <span>Automated Stream Scheduler</span>
          </h2>
          <p className="text-xs text-slate-400">
            Keep Studio open and signed in; locking the screen is fine. Enable Auto-start in the target YouTube broadcast for automatic publishing.
          </p>
        </div>

        <button
          disabled={wakeBusy}
          onClick={() => openSchedule()}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Scheduled Timer</span>
        </button>
      </div>

      <div className="rounded-xl border border-indigo-500/40 bg-studio-panel p-4 text-xs space-y-2" role="status">
        <p className="font-semibold text-studio-foreground">Overnight scheduling</p>
        <p>{powerError || (power?.supported ? (power.idleSleepPrevented ? 'Idle sleep protection is active. The screen can lock or turn off.' : 'Idle sleep protection starts when an automatic schedule or stream is active.') : 'On macOS desktop, Studio prevents idle sleep and can request a system wake alarm. Other systems must remain awake.')}</p>
        <p>For sleep, set a wake alarm below. Connect the charger, leave the lid open and keep Studio running. Shutdown, logout and a closed lid cannot be relied on for unattended streaming.</p>
        <p>Wake alarms cover the next run only; set another after a weekly run, or leave idle sleep protection active. Missed weekly runs catch up within 30 minutes after resume.</p>
        {power?.alarms.filter((a) => !schedules.some((s) => s.id === a.scheduleId)).map((a) => <div key={a.scheduleId}>Unused Studio wake alarm: {a.wakeDate} <button disabled={wakeBusy} onClick={() => void changeWake(a.scheduleId, null)} className="underline">Remove wake alarm</button></div>)}
      </div>

      {/* Schedule Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {schedules.map((item) => {
          const nextRun = nextScheduleRun(item, new Date());
          const alarm = power?.alarms.find((a) => a.scheduleId === item.id);
          const armed = !!nextRun && alarm?.wakeDate === wakeDateForRun(nextRun);
          const profileReady = profiles.some((p) => p.id === item.profileId && p.streamKey.trim());
          return (
          <div
            key={item.id}
            className={`p-5 rounded-2xl border space-y-4 transition ${
              item.isActive ? 'bg-slate-900/80 border-indigo-500/40 shadow-lg' : 'bg-slate-900/40 border-slate-800 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm text-studio-foreground">{item.title}</h3>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      item.isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.scheduledAt && item.lastRunDate ? 'Completed' : item.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="text-xs font-mono text-indigo-400 mt-1">Profile: {item.profileName}</div>
              </div>

              <div className="flex items-center space-x-2">
                <button disabled={wakeBusy} aria-label={`Edit schedule ${item.title}`} onClick={() => openSchedule(item)} className="p-2 text-indigo-400"><Pencil className="w-4 h-4" /></button>
                <button
                  disabled={wakeBusy || (!!item.scheduledAt && !!item.lastRunDate)}
                  onClick={() => void removeWakeBefore(item.id, () => toggleSchedule(item.id))}
                  aria-label={`Toggle schedule ${item.title}`}
                  className={`p-2 rounded-lg transition ${
                    item.isActive ? 'text-emerald-400 hover:bg-emerald-950/40' : 'text-slate-500 hover:bg-slate-800'
                  }`}
                  title="Toggle Schedule Active"
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  aria-label={`Delete schedule ${item.title}`}
                  disabled={wakeBusy}
                  onClick={() => void removeWakeBefore(item.id, () => deleteSchedule(item.id))}
                  className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Schedule details */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center space-x-1.5 text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Launch Time:</span>
                </span>
                <span className="font-bold text-studio-foreground text-sm">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : item.scheduledTime}</span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center space-x-1.5 text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Repeat Days:</span>
                </span>
                <div className="flex space-x-1">
                  {item.repeatDays.map((d) => (
                    <span key={d} className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-[10px]">
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {item.autoStop && item.stopMode === 'loops' && (
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
                  <span>Auto-Stop:</span>
                  <span className="text-amber-400 font-semibold">After {item.stopAfterLoops} complete playlist loops</span>
                </div>
              )}
              {item.autoStop && item.stopMode !== 'loops' && item.stopAfterMinutes && (
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
                  <span>Auto-Stop Timer:</span>
                  <span className="text-amber-400 font-semibold">{item.stopAfterMinutes} mins ({item.stopAfterMinutes / 60} hrs)</span>
                </div>
              )}
            </div>
            {!profileReady && item.isActive && <p className="text-xs text-amber-400">Load the saved key or enter a session key in Stream Profiles before the scheduled start. Studio will not open a Keychain prompt unattended.</p>}
            {power?.supported && <div className="text-xs space-y-2">
              <p className={armed ? 'text-emerald-400' : 'text-amber-400'}>{armed ? `macOS wake confirmed: ${alarm!.wakeDate} (2 minutes early)` : alarm ? `Wake alarm needs updating: ${alarm.wakeDate}` : 'No system wake alarm. Idle sleep protection still works while Studio is open.'}</p>
              {nextRun && !armed && <button disabled={wakeBusy || nextRun.getTime() < Date.now()+180000} onClick={() => void changeWake(item.id, nextRun)} className="rounded bg-indigo-700 px-3 py-2 disabled:opacity-50">Set wake for next run</button>}
              {alarm && <button disabled={wakeBusy} onClick={() => void changeWake(item.id, null)} className="ml-2 underline">Remove wake alarm</button>}
              <p className="text-slate-400">Setting or removing an alarm asks macOS for administrator approval.</p>
            </div>}
          </div>
        );})}
      </div>

      {/* Modal: Add Schedule */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-base font-bold text-studio-foreground">{editingId ? 'Edit Automated Schedule' : 'Create Automated Schedule'}</h3>
            {editingId && <p className="text-xs text-slate-400">Changes apply to future runs. A stream already running keeps its current settings.</p>}
            <form onSubmit={handleScheduleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Daily Morning Chanting 6 AM"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Select Stream Profile</label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-studio-foreground focus:outline-none"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setMode('once')} className="rounded bg-slate-800 px-3 py-2">One-time</button>
                <button type="button" onClick={() => setMode('weekly')} className="rounded bg-slate-800 px-3 py-2">Weekly</button>
              </div>
              {mode === 'once' ? <div className="space-y-2">
                <label className="block text-slate-300">Start date and time (local)</label>
                <input aria-label="Scheduled date and time" name="scheduledAt" type="datetime-local" required value={scheduledAt}
                  onInput={(e) => setScheduledAt(e.currentTarget.value)} onChange={(e) => setScheduledAt(e.target.value)} className="w-full rounded bg-slate-950 border border-slate-800 p-2" />
                <button type="button" onClick={() => setScheduledAt(localDateTime(new Date(Date.now()+3600000)))} className="rounded bg-indigo-700 px-3 py-2">Start in 1 hour</button>
              </div> : <>
              <div>
                <label className="block text-slate-300 mb-1">Launch Time</label>
                <input
                  type="text" inputMode="numeric" aria-label="Repeat launch time" required pattern="[0-2][0-9]:[0-5][0-9]"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  onInput={(e) => setTime(e.currentTarget.value)}
                  placeholder="HH:mm (24-hour)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-studio-foreground focus:outline-none"
                />
              </div>

              <p className="text-slate-400">Local time, 24-hour format: 05:00 is morning; 22:00 is night.</p>
              <button type="button" onClick={() => setRepeatDays(daysList)} className="rounded bg-slate-800 px-3 py-2">Every day</button>
              <div>
                <label className="block text-slate-300 mb-1">Repeat Days</label>
                <div className="flex flex-wrap gap-1.5">
                  {daysList.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono border transition ${
                        repeatDays.includes(d)
                          ? 'bg-indigo-600 text-white border-indigo-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              </>}
              <div className="pt-2 space-y-2">
                <label className="flex items-center space-x-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoStop}
                    onChange={(e) => setAutoStop(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span>Automatically stop stream</span>
                </label>

                {autoStop && <div className="space-y-2">
                  <label className="block text-slate-300" htmlFor="schedule-stop-mode">Stop after</label>
                  <select id="schedule-stop-mode" value={stopMode} onChange={(e) => setStopMode(e.target.value as 'time'|'loops')} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
                    <option value="time">Time limit (minutes)</option>
                    <option value="loops">Complete playlist loops</option>
                  </select>
                  {stopMode === 'time' ? <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Duration (Minutes)</label>
                    <input
                      type="number"
                      aria-label="Duration in minutes"
                      min={1} step={1} required
                      value={stopAfterMinutes}
                      onChange={(e) => setStopAfterMinutes(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-studio-foreground focus:outline-none"
                    />
                  </div> : <div className="space-y-2">
                    <label className="block text-slate-300" htmlFor="schedule-loop-count">Number of complete loops</label>
                    <input id="schedule-loop-count" type="number" min={1} max={10000} step={1} required value={stopAfterLoops} onChange={(e) => setStopAfterLoops(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2" />
                    <p className="text-slate-400">1 loop plays every video in the playlist once. The final video finishes before the stream stops. This overrides the playlist's repeat setting for this scheduled run.</p>
                    <div className="flex gap-2">{[1,3,10].map((count) => <button key={count} type="button" onClick={() => setStopAfterLoops(count)} className="rounded bg-slate-800 px-3 py-1.5">{count} {count === 1 ? 'loop' : 'loops'}</button>)}</div>
                  </div>}
                  {stopMode === 'time' && <p className="text-slate-400">A time limit stops immediately and can cut a video short. Choose complete loops to finish the playlist.</p>}
                </div>}
              </div>

              <label className="flex gap-2 text-slate-300"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />Enable schedule</label>
              {power?.supported && <label className="flex gap-2 text-slate-300">
                <input type="checkbox" checked={wakeOnSave} onChange={(e) => setWakeOnSave(e.target.checked)} />
                <span>Set macOS wake for the next run, 2 minutes early. macOS will ask for administrator approval. Keep charger connected and lid open.</span>
              </label>}
              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={wakeBusy}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
