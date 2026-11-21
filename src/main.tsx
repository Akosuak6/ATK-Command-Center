import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ToastProvider } from './components/ui';
import { applySeedPatches, db } from './lib/db';
import './styles.css';

registerSW({ immediate: true });

// Ask the browser to keep IndexedDB even when storage is tight.
void navigator.storage?.persist?.();
void db.open().then(applySeedPatches).catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);
