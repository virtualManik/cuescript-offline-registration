import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const THEME_STORAGE_KEY = 'cuescript.theme';

const applyTheme = (dark) => {
  document.documentElement.classList.toggle('dark', dark);
};

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
let savedTheme = null;
try {
  savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
} catch {
  // Fall back to the operating-system preference if storage is unavailable.
}

applyTheme(savedTheme === 'dark' || (savedTheme !== 'light' && colorScheme.matches));
colorScheme.addEventListener('change', (event) => {
  try {
    if (localStorage.getItem(THEME_STORAGE_KEY) === null) {
      applyTheme(event.matches);
    }
  } catch {
    applyTheme(event.matches);
  }
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
