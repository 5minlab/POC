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
  const expInput = panel.querySelector('.current-exp-input');
  const progBar = panel.querySelector('.progress-bar');
  const progFill = panel.querySelector('.progress-fill');
  const progText = panel.querySelector('.progress-text');

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

  function toNumber(str){
    if (typeof str !== 'string') return 0;
    const cleaned = str.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function buildModel(headers, rows){
    const { idxLevel, idxReq } = detectColumns(headers);
    const items = [];
    for (const r of rows){
      if (!r || r.length === 0) continue;
      const lvl = (r[idxLevel] || '').trim();
      if (!lvl) continue; // require level label in col A (or detected)
      const req = (r[idxReq] || '').trim();
      const reqNum = toNumber(req);
      items.push({ level: lvl, reqExp: req, reqExpNum: reqNum });
    }
    // Determine thresholds (cumulative requirement up to each level)
    const values = items.map(it => it.reqExpNum || 0);
    const nonDecreasing = values.every((v,i) => i === 0 || v >= values[i-1]);
    let thresholds = [];
    if (nonDecreasing) {
      thresholds = values;
    } else {
      let acc = 0;
      thresholds = values.map(v => { acc += v; return acc; });
    }
    // Force first level threshold to 0 to represent starting point
    if (thresholds.length > 0) thresholds[0] = 0;
    items.forEach((it, i) => { it.threshold = thresholds[i]; });
    return items;
  }

  function render(items){
    // Populate select (레벨 목록)
    selectEl.innerHTML = '';
    items.forEach((it, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = it.level;
      selectEl.appendChild(opt);
    });

    // Restore selection
    const st = loadState();
    // 최초 레벨은 1 (목록 첫 행이 레벨1이라고 가정)
    const idx = Math.min(items.length - 1, Math.max(0, parseInt(st.levelIndex ?? '0', 10) || 0));
    selectEl.value = String(idx);
    const curExp = Math.max(0, toNumber(st.currentExp ?? '0'));
    if (expInput) expInput.value = String(curExp);
    updateTable(items, idx);
    updateInfo(items, idx, curExp);
  }

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function updateInfo(items, idx, currentExp){
    const i = Math.max(0, Math.min(items.length - 1, idx));
    const cur = items[i];
    const next = items[i + 1];
    // Progress calculation using cumulative thresholds
    const base = cur?.threshold ?? 0;
    const target = next?.threshold;
    if (typeof target === 'number'){
      const need = Math.max(0, target - (currentExp || 0));
      const denom = Math.max(1, target - base);
      const ratio = clamp(((currentExp || 0) - base) / denom, 0, 1);
      if (progFill) progFill.style.width = (ratio * 100).toFixed(1) + '%';
      if (progBar) progBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      if (progText) progText.textContent = `${(currentExp||0).toLocaleString()} / 다음 ${(target).toLocaleString()} (남은 ${need.toLocaleString()})`;
      infoEl.textContent = `다음 레벨 필요 경험치: ${(target - base).toLocaleString()}`;
    } else {
      if (progFill) progFill.style.width = '100%';
      if (progBar) progBar.setAttribute('aria-valuenow', '100');
      if (progText) progText.textContent = '최대 레벨입니다.';
      infoEl.textContent = '최대 레벨입니다.';
    }
  }

  function bind(items){
    selectEl.addEventListener('change', () => {
      const idx = parseInt(selectEl.value, 10) || 0;
      const curExp = Math.max(0, toNumber(expInput?.value || '0'));
      updateTable(items, idx);
      updateInfo(items, idx, curExp);
      const st = loadState();
      saveState({ ...st, levelIndex: idx });
    });
    expInput?.addEventListener('input', () => {
      const idx = parseInt(selectEl.value, 10) || 0;
      const curExp = Math.max(0, toNumber(expInput?.value || '0'));
      updateInfo(items, idx, curExp);
      const st = loadState();
      saveState({ ...st, currentExp: curExp });
    });
  }

  function updateTable(items, idx){
    // 현재 레벨에 해당하는 행만 표시
    tableBody.innerHTML = '';
    const i = Math.max(0, Math.min(items.length - 1, idx));
    const it = items[i];
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.textContent = it.level;
    const tdR = document.createElement('td');
    tdR.textContent = it.reqExp || '-';
    tr.appendChild(tdL);
    tr.appendChild(tdR);
    tableBody.appendChild(tr);
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
