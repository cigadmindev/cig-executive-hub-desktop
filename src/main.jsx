import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSentry } from './sentry';
import App from './App.jsx';
import './index.css';
import './lib/modalKeys';

initSentry();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
