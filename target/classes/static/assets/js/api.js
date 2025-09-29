// Simple API helper for frontend → backend calls
// Configure base URL via localStorage.setItem('api_base', 'http://localhost:8081')
// Default: localhost in dev; placeholder for GitHub Pages (override via localStorage)
(function(){
  const defaultBase = (location.hostname.endsWith('github.io'))
    ? 'https://YOUR-BACKEND-BASE' // TODO: set real backend URL when deployed
    : 'http://localhost:8081';
  const base = localStorage.getItem('api_base') || defaultBase;

  async function fetchJson(path, options){
    const res = await fetch(base + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options||{}));
    if(!res.ok){
      const text = await res.text();
      throw new Error('API '+res.status+': '+text);
    }
    const ct = res.headers.get('content-type')||'';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  window.API = { base, fetchJson };
})();
