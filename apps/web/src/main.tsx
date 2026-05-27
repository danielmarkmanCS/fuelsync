import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// On Capacitor (native Android/iOS), the service worker serves no purpose
// (assets are already bundled in the APK) and actively causes stale-cache
// issues. Unregister all existing SWs when running natively.
if ('serviceWorker' in navigator) {
  const isCapacitor = window.location.protocol === 'capacitor:'
    || (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    || navigator.userAgent.includes('CapacitorWebView');

  if (isCapacitor) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((sw) => sw.unregister());
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
