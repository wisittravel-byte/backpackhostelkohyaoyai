(function(){
  function tryGetElements(){
    var container = document.querySelector('.site-header');
    if(!container) return {};
    var headerRight = container.querySelector('.header-right');
    var toggle = headerRight && headerRight.querySelector('.menu-toggle');
    var nav = headerRight && headerRight.querySelector('#main-nav');
    return {container, headerRight, toggle, nav};
  }

  function init(){
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

    // Close when clicking link (useful on mobile)
    nav.addEventListener('click', function(e){
      var t = e.target;
      if(t && t.tagName === 'A') setOpen(false);
    });

    // Close on resize to desktop
    var mq = window.matchMedia('(min-width: 901px)');
    function handle(m){ if(m.matches) setOpen(false); }
    if(mq.addEventListener){ mq.addEventListener('change', handle); }
    else if(mq.addListener){ mq.addListener(handle); }
    handle(mq);
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
