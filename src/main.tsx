import React from 'react';
import ReactDOM from 'react-dom/client';
import './core/styles/tokens.css';
import App from './App';
import { preloadActivityData } from './core/hooks/useActivities';

preloadActivityData();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
