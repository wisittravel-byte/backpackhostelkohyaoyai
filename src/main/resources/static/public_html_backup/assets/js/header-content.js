// Embedded fallback HTML for the shared header. Used when fetch() cannot load the partial (e.g., file:// openings).
window.__SHARED_HEADER_HTML = `
<header>
    <div class="brand" aria-label="brand">
    <div class="logo">BK</div>
    <div>
      <h1 id="site-title" data-i18n="header.title">Backpack Hostel Kohyaoyai</h1>
      <div class="muted" id="site-sub" data-i18n="header.subtitle">ที่พักสำหรับสายแบ็คแพ็ค ใจกลางเกาะยาวใหญ่</div>
    </div>
  </div>

  <div class="header-right">
    <nav aria-label="main navigation" id="main-nav">
  <a href="index.html" data-i18n="nav.home">หน้าแรก</a>
  <a href="booking.html" data-i18n="nav.booking">จองที่พัก</a>
  <a href="gallery.html" data-i18n="nav.gallery">แกลเลอรี</a>
  <a href="index.html#promo" data-i18n="nav.promo">โปรโมชั่น</a>
  <a href="index.html#ferry" data-i18n="nav.ferry">ตารางเดินเรือ</a>
  <a href="#footer" data-i18n="nav.contact">ติดต่อเรา</a>
    </nav>
    <div class="lang-toggle" role="group" aria-label="language toggle">
  <button id="thBtn" class="active" aria-pressed="true" data-lang="th">ไทย</button>
  <button id="enBtn" aria-pressed="false" data-lang="en">EN</button>
    </div>
  </div>
</header>
`;

/* Note: this file is intentionally simple. The loader will use window.__SHARED_HEADER_HTML when fetch fails. */
