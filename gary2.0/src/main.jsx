import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Import design system CSS first to establish variables
import './styles/design-system.css'
import './styles/base.css'
// Import error prevention CSS to ensure no white backgrounds appear
import './styles/consolidated/error-prevention.css'

// Preload fonts
const fontUrls = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap'
];

fontUrls.forEach(url => {
  const link = document.createElement('link');
  link.href = url;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
