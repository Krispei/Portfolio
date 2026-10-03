import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// A refresh always starts at the very top (the hero), never mid-page:
//  · don't let the browser restore the old scroll position
//  · drop a leftover #section from the address bar (menu links add one), or
//    the browser would jump to that anchor once the section has loaded
//  · and rewind just before unloading, in case a browser restores anyway
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (window.location.hash) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
window.scrollTo(0, 0);
window.addEventListener('beforeunload', () => window.scrollTo(0, 0));

createRoot(document.getElementById('root')).render(<App />);
