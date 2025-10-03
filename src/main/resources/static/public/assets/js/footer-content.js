// Embedded fallback HTML for the shared footer. Used when fetch() cannot load the partial (e.g., file:// openings).
window.__SHARED_FOOTER_HTML = `
<footer>
  <div class="footer-grid">
    <div>
      <strong>Backpack Hostel Kohyaoyai</strong>
      <div class="muted">ที่พักสำหรับสายแบ็คแพ็ค ใจกลางเกาะยาวใหญ่</div>
    </div>
    <div>
      <strong data-i18n=\"footer.contact\">ติดต่อเรา</strong>
      <div class="muted">Email: info@example.com<br/>Phone: +66 83 550 6600<br/>Map: <a href="https://maps.app.goo.gl/jT25nBHhT7DcMFha8" target="_blank" rel="noopener">Google Maps</a></div>
    </div>
    <div>
      <strong>Google Review</strong>
      <div class="muted"><a href="https://search.google.com/local/reviews?placeid=ChIJQehIjW62UTARlgqzW32zuBo" target="_blank" rel="noopener">Open reviews on Google</a></div>
    </div>
  </div>
  <div style="text-align:center;margin-top:14px;font-size:13px;color:var(--muted)">2025 Backpack Hostel Kohyaoya - All Rights Reserved.</div>
</footer>
`;

/* The loader script will use window.__SHARED_FOOTER_HTML when fetch fails. */
