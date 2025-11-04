// Runtime configuration for frontend -> backend base URL
// Override without rebuild by editing this file post-deploy.
// Example values:
//   window.CONFIG = { apiBase: 'https://api.example.com' };
//   window.CONFIG = { apiBase: 'https://backpackhostel.onrender.com' };
// Default keeps localhost for local preview and placeholder for GitHub Pages.
(function(){
  window.CONFIG = window.CONFIG || {};
  if(!window.CONFIG.apiBase){
    const hosted = (location.hostname.endsWith('github.io') || location.hostname.endsWith('.vercel.app') || location.hostname.endsWith('.netlify.app'));
    // If served by backend (e.g., http://localhost:8081/index.html), prefer same-origin.
    // If served by our local static server on 8080, default API to backend on 8083.
    if(!hosted && location.hostname === 'localhost' && location.port === '8080'){
      // Static local dev on 8080 → talk to PHP API on Apache (same host) by default
      // If you want to use Java on 8083 instead, override at runtime:
      //   localStorage.setItem('api_base', 'http://localhost:8083')
      window.CONFIG.apiBase = 'http://localhost';
    } else {
      // When served by Apache/PHP (no special port), use same-origin base
      window.CONFIG.apiBase = hosted ? 'https://YOUR-PROD-BACKEND' : location.origin;
    }
  }
})();
