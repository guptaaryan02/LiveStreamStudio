import React, { useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { CalendarClock, Plus, Trash2, CheckCircle2, Clock, Calendar, Power } from 'lucide-react';

export const SchedulerView: React.FC = () => {
  const { schedules, addSchedule, toggleSchedule, deleteSchedule, profiles } = useStudioStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [profileId, setProfileId] = useState(profiles[0]?.id || '');
  const [time, setTime] = useState('07:00 AM');
  const [repeatDays, setRepeatDays] = useState<string[]>(['Mon', 'Wed', 'Fri']);
  const [autoStart, setAutoStart] = useState(true);
  const [autoStop, setAutoStop] = useState(true);
  const [stopAfterMinutes, setStopAfterMinutes] = useState(180);

  const daysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day]);
    }
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !profileId) return;

    const prof = profiles.find((p) => p.id === profileId);

    addSchedule({
      title,
      profileId,
      profileName: prof?.name || 'Default Profile',
      scheduledTime: time,
      repeatDays,
      autoStart,
      autoStop,
      stopAfterMinutes: autoStop ? stopAfterMinutes : undefined,
      isActive: true,
    });

    setShowAddModal(false);
    setTitle('');
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto pb-20">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
            <CalendarClock className="w-6 h-6 text-indigo-400" />
            <span>Automated Stream Scheduler</span>
          </h2>
          <p className="text-xs text-slate-400">
            Schedule 24/7 stream launches on recurring weekly schedules or specific dates with auto-stop timer triggers.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Scheduled Timer</span>
        </button>
      </div>

      {/* Schedule Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {schedules.map((item) => (
          <div
            key={item.id}
            className={`p-5 rounded-2xl border space-y-4 transition ${
              item.isActive ? 'bg-slate-900/80 border-indigo-500/40 shadow-lg' : 'bg-slate-900/40 border-slate-800 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm text-white">{item.title}</h3>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      item.isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="text-xs font-mono text-indigo-400 mt-1">Profile: {item.profileName}</div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleSchedule(item.id)}
                  className={`p-2 rounded-lg transition ${
                    item.isActive ? 'text-emerald-400 hover:bg-emerald-950/40' : 'text-slate-500 hover:bg-slate-800'
                  }`}
                  title="Toggle Schedule Active"
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteSchedule(item.id)}
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
                <span className="font-bold text-white text-sm">{item.scheduledTime}</span>
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

              {item.autoStop && item.stopAfterMinutes && (
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 flex justify-between">
                  <span>Auto-Stop Timer:</span>
                  <span className="text-amber-400 font-semibold">{item.stopAfterMinutes} mins ({item.stopAfterMinutes / 60} hrs)</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Add Schedule */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">Create Automated Schedule</h3>
            <form onSubmit={handleScheduleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Daily Morning Chanting 6 AM"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Select Stream Profile</label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Launch Time</label>
                <input
                  type="text"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="07:00 AM"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-white focus:outline-none"
                />
              </div>

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

              <div className="pt-2 space-y-2">
                <label className="flex items-center space-x-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoStop}
                    onChange={(e) => setAutoStop(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span>Automatically stop stream after duration</span>
                </label>

                {autoStop && (
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Duration (Minutes)</label>
                    <input
                      type="number"
                      value={stopAfterMinutes}
                      onChange={(e) => setStopAfterMinutes(parseInt(e.target.value) || 60)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-white focus:outline-none"
                    />
                  </div>
                )}
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
