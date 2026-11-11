import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { MarketingSite, type Release } from './components/marketing/MarketingSite';
import './index.css';

const desktop = '__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window || window.navigator.userAgent.includes('Tauri');
const studioPreview = window.location.hash.startsWith('#/studio');
const StudioApp = lazy(() => import('./App'));
let release: Release | null = null;
try { release = JSON.parse(document.getElementById('site-release')?.textContent || 'null'); } catch { /* live release fetch remains available */ }
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {desktop || studioPreview ? <Suspense fallback={<div role="status">Opening LiveStream Studio…</div>}><StudioApp /></Suspense> : <MarketingSite initialRelease={release} />}
  </React.StrictMode>
);
