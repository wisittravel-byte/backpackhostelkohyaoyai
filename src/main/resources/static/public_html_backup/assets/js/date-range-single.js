(function(){
  const box = document.getElementById('daterange');
  const ci = document.getElementById('checkin');
  const co = document.getElementById('checkout');
  if(!box || !ci || !co) return;

  // helpers
  const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  const getLang = () => {
    try{
      const l = (window.currentLang || localStorage.getItem('lang') || document.documentElement.lang || 'th').toLowerCase();
      return l.startsWith('en') ? 'en' : 'th';
    }catch(_){ return 'th'; }
  };
  const toDate = (iso) => {
    try{ const [y,m,d] = String(iso).split('-').map(Number); return new Date(y, (m||1)-1, d||1); }catch(_){ return null; }
  };
  const fmtDisplay = (sISO, eISO) => {
    const L = getLang();
    const sd = toDate(sISO); const ed = toDate(eISO);
    if(!(sd && ed)) return `${sISO} 0 ${eISO}`; // fallback with arrow
    const locale = (L==='th') ? 'th-TH' : 'en-US';
    const optsTh = { day:'numeric', month:'short', year:'numeric' };
    const optsEn = { weekday:'short', day:'numeric', month:'short', year:'numeric' };
    const f = new Intl.DateTimeFormat(locale, L==='th'?optsTh:optsEn);
    return `${f.format(sd)} – ${f.format(ed)}`;
  };
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate()+1);

  // initialize default values if empty
  if(!ci.value) ci.value = fmt(base);
  if(!co.value || co.value <= ci.value) co.value = fmt(next);
  const refreshBox = () => { box.value = fmtDisplay(ci.value, co.value); };
  refreshBox();

  // Litepicker bound to a single input
  const picker = new Litepicker({
    element: box,
    singleMode: false,
    numberOfMonths: 2,
    numberOfColumns: 2,
    autoApply: true,
    selectForward: true,
    minDate: base,
    format: 'YYYY-MM-DD'
  });

  // initialize with existing range
  try { picker.setDateRange(ci.value, co.value, true); } catch(_){ }

  picker.on('selected', (start, end) => {
    if(!end) return;
    const s = start.format('YYYY-MM-DD');
    const e = end.format('YYYY-MM-DD');
    ci.value = s; co.value = e;
    refreshBox();
  });

  // Re-render localized text when user switches language
  try{
    const prev = window.applyLang;
    window.applyLang = function(lang){
      try{ if(typeof prev === 'function') prev(lang); }catch(_){ }
      refreshBox();
    };
  }catch(_){ }
})();
