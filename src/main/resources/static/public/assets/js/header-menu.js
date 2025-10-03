(function(){
  var __wired = false;
  // Global helper so clicking any link to #footer works even if header init fails
  function scrollToFooter(){
    function go(){
      try{
        var el = document.getElementById('footer');
        if(el){ el.scrollIntoView({behavior:'smooth', block:'start'}); return true; }
      }catch(_){ }
      return false;
    }
    if(go()) return;
    function onLoaded(){ if(go()) document.removeEventListener('sharedFooterLoaded', onLoaded); }
    document.addEventListener('sharedFooterLoaded', onLoaded);
    try{ history.replaceState(null, '', '#footer'); }catch(_){ try{ location.hash = '#footer'; }catch(__){} }
  }

  // Universal click interception for any anchor that targets #footer, even outside nav
  document.addEventListener('click', function(e){
    try{
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if(!a || a.tagName !== 'A') return;
      var href = (a.getAttribute('href')||'').trim();
      // Match #footer, index.html#footer, /#footer, and any same-page hash ending with #footer
      var isFooterLink = href === '#footer' || /#footer(\?|$)/.test(href);
      if(!isFooterLink) return;
      // Prevent default navigation and perform smooth scroll/deferred scroll
      if(e && typeof e.preventDefault === 'function') e.preventDefault();
      scrollToFooter();
    }catch(_){ /* ignore */ }
  }, true);

  // Global interception for index anchors when already on index page (Home/Ferry/Promo)
  document.addEventListener('click', function(e){
    try{
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if(!a || a.tagName !== 'A') return;
      var href = (a.getAttribute('href')||'').trim();
      var here = (location.pathname.split('/').pop() || 'index.html');
      if(here !== 'index.html') return;
      function smoothTo(id, newHash){
        var el = document.getElementById(id);
        if(!el) return false;
        e && e.preventDefault && e.preventDefault();
        el.scrollIntoView({behavior:'smooth', block:'start'});
        try{ history.replaceState(null, '', newHash ? ('#'+newHash) : 'index.html'); }catch(_){ }
        return true;
      }
      if(href === 'index.html' || href === '#home' || /index\.html#home(\?|$)/.test(href)){
        if(smoothTo('home', 'home')) return;
      }
      if(href === '#ferry' || /index\.html#ferry(\?|$)/.test(href)){
        if(smoothTo('ferry', 'ferry')) return;
      }
      if(href === '#promo' || /index\.html#promo(\?|$)/.test(href)){
        if(smoothTo('promo', 'promo')) return;
      }
    }catch(_){ /* ignore */ }
  }, true);
  function tryGetElements(){
    var container = document.querySelector('.site-header');
    if(!container) return {};
    var headerRight = container.querySelector('.header-right');
    var toggle = headerRight && headerRight.querySelector('.menu-toggle');
    var nav = headerRight && headerRight.querySelector('#main-nav');
    return {container, headerRight, toggle, nav};
  }

  function init(){
    if(__wired) return true; // already initialized
    var els = tryGetElements();
    var headerRight = els.headerRight, toggle = els.toggle, nav = els.nav;
    if(!headerRight || !toggle || !nav) return false;

    function setOpen(open){
      headerRight.setAttribute('data-menu-open', String(!!open));
      toggle.setAttribute('aria-expanded', String(!!open));
    }
    setOpen(false);

    // Toggle on click
    toggle.addEventListener('click', function(){
      var open = headerRight.getAttribute('data-menu-open') === 'true';
      setOpen(!open);
    });

    // Close when pressing Escape
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') setOpen(false);
    });

    // Close when clicking outside the header area (on mobile)
    document.addEventListener('click', function(e){
      try{
        if(headerRight.getAttribute('data-menu-open') !== 'true') return;
        var headerEl = els.container && els.container.querySelector('header');
        if(!headerEl) return;
        if(!headerEl.contains(e.target)) setOpen(false);
      }catch(_){}
    });

    // Handle nav clicks; setOpen(false) and rely on global footer handler for #footer

    // Close when clicking link (useful on mobile) and handle in-page scrolls
    nav.addEventListener('click', function(e){
      var a = e.target && e.target.closest ? e.target.closest('a') : e.target;
      if(a && a.tagName === 'A'){
        setOpen(false);
        var href = a.getAttribute('href') || '';
        // Smooth-scroll on current page for anchors to avoid reloads (and noisy dev CSP warnings)
        try{
          var isIndex = (location.pathname.split('/').pop() || 'index.html') === 'index.html';
          if(isIndex){
            if(href === 'index.html' || href === '#home' || /index\.html#home(\?|$)/.test(href)){
              if(e && e.preventDefault) e.preventDefault();
              var home = document.getElementById('home');
              if(home) home.scrollIntoView({behavior:'smooth', block:'start'}); else window.scrollTo({top:0, behavior:'smooth'});
              try{ history.replaceState(null, '', '#home'); }catch(_){ }
              return;
            }
            if(href === '#ferry' || /index\.html#ferry(\?|$)/.test(href)){
              if(e && e.preventDefault) e.preventDefault();
              var fer = document.getElementById('ferry');
              if(fer) fer.scrollIntoView({behavior:'smooth', block:'start'});
              try{ history.replaceState(null, '', '#ferry'); }catch(_){ }
              return;
            }
            if(href === '#promo' || /index\.html#promo(\?|$)/.test(href)){
              if(e && e.preventDefault) e.preventDefault();
              var pro = document.getElementById('promo');
              if(pro) pro.scrollIntoView({behavior:'smooth', block:'start'});
              try{ history.replaceState(null, '', '#promo'); }catch(_){ }
              return;
            }
          }
        }catch(_){ }
        // footer links are handled by the global listener above
      }
    });

    // Close on resize to desktop
    var mq = window.matchMedia('(min-width: 901px)');
    function handle(m){ if(m.matches) setOpen(false); }
    if(mq.addEventListener){ mq.addEventListener('change', handle); }
    else if(mq.addListener){ mq.addListener(handle); }
    handle(mq);
    __wired = true;
    return true;
  }

  // Run after shared header injection
  document.addEventListener('sharedHeaderLoaded', function(){
    if(!init()){
      // slight delay retry in case styles/DOM settle later
      setTimeout(init, 50);
    }
  });
  if(document.readyState !== 'loading'){
    if(!init()) setTimeout(init, 50);
  } else {
    document.addEventListener('DOMContentLoaded', function(){ if(!init()) setTimeout(init, 50); });
  }
})();
