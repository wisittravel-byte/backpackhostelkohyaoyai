// Simple API helper for frontend → backend calls
// Configure base URL via localStorage.setItem('api_base', 'http://localhost:8081')
// Default: localhost in dev; placeholder for GitHub Pages (override via localStorage)
(function(){
  const fromConfig = (window.CONFIG && window.CONFIG.apiBase) ? String(window.CONFIG.apiBase) : null;
  // Prefer same-origin when served via Apache/PHP; sanitize trailing dot if any
  const defaultBase = String(location.origin || '').replace(/\.$/, '');
  const base = (fromConfig || localStorage.getItem('api_base') || defaultBase).replace(/\.$/, '');

  function withTimeout(ms){
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(new DOMException('Timeout','AbortError')), ms);
    return { signal: controller.signal, cancel: () => clearTimeout(id) };
  }

  async function fetchJson(path, options){
    const opts = options || {};
    const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 4000;
    const { signal, cancel } = withTimeout(timeoutMs);
    try{
      // If path is relative ('./' or '/'), use it directly to preserve origin and avoid 'localhost./'
      const useDirect = /^\.|\//.test(path) || /^https?:\/\//i.test(path);
      const url = useDirect ? path : new URL(path, base).toString();
      const res = await fetch(url, Object.assign({
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal
      }, opts));
      if(!res.ok){
        const text = await res.text();
        throw new Error('API '+res.status+': '+text);
      }
      const ct = res.headers.get('content-type')||'';
      return ct.includes('application/json') ? res.json() : res.text();
    } finally {
      cancel();
    }
  }

  window.API = { base, fetchJson };
})();
