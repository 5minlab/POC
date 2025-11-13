(function(){
  'use strict';
  // Render Blacksmith stats in the right panel from Google Sheets A2:A12
  const sheetId = '1ElMWIti0qQiDmkDngQ6WffCzkGrL_72FH7rQLji6IOA';
  const gid = '1530173934';

  const panel = document.querySelector('.panel.right .stats-panel');
  const list = document.querySelector('.panel.right .stats-list');
  const errEl = document.querySelector('.panel.right .stats-error');
  if (!panel || !list) return;

  async function fetchCSVText(){
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&id=${sheetId}&gid=${gid}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`시트 로드 실패: ${res.status}`);
    return await res.text();
  }

  function parseFirstColumnRows(csvText, startRow, endRow){
    // Convert CRLF to LF, split lines (keep empty cells if line present)
    const lines = csvText.replace(/\r\n?/g, '\n').split('\n');
    // lines[0] is header; rows are 1-based in Sheets UI
    const out = [];
    for (let r = startRow; r <= endRow; r++){
      const idx = r - 1; // zero-based index into lines
      if (idx < 0 || idx >= lines.length) break;
      const line = lines[idx];
      if (typeof line !== 'string') continue;
      // Naive CSV split (no quotes support); take first column (A)
      const first = line.split(',')[0] ?? '';
      const val = first.trim();
      if (val) out.push(val);
    }
    return out;
  }

  function renderStats(items){
    list.innerHTML = '';
    if (!items || items.length === 0){
      const empty = document.createElement('div');
      empty.className = 'stat-row';
      empty.textContent = '표시할 능력치가 없습니다.';
      list.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((text) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const bullet = document.createElement('div');
      bullet.className = 'stat-bullet';
      const span = document.createElement('div');
      span.className = 'stat-text';
      span.textContent = text;
      row.appendChild(bullet);
      row.appendChild(span);
      frag.appendChild(row);
    });
    list.appendChild(frag);
  }

  async function load(){
    try {
      errEl && (errEl.hidden = true); if (errEl) errEl.textContent = '';
      const csv = await fetchCSVText();
      // A2:A12 => rows 2..12 inclusive
      const stats = parseFirstColumnRows(csv, 2, 12);
      renderStats(stats);
    } catch (e){
      if (errEl){
        errEl.hidden = false;
        errEl.textContent = '능력치를 불러오지 못했습니다. 시트를 공개 또는 웹에 게시했는지 확인해주세요.';
      }
      // Also render fallback empty UI
      renderStats([]);
    }
  }

  // Auto-load on startup
  load();
})();
