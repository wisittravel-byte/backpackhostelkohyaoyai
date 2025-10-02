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
    // If served by backend (e.g., http://localhost:8081/index.html), prefer same-origin
    window.CONFIG.apiBase = hosted ? 'https://YOUR-PROD-BACKEND' : (location.origin);
  }
})();
