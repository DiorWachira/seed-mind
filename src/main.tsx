import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/gloock/400.css';
import '@fontsource-variable/outfit';
import { App } from './App';
import { LangProvider } from './ui/i18n';
import { registerServiceWorker } from './ui/pwa';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
);

registerServiceWorker();
