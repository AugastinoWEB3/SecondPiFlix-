import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initPiSDK } from './lib/piAuth';

// Eagerly initialize Pi Network SDK so readiness is established
initPiSDK().catch((err) => console.info('[Pi Network SDK Bootstrap]:', err?.message || err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
