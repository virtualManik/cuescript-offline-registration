import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const applyTheme = (dark) => {
  document.documentElement.classList.toggle('dark', dark);
};

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
applyTheme(colorScheme.matches);
colorScheme.addEventListener('change', (e) => applyTheme(e.matches));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
