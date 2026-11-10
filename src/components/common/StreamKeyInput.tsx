import React, { useState } from 'react';
import { Eye, EyeOff, ClipboardPaste } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../../services/tauriEngine';

export function StreamKeyInput({ value, onChange, label = 'Stream key', required = false }: {
  value: string; onChange: (value: string) => void; label?: string; required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const paste = async () => {
    try {
      // Read only after an explicit user gesture. Never log or persist clipboard text.
      const text = isTauriEnvironment() ? await invoke<string>('read_clipboard_text') : await navigator.clipboard.readText();
      if (!text.trim()) { setMessage('Clipboard is empty.'); return; }
      onChange(text.trim()); setMessage('Key pasted and kept hidden.'); setVisible(false);
    } catch { setMessage('Could not read the clipboard. Click the field and use Paste.'); }
  };
  return <div className="space-y-1 select-text">
    <div className="flex items-center gap-2">
      <input aria-label={label} autoComplete="off" autoCapitalize="none" spellCheck={false}
        type={visible ? 'text' : 'password'} required={required} value={value}
        onInput={(e) => onChange(e.currentTarget.value)} onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => { const text = e.clipboardData.getData('text/plain'); if (text) { e.preventDefault(); onChange(text.trim()); setMessage('Key pasted.'); } }}
        placeholder="Paste stream key" className="min-w-0 flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-studio-foreground focus:outline-none focus:border-indigo-500" />
      <button type="button" aria-label={visible ? `Hide ${label}` : `Show ${label}`} onClick={() => setVisible(!visible)} className="p-2 text-slate-400">{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      <button type="button" onClick={() => void paste()} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-2 text-slate-200"><ClipboardPaste size={14} />Paste key</button>
    </div>
    <p role="status" className="text-[11px] text-slate-400">{message}</p>
  </div>;
}
