(function(){
  function todayStr(){
    var d=new Date();
    var mm=(d.getMonth()+1).toString().padStart(2,'0');
    var dd=d.getDate().toString().padStart(2,'0');
    return d.getFullYear()+"-"+mm+"-"+dd;
  }
  function sel(x){ return (typeof x === 'string') ? document.querySelector(x) : x; }

  function wireDateConstraints(checkinSel, checkoutSel){
    var ci = sel(checkinSel || '#checkin');
    var co = sel(checkoutSel || '#checkout');
    if(!(ci && co)) return;

    // Rule 1: check-in >= today
    try{ ci.min = todayStr(); }catch(e){}

    function sync(){
      // keep checkout >= checkin (allow equal)
      try{
        co.min = ci.value || ci.min || todayStr();
        if(co.value && ci.value && co.value < ci.value){ co.value = ci.value; }
      }catch(e){}
    }
    ci.addEventListener('change', sync);
    // Also ensure consistency if user changes checkout first
    co.addEventListener('change', function(){
      try{
        if(ci.value && co.value && ci.value > co.value){ ci.value = co.value; }
        if(ci.min && ci.value && ci.value < ci.min){ ci.value = ci.min; }
      }catch(e){}
    });

    // Initial pass
    sync();
  }

  // Auto-wire on pages that have #checkin and #checkout
  function init(){ try{ wireDateConstraints('#checkin', '#checkout'); }catch(e){} }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // Expose for other pages if needed
  window.wireDateConstraints = wireDateConstraints;
})();
