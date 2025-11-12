(function(){
  'use strict';
  // Lightweight Google Sheets CSV loader (publish Sheet to web as CSV)
  // Usage (after publishing):
  //   GoogleSheets.fetchCSV({ sheetId: '...', gid: '0' }).then(rows => console.log(rows));
  // Optional: GoogleSheets.populateInventory({ sheetId, gid, mapping: { id:'id', col:'col', row:'row', w:'w', h:'h', label:'label' }})

  function csvToObjects(csvText){
    const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter(Boolean);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      // Basic CSV split (no quoted commas handling). For complex data, adjust as needed.
      const cols = line.split(',');
      const obj = {};
      headers.forEach((h, i) => obj[h] = (cols[i] ?? '').trim());
      return obj;
    });
  }

  async function fetchCSV({ sheetId, gid='0' }){
    if (!sheetId) throw new Error('sheetId is required');
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&id=${sheetId}&gid=${gid}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const text = await res.text();
    return csvToObjects(text);
  }

  function ensureInventory(){
    return document.querySelector('.inventory');
  }

  function createItemEl(row, mapping){
    const inv = ensureInventory();
    if (!inv) return null;
    const el = document.createElement('div');
    el.className = 'item';
    const id = row[mapping.id] || `item_${Math.random().toString(36).slice(2,8)}`;
    el.dataset.itemId = id;
    const w = parseInt(row[mapping.w] || '1', 10) || 1;
    const h = parseInt(row[mapping.h] || '1', 10) || 1;
    const col = parseInt(row[mapping.col] || '1', 10) || 1;
    const rowIdx = parseInt(row[mapping.row] || '1', 10) || 1;
    el.style.setProperty('--w', w);
    el.style.setProperty('--h', h);
    el.style.setProperty('--col', col);
    el.style.setProperty('--row', rowIdx);
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = row[mapping.label] || '';
    el.appendChild(label);
    return el;
  }

  async function populateInventory({ sheetId, gid='0', mapping, replace=false }){
    const inv = ensureInventory();
    if (!inv) throw new Error('Inventory element not found');
    const rows = await fetchCSV({ sheetId, gid });
    if (!mapping) mapping = { id:'id', col:'col', row:'row', w:'w', h:'h', label:'label' };
    if (replace) {
      // Remove existing items and clear saved state
      inv.querySelectorAll('.item').forEach(el => el.remove());
      try {
        const st = JSON.parse(localStorage.getItem('poc_items_state_v1') || '{}');
        Object.keys(st).forEach(k => delete st[k]);
        localStorage.setItem('poc_items_state_v1', JSON.stringify(st));
      } catch {}
    }
    const frag = document.createDocumentFragment();
    rows.forEach(r => {
      const el = createItemEl(r, mapping);
      if (el) frag.appendChild(el);
    });
    inv.appendChild(frag);
    // Bind drag after insertion
    const bind = (item) => item.addEventListener('pointerdown', (e)=>{
      // Let inventory.js handle; just trigger a synthetic event if needed
    });
    inv.querySelectorAll('.item').forEach(bind);
  }

  window.GoogleSheets = { fetchCSV, populateInventory };
})();
