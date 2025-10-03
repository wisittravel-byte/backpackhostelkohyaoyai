(function(){
  // try multiple candidate paths so header loads when opened via server or file://
  // Try many variants to tolerate different server roots, relative opens (file://), and .htm vs .html
  const candidates = [
    '/assets/includes/header.html',
    'assets/includes/header.html',
    '../assets/includes/header.html',
    './assets/includes/header.html',
    './includes/header.html',
    '/includes/header.html',
    'assets/includes/header.htm',
    '../assets/includes/header.htm',
    './assets/includes/header.htm',
    '/assets/includes/header.htm',
    './includes/header.htm',
    '/includes/header.htm'
  ];

  async function tryFetch(url){
    try{
      const res = await fetch(url);
      if(res && res.ok) return await res.text();
    }catch(e){ /* ignore and try next */ }
    return null;
  }

  async function loadHeader(){
    try{
      const container = document.querySelector('.site-header');
      if(!container) return console.warn('No .site-header container found to inject shared header');
      console.debug('load-shared-header: attempting to load shared header. candidates=', candidates);
      for(const url of candidates){
        const html = await tryFetch(url);
        if(html){
          // Note: Seeing 404s for earlier candidates during dev is expected
          // when the current server root doesn't contain that path.
          console.info('load-shared-header: loaded header from', url);
          container.innerHTML = html;
          // signal that header is ready for page scripts on next macrotask so other deferred scripts can bind
          setTimeout(()=>{
            try{ window.sharedHeaderLoaded = true; }catch(e){}
            try{ document.dispatchEvent(new CustomEvent('sharedHeaderLoaded')); }catch(e){}
            try{ if(window.applyLang) window.applyLang(window.currentLang); }catch(e){}
            try{ if(window.wireLangButtons) window.wireLangButtons(); }catch(e){}
            try{
              // mark active nav based on current location
              const here = location.pathname.split('/').pop() || 'index.html';
              document.querySelectorAll('#main-nav a').forEach(a=>{
                const href = a.getAttribute('href')||'';
                a.classList.toggle('active', href === here);
              });
            }catch(e){}
          }, 0);
          return;
        } else {
          // downgrade noise to debug; 404s for non-rooted paths are normal in local servers
          console.debug('load-shared-header: fetch failed for', url);
        }
      }
      // fallback: check for embedded header HTML (for file:// scenarios)
      if(window && window.__SHARED_HEADER_HTML){
        console.info('load-shared-header: using embedded fallback header (window.__SHARED_HEADER_HTML)');
        container.innerHTML = window.__SHARED_HEADER_HTML;
        setTimeout(()=>{
          try{ window.sharedHeaderLoaded = true; }catch(e){}
          try{ document.dispatchEvent(new CustomEvent('sharedHeaderLoaded')); }catch(e){}
          try{ if(window.applyLang) window.applyLang(window.currentLang); }catch(e){}
          try{ if(window.wireLangButtons) window.wireLangButtons(); }catch(e){}
        },0);
        return;
      }
      console.warn('Could not load shared header from any candidate path:', candidates);
    }catch(e){console.error('load-shared-header', e)}
  }

  // Extra safety: after DOMContentLoaded, if .site-header is still empty, try the embedded fallback once more.
  function extraFallbackCheck(){
    try{
      const container = document.querySelector('.site-header');
      if(!container) return;
      if(container.innerHTML && container.innerHTML.trim().length>0) return; // already injected
      if(window && window.__SHARED_HEADER_HTML){
        console.info('load-shared-header: extraFallbackCheck injecting embedded header');
  container.innerHTML = window.__SHARED_HEADER_HTML;
  try{ window.sharedHeaderLoaded = true; }catch(e){}
  document.dispatchEvent(new CustomEvent('sharedHeaderLoaded'));
        try{ if(window.applyLang) window.applyLang(window.currentLang); }catch(e){}
        try{ if(window.wireLangButtons) window.wireLangButtons(); }catch(e){}
      }
    }catch(e){/* ignore */}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', loadHeader); else loadHeader();
})();
