(function(){
  const box = document.getElementById('daterange');
  const ci = document.getElementById('checkin');
  const co = document.getElementById('checkout');
  if(!box || !ci || !co) return;

  // helpers
  const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate()+1);

  // initialize default values if empty
  if(!ci.value) ci.value = fmt(base);
  if(!co.value || co.value <= ci.value) co.value = fmt(next);
  box.value = `${ci.value} → ${co.value}`;

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
    box.value = `${s} → ${e}`;
  });
})();
