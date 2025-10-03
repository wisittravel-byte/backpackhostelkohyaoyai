(function(){
  // --- Simple front-only guard (replace with real server auth later) ---
  try{
    const sess = localStorage.getItem('admin_auth');
    if(!sess){
      // not signed in: go to login
      window.location.replace('./login.html');
      return;
    }
  }catch(_){ /* ignore */ }
  // Utility
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const fmtTHB = n => `฿${(n||0).toLocaleString('th-TH')}`;
  const today = new Date();
  const ymd = d=> [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');

  // Mock data
  const rooms = [
    {no:'101', type:'Standard', cap:2, status:'clean'},
    {no:'102', type:'Deluxe', cap:2, status:'clean'},
    {no:'201', type:'Family', cap:4, status:'dirty'},
    {no:'D1', type:'Dorm', cap:6, status:'in'},
  ];
  const bookings = [
    {id:'B0001', guest:'Somchai P.', room:'101', ci:'2025-10-02', co:'2025-10-04', nights:2, status:'Confirmed', total:2999*2},
    {id:'B0002', guest:'Ananya K.', room:'102', ci:'2025-10-02', co:'2025-10-03', nights:1, status:'Checked-in', total:3499},
    {id:'B0003', guest:'Group Dorm', room:'D1', ci:'2025-10-03', co:'2025-10-05', nights:2, status:'Pending', total:1999*2},
  ];
  const payments = [
    {inv:'#INV-001', guest:'Somchai P.', amount:5998, status:'Paid', date:'2025-10-02'},
    {inv:'#INV-002', guest:'Ananya K.', amount:3499, status:'Due', date:'2025-10-03'},
  ];

  // Router
  function goto(section){
    $$('#sidenav a').forEach(a=> a.classList.toggle('active', a.dataset.goto===section));
    $$('section[data-section]').forEach(s=> s.classList.toggle('active', s.dataset.section===section));
    $('#pageTitle').textContent = $(`#sidenav a[data-goto="${section}"]`).textContent;
    window.location.hash = section;
  }
  $$('#sidenav a').forEach(a => a.addEventListener('click', e=>{ e.preventDefault(); goto(a.dataset.goto); }));

  // Badges
  const rangeBadge = $('#dateRangeBadge');
  const d0 = new Date(); const d1 = new Date(); d1.setDate(d1.getDate()+7);
  rangeBadge.textContent = `${ymd(d0)} – ${ymd(d1)}`;
  $('#todayBadge').textContent = ymd(new Date());
  $('#checkToday').textContent = ymd(new Date());

  // Renders
  function renderDashboard(){
    const totalRooms = rooms.length;
    const occupied = bookings.filter(b=> b.status==='Checked-in').length;
    const occPct = Math.round( (occupied/Math.max(1,totalRooms))*100 );
    $('#kpiOcc').textContent = `${occPct}%`;
    const rev7 = payments.reduce((s,p)=> s + (p.status==='Paid'?p.amount:0), 0);
    $('#kpiRev').textContent = fmtTHB(rev7);
    const adr = Math.round(bookings.reduce((s,b)=> s + (b.total/(b.nights||1)), 0) / Math.max(1, bookings.length));
    $('#kpiAdr').textContent = fmtTHB(adr);

    const tbIn = $('#tblTodayIn tbody'); tbIn.innerHTML='';
    const tbOut = $('#tblTodayOut tbody'); tbOut.innerHTML='';
    bookings.filter(b=> b.ci===ymd(today)).forEach(b=>{
      tbIn.insertAdjacentHTML('beforeend', `<tr><td>14:00</td><td>${b.guest}</td><td>${b.room}</td><td>${b.nights}</td><td><button class="btn outline">Check‑in</button></td></tr>`);
    });
    bookings.filter(b=> b.co===ymd(today)).forEach(b=>{
      tbOut.insertAdjacentHTML('beforeend', `<tr><td>12:00</td><td>${b.guest}</td><td>${b.room}</td><td>${fmtTHB(0)}</td><td><button class="btn outline">Check‑out</button></td></tr>`);
    });
  }

  function renderCalendar(monthOffset=0){
    const base = new Date(today.getFullYear(), today.getMonth()+monthOffset, 1);
    const title = base.toLocaleString('en-US', {month:'long', year:'numeric'});
    $('#calTitle').textContent = title;
    const grid = $('#calendarGrid'); grid.innerHTML='';
    const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    dows.forEach(d=> grid.insertAdjacentHTML('beforeend', `<div class="cell dow">${d}</div>`));
    const start = new Date(base); start.setDate(1 - start.getDay());
    for(let i=0;i<42;i++){
      const d = new Date(start); d.setDate(start.getDate()+i);
      const inMonth = d.getMonth()===base.getMonth();
      const day = d.getDate();
      const id = ymd(d);
      const bs = bookings.filter(b=> id>=b.ci && id<b.co);
      grid.insertAdjacentHTML('beforeend', `<div class="cell" style="background:${inMonth?'#fff':'#f9fafa'}"><div class="muted" style="font-size:12px">${day}</div>${bs.map(b=>`<div class=\"pill\" title=\"${b.guest} ${b.room}\">${b.room}</div>`).join('')}</div>`);
    }
  }

  function renderRooms(){
    const tb = $('#tblRooms tbody'); tb.innerHTML='';
    const type = $('#roomTypeFilter').value;
    const allRooms = [ ...rooms ];
    allRooms.filter(r=> !type || r.type===type).forEach(r=>{
      tb.insertAdjacentHTML('beforeend', `<tr><td>${r.no}</td><td>${r.type}</td><td>${r.cap}</td><td><span class=\"status ${r.status==='clean'?'ok': r.status==='dirty'?'bad':'warn'}\">${r.status}</span></td><td><button class=\"btn ghost\" data-edit=\"${r.no}\">Edit</button></td></tr>`)
    });
  }

  function renderBookings(){
    const tb = $('#tblBookings tbody'); tb.innerHTML='';
    const q = ($('#bookingSearch').value||'').toLowerCase();
    const st = $('#bookingStatus').value;
    bookings.filter(b=> (!st || b.status===st) && (!q || b.guest.toLowerCase().includes(q) || (b.room||'').toLowerCase().includes(q))).forEach(b=>{
      tb.insertAdjacentHTML('beforeend', `<tr><td>${b.id}</td><td>${b.guest}</td><td>${b.room}</td><td>${b.ci} → ${b.co}</td><td>${b.nights}</td><td>${b.status}</td><td>${fmtTHB(b.total)}</td><td><button class=\"btn ghost\">Open</button></td></tr>`);
    });
  }

  function renderCheck(){
    const tbIn = $('#tblDueIn tbody'); tbIn.innerHTML='';
    const tbOut = $('#tblDueOut tbody'); tbOut.innerHTML='';
    bookings.filter(b=> b.ci===ymd(today)).forEach(b=> tbIn.insertAdjacentHTML('beforeend', `<tr><td>14:00</td><td>${b.guest}</td><td>${b.room}</td><td><button class=\"btn outline\">Check‑in</button></td></tr>`));
    bookings.filter(b=> b.co===ymd(today)).forEach(b=> tbOut.insertAdjacentHTML('beforeend', `<tr><td>12:00</td><td>${b.guest}</td><td>${b.room}</td><td><button class=\"btn outline\">Check‑out</button></td></tr>`));
  }

  function renderHK(){
    const tb = $('#tblHK tbody'); tb.innerHTML='';
    const f = $('#hkFilter').value;
    rooms.filter(r=> !f || (f==='dirty' && r.status==='dirty') || (f==='clean' && r.status==='clean') || (f==='in' && r.status==='in')).forEach(r=>{
      tb.insertAdjacentHTML('beforeend', `<tr><td>${r.no}</td><td>${r.status}</td><td>${r.status==='dirty'?'Bee':'—'}</td><td>${r.status==='dirty'? '2025-09-30' : '2025-10-01'}</td><td><button class=\"btn ghost\" data-toggle=\"${r.no}\">Toggle Clean</button></td></tr>`)
    });
  }

  function renderGuests(){
    const tb = $('#tblGuests tbody'); tb.innerHTML='';
    const q = ($('#guestSearch').value||'').toLowerCase();
    const list = [ {name:'Somchai P.', phone:'081-234-5678', email:'somchai@example.com', history:3}, {name:'Ananya K.', phone:'089-111-2222', email:'ananya@example.com', history:1} ];
    list.filter(g=> !q || g.name.toLowerCase().includes(q)).forEach(g=> tb.insertAdjacentHTML('beforeend', `<tr><td>${g.name}</td><td>${g.phone}</td><td>${g.email}</td><td>${g.history} stays</td><td><button class=\"btn ghost\">Open</button></td></tr>`));
  }

  function renderPricing(){
    const tb = $('#tblPricing tbody'); tb.innerHTML='';
    const pricing = [ {rule:'Weekend', dates:'Fri–Sun', type:'Deluxe', rate:3499}, {rule:'Low Season', dates:'May–Jun', type:'Standard', rate:2499} ];
    pricing.forEach(p=> tb.insertAdjacentHTML('beforeend', `<tr><td>${p.rule}</td><td>${p.dates}</td><td>${p.type}</td><td>${fmtTHB(p.rate)}</td><td><button class=\"btn ghost\">Edit</button></td></tr>`));
  }

  function renderPayments(){
    const tb = $('#tblPayments tbody'); tb.innerHTML='';
    const f = $('#payFilter').value;
    const list = [ {inv:'#INV-001', guest:'Somchai P.', amount:5998, status:'Paid', date:'2025-10-02'}, {inv:'#INV-002', guest:'Ananya K.', amount:3499, status:'Due', date:'2025-10-03'} ];
    list.filter(p=> !f || p.status.toLowerCase()===f).forEach(p=> tb.insertAdjacentHTML('beforeend', `<tr><td>${p.inv}</td><td>${p.guest}</td><td>${fmtTHB(p.amount)}</td><td>${p.status}</td><td>${p.date}</td><td><button class=\"btn ghost\">Receipt</button></td></tr>`));
  }

  function renderReports(){
    const occ = Math.round((bookings.filter(b=> b.status==='Checked-in').length / Math.max(rooms.length,1))*100);
    $('#rOcc').textContent = `${isFinite(occ)?occ:0}%`;
    const adr = Math.round(bookings.reduce((s,b)=> s + b.total/b.nights,0) / Math.max(1,bookings.length));
    $('#rAdr').textContent = fmtTHB(isFinite(adr)?adr:0);
    const revpar = Math.round((bookings.reduce((s,b)=> s + b.total,0) / Math.max(1, rooms.length)));
    $('#rRevpar').textContent = fmtTHB(isFinite(revpar)?revpar:0);
    const counts = bookings.reduce((m,b)=>{ m[b.room.startsWith('D')?'Dorm':'Standard']=(m[b.room.startsWith('D')?'Dorm':'Standard']||0)+1; return m; }, {});
    $('#rTopRoomTypes').textContent = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=> `${k}: ${v}`).join(' · ');
  }

  function renderUsers(){
    const tb = $('#tblUsers tbody'); tb.innerHTML='';
    const users = [ {name:'Owner', role:'Owner', login:'owner@hotel'}, {name:'Mai', role:'Front Desk', login:'mai@hotel'}, {name:'Bee', role:'Housekeeping', login:'bee@hotel'} ];
    users.forEach(u=> tb.insertAdjacentHTML('beforeend', `<tr><td>${u.name}</td><td>${u.role}</td><td>${u.login}</td><td><button class=\"btn ghost\">Reset</button></td></tr>`));
  }

  // Events
  $('#roomTypeFilter')&&$('#roomTypeFilter').addEventListener('change', renderRooms);
  $('#bookingSearch')&&$('#bookingSearch').addEventListener('input', renderBookings);
  $('#bookingStatus')&&$('#bookingStatus').addEventListener('change', renderBookings);
  $('#guestSearch')&&$('#guestSearch').addEventListener('input', renderGuests);
  $('#hkFilter')&&$('#hkFilter').addEventListener('change', renderHK);
  $('#payFilter')&&$('#payFilter').addEventListener('change', renderPayments);

  let calOffset=0; $('#prevMonth')&&$('#prevMonth').addEventListener('click',()=>{calOffset--; renderCalendar(calOffset)});
  $('#nextMonth')&&$('#nextMonth').addEventListener('click',()=>{calOffset++; renderCalendar(calOffset)});

  // Room form
  $('#btnAddRoom')&&$('#btnAddRoom').addEventListener('click', ()=>{ $('#roomFormCard').style.display='block'; $('#roomFormTitle').textContent='New Room'; $('#fRoomNo').value=''; $('#fRoomType').value='Standard'; $('#fRoomCap').value=2; $('#fRoomAmen').value=''; $('#fRoomNotes').value=''; });
  $('#roomFormClose')&&$('#roomFormClose').addEventListener('click', ()=> $('#roomFormCard').style.display='none');
  $('#roomFormSave')&&$('#roomFormSave').addEventListener('click', ()=>{
    const r = {no: $('#fRoomNo').value.trim(), type: $('#fRoomType').value, cap: Number($('#fRoomCap').value||2), status:'clean'};
    if(!r.no){ alert('Room No. required'); return; }
    const i = rooms.findIndex(x=> x.no===r.no);
    if(i>=0) rooms[i] = {...rooms[i], ...r}; else rooms.push(r);
    $('#roomFormCard').style.display='none'; renderRooms();
  });

  // Global search
  $('#globalSearch')&&$('#globalSearch').addEventListener('keydown', e=>{ if(e.key==='Enter'){ goto('bookings'); renderBookings(); }});

  // Init
  function init(){
    const hash = (window.location.hash||'').replace('#','') || 'dashboard';
    if(hash === 'logout'){
      try{ localStorage.removeItem('admin_auth'); }catch(_){}
      window.location.replace('./login.html');
      return;
    }
    goto(hash);
    renderDashboard();
    renderCalendar();
    renderRooms();
    renderBookings();
    renderCheck();
    renderHK();
    renderGuests();
    renderPricing();
    renderPayments();
    renderReports();
    renderUsers();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
