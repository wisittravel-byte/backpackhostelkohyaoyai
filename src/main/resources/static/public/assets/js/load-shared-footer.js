(function(){
  // try multiple candidate paths so footer loads when opened via server or file://
  // Try many variants to tolerate different server roots, relative opens (file://), and .htm vs .html
  const candidates = [
    '/assets/includes/footer.html',
    'assets/includes/footer.html',
    '../assets/includes/footer.html',
    './assets/includes/footer.html',
    './includes/footer.html',
    '/includes/footer.html',
    'assets/includes/footer.htm',
    '../assets/includes/footer.htm',
    './assets/includes/footer.htm',
    '/assets/includes/footer.htm',
    './includes/footer.htm',
    '/includes/footer.htm'
  ];

  async function tryFetch(url){
    try{
      const res = await fetch(url);
      if(res && res.ok) return await res.text();
    }catch(e){ /* ignore and try next */ }
    return null;
  }

  async function loadFooter(){
    try{
      const container = document.querySelector('.site-footer');
      if(!container) return console.debug('No .site-footer container found to inject shared footer');
      console.debug('load-shared-footer: attempting to load shared footer. candidates=', candidates);
      for(const url of candidates){
        const html = await tryFetch(url);
        if(html){
          console.info('load-shared-footer: loaded footer from', url);
          container.innerHTML = html;
          // signal that footer is ready for page scripts
          document.dispatchEvent(new CustomEvent('sharedFooterLoaded'));
          return;
        } else {
          console.debug('load-shared-footer: fetch failed for', url);
        }
      }
      // fallback: check for embedded footer HTML (for file:// scenarios)
      if(window && window.__SHARED_FOOTER_HTML){
        console.info('load-shared-footer: using embedded fallback footer (window.__SHARED_FOOTER_HTML)');
        container.innerHTML = window.__SHARED_FOOTER_HTML;
        document.dispatchEvent(new CustomEvent('sharedFooterLoaded'));
        return;
      }
      console.warn('Could not load shared footer from any candidate path:', candidates);
    }catch(e){console.error('load-shared-footer', e)}
  }

  // Extra safety: after DOMContentLoaded, if .site-footer is still empty, try the embedded fallback once more.
  function extraFallbackCheck(){
    try{
      const container = document.querySelector('.site-footer');
      if(!container) return;
      if(container.innerHTML && container.innerHTML.trim().length>0) return; // already injected
      if(window && window.__SHARED_FOOTER_HTML){
        console.info('load-shared-footer: extraFallbackCheck injecting embedded footer');
        container.innerHTML = window.__SHARED_FOOTER_HTML;
        document.dispatchEvent(new CustomEvent('sharedFooterLoaded'));
      }
    }catch(e){/* ignore */}
  }

  // Prefer loading footer after header to ensure deterministic order. Wait for sharedHeaderLoaded (2s) then fall back.
  let started = false;
  function startLoad(){ if(started) return; started = true; loadFooter(); }
  if(window && window.sharedHeaderLoaded){ startLoad(); }
  document.addEventListener('sharedHeaderLoaded', startLoad);
  // fallback: if header never arrives, load footer after 2s
  setTimeout(()=> startLoad(), 2000);
})();
