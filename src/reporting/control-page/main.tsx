import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
