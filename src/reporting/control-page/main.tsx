import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <div id="control-app">Jenkins Control Dashboard</div>
    </React.StrictMode>,
  );
}
