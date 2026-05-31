import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Suppress benign ResizeObserver loop notifications which trigger Webpack client overlays
window.addEventListener('error', (e) => {
  if (
    e.message && (
      e.message.includes('ResizeObserver loop limit exceeded') ||
      e.message.includes('ResizeObserver loop completed with undelivered notifications')
    )
  ) {
    e.stopImmediatePropagation();
  }
});

window.addEventListener('unhandledrejection', (e) => {
  if (
    e.reason &&
    e.reason.message && (
      e.reason.message.includes('ResizeObserver loop limit exceeded') ||
      e.reason.message.includes('ResizeObserver loop completed with undelivered notifications')
    )
  ) {
    e.stopImmediatePropagation();
  }
});


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
