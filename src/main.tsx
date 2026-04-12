import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initCapacitorPlugins } from './lib/capacitorSetup.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initCapacitorPlugins());
} else {
  initCapacitorPlugins();
}
