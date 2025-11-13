(function(){
  'use strict';
  // Track last dispatched level index to include in events
  let lastIdx = null;
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
    // 명시 요구: 레벨은 A열, 필요 경험치는 C열(C2:C51)
    // 가능한 한 강제 인덱스 사용(A=0, C=2). 헤더 길이가 부족할 경우 대비해 fallback.
    const idxLevel = 0;
    const idxReq = headers.length >= 3 ? 2 : Math.min(1, headers.length - 1);
    return { idxLevel, idxReq };
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
    const savedIdx = Math.min(items.length - 1, Math.max(0, parseInt(st.levelIndex ?? '0', 10) || 0));
    const curExp = Math.max(0, toNumber(st.currentExp ?? '0'));
    // 현재 경험치에 맞춰 레벨 자동 보정
    const idx = levelIndexFromExp(items, curExp);
    selectEl.value = String(idx);
    if (expInput) expInput.value = String(curExp);
    updateTable(items, idx);
    updateInfo(items, idx, curExp);
  }

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function updateInfo(items, idx, currentExp){
    const i = Math.max(0, Math.min(items.length - 1, idx));
    const cur = items[i];
    // 진행도: 현재 누적 경험치 / 현재 레벨의 누적 필요 경험치(C열 값)
    const target = cur?.reqExpNum ?? 0;
    if (target > 0){
      const need = Math.max(0, target - (currentExp || 0));
      const ratio = clamp((currentExp || 0) / target, 0, 1);
      if (progFill) progFill.style.width = (ratio * 100).toFixed(1) + '%';
      if (progBar) progBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      if (progText) progText.textContent = `${(currentExp||0).toLocaleString()} / 목표 ${(target).toLocaleString()} (남은 ${need.toLocaleString()})`;
      if (infoEl) infoEl.textContent = '';
    } else {
      if (progFill) progFill.style.width = '0%';
      if (progBar) progBar.setAttribute('aria-valuenow', '0');
      if (progText) progText.textContent = '';
      if (infoEl) infoEl.textContent = '';
    }
  }

  function bind(items){
    selectEl.addEventListener('change', () => {
      const idx = parseInt(selectEl.value, 10) || 0;
      const curExp = Math.max(0, toNumber(expInput?.value || '0'));
      // 만약 현재 경험치가 선택 레벨 목표를 초과하면 해당 경험치에 맞는 레벨로 보정
      const resolved = levelIndexFromExp(items, curExp);
      const finalIdx = resolved;
      if (String(finalIdx) !== selectEl.value) selectEl.value = String(finalIdx);
      updateTable(items, finalIdx);
      updateInfo(items, finalIdx, curExp);
      const st = loadState();
      saveState({ ...st, levelIndex: finalIdx });
      // notify
      dispatchLevelChanged(items, finalIdx);
    });
    expInput?.addEventListener('input', () => {
      const curExp = Math.max(0, toNumber(expInput?.value || '0'));
      // 현재 경험치로 레벨 자동 보정
      const resolved = levelIndexFromExp(items, curExp);
      if (String(resolved) !== selectEl.value) selectEl.value = String(resolved);
      updateTable(items, resolved);
      updateInfo(items, resolved, curExp);
      const st = loadState();
      saveState({ ...st, currentExp: curExp, levelIndex: resolved });
      // notify
      dispatchLevelChanged(items, resolved);
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

  function levelIndexFromExp(items, exp){
    let idx = 0;
    for (let i = 0; i < items.length; i++){
      const th = items[i]?.reqExpNum ?? 0;
      if (exp >= th) idx = i; else break;
    }
    return idx;
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
      // initial notify (no prev index)
      const idx = parseInt(selectEl.value, 10) || 0;
      dispatchLevelChanged(items, idx);
    } catch (e){
      if (errEl){
        errEl.hidden = false;
        errEl.textContent = '레벨 데이터를 불러오지 못했습니다. 시트를 공개/게시했는지와 컬럼을 확인해주세요.';
      }
    }
  }

  function dispatchLevelChanged(items, idx){
    const levelLabel = items?.[idx]?.level ?? String(idx+1);
    try {
      const prevIndex = lastIdx;
      lastIdx = idx;
      window.dispatchEvent(new CustomEvent('level:changed', { detail: { levelIndex: idx, prevIndex, level: levelLabel } }));
    } catch {}
  }

  load();
})();
