(function(){
  'use strict';
  // Level-up UI rendering from Google Sheets (gid=1223287132)
  const sheetId = '1ElMWIti0qQiDmkDngQ6WffCzkGrL_72FH7rQLji6IOA';
  const gid = '1223287132';

  const panel = document.querySelector('.panel.right .levels-panel');
  if (!panel) return;
  const selectEl = panel.querySelector('.level-select');
  const infoEl = panel.querySelector('.level-info');
  const tableBody = panel.querySelector('.levels-table tbody');
  const errEl = panel.querySelector('.levels-error');

  const LS = 'poc_level_state_v1';
  function loadState(){ try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } }
  function saveState(st){ try { localStorage.setItem(LS, JSON.stringify(st || {})); } catch {} }

  async function fetchCSVText(){
    const urls = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&id=${sheetId}&gid=${gid}`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/pub?gid=${gid}&single=true&output=csv`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    ];
    let lastErr = null;
    for (const url of urls){
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        const text = await res.text();
        if (text && text.trim().length) return text;
      } catch (e){ lastErr = e; }
    }
    throw lastErr || new Error('시트 로드 실패');
  }

  function parseCSV(text){
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length === 0) return { headers: [], rows: [] };
    const header = (lines[0] || '').split(',').map(s => s.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(s => s.trim()));
    return { headers: header, rows };
  }

  function detectColumns(headers){
    // Try to find Level and Required EXP columns by common names (KR/EN)
    const h = headers.map(x => x.toLowerCase());
    const idxLevel = h.findIndex(x => ['레벨','level','lvl'].includes(x));
    const idxReq = h.findIndex(x => ['필요경험치','필요 exp','required exp','exp','xp','경험치','요구경험치'].includes(x));
    return { idxLevel: idxLevel >= 0 ? idxLevel : 0, idxReq: idxReq >= 0 ? idxReq : 1 };
  }

  function buildModel(headers, rows){
    const { idxLevel, idxReq } = detectColumns(headers);
    const items = [];
    for (const r of rows){
      if (!r || r.length === 0) continue;
      const lvl = (r[idxLevel] || '').trim();
      if (!lvl) continue; // require level label in col A (or detected)
      const req = (r[idxReq] || '').trim();
      items.push({ level: lvl, reqExp: req });
    }
    return items;
  }

  function render(items){
    // Populate select
    selectEl.innerHTML = '';
    items.forEach((it, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = it.level;
      selectEl.appendChild(opt);
    });

    // Table
    tableBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach((it) => {
      const tr = document.createElement('tr');
      const tdL = document.createElement('td');
      tdL.textContent = it.level;
      const tdR = document.createElement('td');
      tdR.textContent = it.reqExp || '-';
      tr.appendChild(tdL);
      tr.appendChild(tdR);
      frag.appendChild(tr);
    });
    tableBody.appendChild(frag);

    // Restore selection
    const st = loadState();
    const idx = Math.min(items.length - 1, Math.max(0, parseInt(st.levelIndex || '0', 10) || 0));
    selectEl.value = String(idx);
    updateInfo(items, idx);
  }

  function updateInfo(items, idx){
    const i = Math.max(0, Math.min(items.length - 1, idx));
    const cur = items[i];
    const next = items[i + 1];
    if (next && next.reqExp){
      infoEl.textContent = `다음 레벨 필요 경험치: ${next.reqExp}`;
    } else if (next){
      infoEl.textContent = '다음 레벨 필요 경험치 정보가 없습니다.';
    } else {
      infoEl.textContent = '최대 레벨입니다.';
    }
  }

  function bind(items){
    selectEl.addEventListener('change', () => {
      const idx = parseInt(selectEl.value, 10) || 0;
      updateInfo(items, idx);
      saveState({ levelIndex: idx });
    });
  }

  async function load(){
    try {
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
      const csv = await fetchCSVText();
      const { headers, rows } = parseCSV(csv);
      const items = buildModel(headers, rows);
      if (!items.length) throw new Error('empty');
      render(items);
      bind(items);
    } catch (e){
      if (errEl){
        errEl.hidden = false;
        errEl.textContent = '레벨 데이터를 불러오지 못했습니다. 시트를 공개/게시했는지와 컬럼을 확인해주세요.';
      }
    }
  }

  load();
})();
