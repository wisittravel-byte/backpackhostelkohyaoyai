(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const toYMD = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const addDays = (d, n) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  };

  // ตั้งค่าเริ่มต้น + เงื่อนไข co >= ci+1
  function initDefaults() {
    const ci = $('#checkin');
    const co = $('#checkout');
    if (!ci || !co) return;

    const today = new Date();
    ci.min = toYMD(today);
    if (!ci.value) ci.value = toYMD(today);

    const start = new Date(ci.value);
    const minCo = toYMD(addDays(start, 1));
    co.min = minCo;
    if (!co.value || co.value <= ci.value) co.value = minCo;

    ci.addEventListener('change', () => {
      const s = new Date(ci.value);
      const next = toYMD(addDays(s, 1));
      co.min = next;
      if (!co.value || co.value <= ci.value) co.value = next;
      co.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // ชื่อเดือนใช้เดาทั้งไทย/อังกฤษ
  const MONTHS = {
    en: ['january','february','march','april','may','june','july','august','september','october','november','december'],
    th: ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
  };

  function guessMonthYear(root) {
    // หา header ที่มีข้อความ "October 2025" หรือ "ตุลาคม 2025"
    const all = $$('*', root);
    for (const el of all) {
      if (!el.offsetParent) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t) continue;
      const yMatch = /(\d{4})/.exec(t);
      if (!yMatch) continue;
      const year = parseInt(yMatch[1], 10);
      for (const lang of Object.keys(MONTHS)) {
        const mi = MONTHS[lang].findIndex(m => t.includes(m));
        if (mi >= 0) return { monthIndex: mi, year };
      }
    }
    const now = new Date();
    return { monthIndex: now.getMonth(), year: now.getFullYear() };
  }

  // ประทับ data-date ให้ cell วันที่ (กรณีไม่มี)
  function stampDataDates(root) {
    if (!root) return;
    const { monthIndex, year } = guessMonthYear(root);

    const dayCells = $$('button, td, div', root).filter(el => {
      if (!el.offsetParent) return false;
      const txt = (el.textContent || '').trim();
      return /^[0-9]{1,2}$/.test(txt);
    });

    dayCells.forEach(el => {
      if (el.hasAttribute('data-date')) return;
      const d = parseInt((el.textContent || '').trim(), 10);
      if (!d || d > 31) return;
      const dt = new Date(year, monthIndex, d);
      el.setAttribute('data-date', toYMD(dt));
      el.classList.add('dp-day');
    });
  }

  function findCalendarRoot() {
    // มองหากล่องปฏิทินที่กำลังมองเห็น
    const byAttr = $$('[data-date]').filter(el => el.offsetParent);
    if (byAttr.length) return byAttr[0].closest('[class], [role]') || byAttr[0];

    // เผื่อยังไม่มี data-date ให้ลองหา overlay ที่เป็นปฏิทิน
    const panels = $$('body > div, .calendar, .datepicker, [role="dialog"], [role="listbox"]')
      .filter(el => el.offsetParent);
    return panels[0] || null;
  }

  // ลากเลือกช่วงบน fallback calendar
  function enableDragRange() {
    const ci = $('#checkin');
    const co = $('#checkout');
    if (!ci || !co) return;

    let dragging = false, startStr = null, root = null;

    const parseYMD = s => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    };
    const clearMarks = r => $$('[data-date]', r).forEach(el => el.classList.remove('is-start','is-end','is-inrange'));
    const markRange = (r, d1, d2) => {
      const a = parseYMD(d1), b = parseYMD(d2); if (!a || !b) return;
      const lo = a <= b ? a : b, hi = a <= b ? b : a;
      $$('[data-date]', r).forEach(cell => {
        const s = cell.getAttribute('data-date'); if (!s) return;
        const dt = parseYMD(s); if (!dt) return;
        cell.classList.toggle('is-inrange', dt >= lo && dt <= hi);
        cell.classList.toggle('is-start', toYMD(dt) === toYMD(a));
        cell.classList.toggle('is-end',   toYMD(dt) === toYMD(b));
      });
    };

    function attachWhenOpen(input) {
      const attach = () => {
        root = findCalendarRoot();
        if (!root) return;
        // ประทับ data-date ก่อน
        stampDataDates(root);

        root.addEventListener('mousedown', e => {
          const cell = e.target.closest('[data-date]'); if (!cell) return;
          dragging = true;
          startStr = cell.getAttribute('data-date');
          clearMarks(root);
          cell.classList.add('is-start','is-inrange');
          e.preventDefault();
        }, { passive: false });

        root.addEventListener('mouseover', e => {
          if (!dragging || !startStr) return;
          const cell = e.target.closest('[data-date]'); if (!cell) return;
          const endStr = cell.getAttribute('data-date');
          markRange(root, startStr, endStr);
        });

        root.addEventListener('mouseup', e => {
          if (!dragging || !startStr) return;
          const cell = e.target.closest('[data-date]');
          const endStr = cell?.getAttribute('data-date') || startStr;
          dragging = false;

          let a = parseYMD(startStr), b = parseYMD(endStr);
          if (!a || !b) return;
          if (a > b) [a, b] = [b, a];
          if (toYMD(a) === toYMD(b)) b = addDays(a, 1); // อย่างน้อย 1 คืน

          // เซ็ตค่าอินพุต: เช่นลาก 6→9 → ci=6, co=9
          ci.value = toYMD(a);
          co.min   = toYMD(addDays(a, 1));
          co.value = toYMD(b);

          ci.dispatchEvent(new Event('change', { bubbles: true }));
          co.dispatchEvent(new Event('change', { bubbles: true }));
        });

        document.addEventListener('mouseup', () => { dragging = false; }, { once: true });
      };

      input.addEventListener('focus', attach, { once: true });
      input.addEventListener('click',  attach, { once: true });
    }

    attachWhenOpen(ci);
    attachWhenOpen(co);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initDefaults();
    enableDragRange();
  });
})();