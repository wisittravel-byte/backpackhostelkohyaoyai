(function () {
  const ci = document.getElementById('checkin');
  const co = document.getElementById('checkout');
  if (!ci || !co) return;

  // normalize to local midnight to avoid TZ edge cases
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrow = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');

  // set defaults if missing
  let defaulted = false;
  if (!ci.value) { ci.value = fmt(base); defaulted = true; }
  if (!co.value || co.value <= ci.value) { co.value = fmt(tomorrow); defaulted = true; }

  const picker = new Litepicker({
    element: ci,
    elementEnd: co,
    singleMode: false,
    numberOfMonths: 2,
    numberOfColumns: 2,
  autoApply: false,
    allowRepick: true,
    selectForward: true,
    minDate: base,
    format: 'YYYY-MM-DD',
    resetButton: false,
    hoveringTooltip: true
  });

  // Track state for optional first-click suggestion (used only when both inputs are empty)
  let firstClickSuggested = false;
  picker.on('show', () => { firstClickSuggested = false; try{ clearFake(); }catch(_){ } });
  picker.on('hide', () => { repickMode = null; detachDayClickInterceptor(); });

  // Repick mode: 'start' when opened from check-in, 'end' from check-out
  let repickMode = null;
  let awaitingStartFirstClick = false; // true immediately after clicking the Start input
  const parse = (s) => {
    if(!s) return null;
    const a = String(s).split('-');
    if(a.length!==3) return null;
    const y = Number(a[0]), m = Number(a[1])-1, d = Number(a[2]);
    return new Date(y,m,d);
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);

  // UX tweak: when user starts a new selection (first click with no end yet),
  // show a provisional 1-night range (start + 1 day) but keep the picker open.
  // We do this silently so it doesn't trigger autoApply/close.
  picker.on('preselect', (start, end) => {
    try {
      // Repick START: first click should clear previous range and show only the new start day
      if (repickMode === 'start' && start && !end) {
        try { picker.setDate(start.toDate(), true); } catch(_){ }
        // Do NOT update inputs or close picker yet; wait for user to pick end
        return;
      }
      // Repick END: if both start & end visible in preview, finalize immediately
      if (repickMode === 'end' && start && end) {
        let sD = start.toDate();
        let eD = end.toDate();
        if (eD <= sD) eD = addDays(sD,1);
        picker.setDateRange(sD, eD, true);
        ci.value = fmt(sD);
        co.value = fmt(eD);
        picker.hide();
        repickMode = null;
        return;
      }
      // First click suggestion ONLY when both inputs are empty (not typical on index page)
      if (!repickMode && start && !end && !firstClickSuggested && !ci.value && !co.value) {
        const next = start.clone().add(1, 'day');
        picker.setDateRange(start, next, true); // silent UI update
        firstClickSuggested = true;
      }
    } catch (_) { /* no-op */ }
  });

  picker.on('selected', (start, end) => {
    // If we're in Start repick and this is the very first day user clicked,
    // convert it to a single-day start highlight and keep the picker open.
    if (repickMode === 'start' && awaitingStartFirstClick) {
      awaitingStartFirstClick = false;
      try {
        const chosen = (end ? end : start).toDate();
        // Defer to next tick so we override Litepicker's internal 2-day pairing
        setTimeout(() => {
          try { picker.clearSelection(); picker.setDate(chosen, true); } catch(_){ }
        }, 0);
      } catch(_){ }
      return; // don't close, don't update inputs yet
    }
    // If user selected only the start date, keep the picker open and wait for end
    if (!end) return;
    // Enforce at least 1 night even if same day somehow occurs
    if (start.format('YYYY-MM-DD') === end.format('YYYY-MM-DD')) {
      const next = start.clone().add(1, 'day');
      picker.setDateRange(start, next, true);
      end = next;
    }
    ci.value = start.format('YYYY-MM-DD');
    co.value = end.format('YYYY-MM-DD');
    try{ picker.hide(); }catch(_){ }
  });

  // initialize picker range (use defaults if just applied)
  picker.setDateRange(ci.value || fmt(base), co.value || fmt(tomorrow), true);

  // show picker only on CLICK (not focus) to avoid auto-reopen after selection
  ['click'].forEach(evt => {
    ci.addEventListener(evt, () => {
      repickMode = 'start';
      awaitingStartFirstClick = true;
      // For requirement 2.1: open with the actual selected range highlighted (e.g., 2–3 Oct)
      try{ picker.setDateRange(ci.value || fmt(base), co.value || fmt(tomorrow), true); }catch(_){ }
      picker.show();
      // Do NOT attach interceptors or fake overlays while we focus on 2.1 correctness
    });
    co.addEventListener(evt, () => {
      repickMode = 'end';
      awaitingStartFirstClick = false;
      try{ picker.setDateRange(ci.value || fmt(base), co.value || fmt(tomorrow), true); }catch(_){ }
      picker.show();
      detachDayClickInterceptor();
    });
  });

  // Intercept the first actual day click after opening from Start to force single-day start
  let dayClickHandler = null;
  let dayPointerHandler = null;
  let docCaptureHandler = null;
  function attachDayClickInterceptor(){
    try{
      let root = document.querySelector('.litepicker');
      if(!root){
        // delay one tick if UI not yet rendered
        return setTimeout(attachDayClickInterceptor, 0);
      }
      if(dayClickHandler) root.removeEventListener('click', dayClickHandler, true);
      if(dayPointerHandler){
        root.removeEventListener('pointerdown', dayPointerHandler, true);
        root.removeEventListener('mousedown', dayPointerHandler, true);
      }
      dayClickHandler = function(e){
        if(repickMode !== 'start' || !awaitingStartFirstClick) return;
        const cell = e.target && e.target.closest ? e.target.closest('.day-item') : null;
        if(!cell) return;
        if(cell.classList.contains('is-locked') || cell.classList.contains('is-disabled')) return;
        const ts = Number(cell.getAttribute('data-time'));
        if(!ts) return;
        // Do nothing on click; pointerdown capture already cleared selection.
        // Let Litepicker process this click normally (it will set start only).
      };
      dayPointerHandler = function(e){
        if(repickMode !== 'start' || !awaitingStartFirstClick) return;
        const cell = e.target && e.target.closest ? e.target.closest('.day-item') : null;
        if(!cell) return;
        if(cell.classList.contains('is-locked') || cell.classList.contains('is-disabled')) return;
        const ts = Number(cell.getAttribute('data-time'));
        if(!ts) return;
        // Clear any previous internal selection and fake overlay BEFORE Litepicker handles the click
        try { picker.clearSelection(); } catch(_){ }
        try { clearFake(); } catch(_){ }
        // Do not prevent default; allow Litepicker to set the start date from this click
      };
      root.addEventListener('click', dayClickHandler, true);
      root.addEventListener('pointerdown', dayPointerHandler, true);
      root.addEventListener('mousedown', dayPointerHandler, true);
      // Document-level capture as final guarantee
      if(docCaptureHandler) document.removeEventListener('pointerdown', docCaptureHandler, true);
      docCaptureHandler = function(e){
        if(repickMode !== 'start' || !awaitingStartFirstClick) return;
        const cell = e.target && e.target.closest ? e.target.closest('.day-item') : null;
        if(!cell) return;
        // Clear selection & fake overlay before Litepicker processes pointer chain
        try { picker.clearSelection(); } catch(_){ }
        try { clearFake(); } catch(_){ }
        // Do not prevent; let Litepicker handle and set start only
      };
      document.addEventListener('pointerdown', docCaptureHandler, true);
    }catch(_){ }
  }
  function detachDayClickInterceptor(){
    try{
      const root = document.querySelector('.litepicker');
      if(root && dayClickHandler) root.removeEventListener('click', dayClickHandler, true);
      if(root && dayPointerHandler){
        root.removeEventListener('pointerdown', dayPointerHandler, true);
        root.removeEventListener('mousedown', dayPointerHandler, true);
      }
      dayClickHandler = null;
      dayPointerHandler = null;
      if(docCaptureHandler){ document.removeEventListener('click', docCaptureHandler, true); docCaptureHandler = null; }
    }catch(_){ }
  }

  // Fake range overlay helpers (to satisfy 2.1 visual without committing selection)
  function getCellByDateStr(yyyy_mm_dd){
    if(!yyyy_mm_dd) return null;
    const parts = yyyy_mm_dd.split('-'); if(parts.length!==3) return null;
    const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
    const local = new Date(y, m, d).getTime();
    const utc = Date.UTC(y, m, d);
    const root = document.querySelector('.litepicker'); if(!root) return null;
    return (
      root.querySelector(`.day-item[data-time="${local}"]`) ||
      root.querySelector(`.day-item[data-time="${utc}"]`)
    );
  }
  function clearFake(){
    const root = document.querySelector('.litepicker'); if(!root) return;
    root.querySelectorAll('.day-item[data-fake="1"]').forEach(el=>{
      el.classList.remove('is-start-date','is-end-date','is-in-range');
      el.removeAttribute('data-fake');
    });
  }
  function drawFakeDefaultRange(){
    clearFake();
    const startStr = ci.value; const endStr = co.value;
    const root = document.querySelector('.litepicker'); if(!root) return;
    const startCell = getCellByDateStr(startStr);
    const endCell = getCellByDateStr(endStr);
    if(startCell){ startCell.classList.add('is-start-date'); startCell.setAttribute('data-fake','1'); }
    if(endCell){ endCell.classList.add('is-end-date'); endCell.setAttribute('data-fake','1'); }
    // mark in-range days if any
    try{
      const startTs = startCell ? Number(startCell.getAttribute('data-time')) : null;
      const endTs = endCell ? Number(endCell.getAttribute('data-time')) : null;
      if(startTs && endTs && endTs>startTs){
        const cells = root.querySelectorAll('.day-item[data-time]');
        cells.forEach(c=>{
          const t = Number(c.getAttribute('data-time'));
          if(t>startTs && t<endTs){ c.classList.add('is-in-range'); c.setAttribute('data-fake','1'); }
        });
      }
    }catch(_){ }
  }

  // Force single-day highlight visually by removing previous range classes
  function forceSingleHighlight(ts){
    const root = document.querySelector('.litepicker');
    if(!root) return;
    root.querySelectorAll('.day-item').forEach(el=>{
      el.classList.remove('is-start-date','is-end-date','is-in-range');
    });
    const target = root.querySelector(`.day-item[data-time="${ts}"]`);
    if(target){
      target.classList.add('is-start-date','is-end-date');
    }
  }
  function toggleFooterSelectedText(hide){
    const root = document.querySelector('.litepicker');
    if(!root) return;
    const footerSel = root.querySelector('.footer .selected');
    if(footerSel){ footerSel.style.visibility = hide ? 'hidden' : 'visible'; }
  }

  // safety: if some script cleared values later, re-apply minimal defaults on first focus
  const ensureDefaults = () => {
    if (!ci.value) ci.value = fmt(base);
    if (!co.value || co.value <= ci.value) co.value = fmt(tomorrow);
  };
  ci.addEventListener('focus', ensureDefaults, { once: true });
  co.addEventListener('focus', ensureDefaults, { once: true });
})();