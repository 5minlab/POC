// Blacksmith stats with point allocation (힘, 재주, 지능, 화술, 행운)
(function(){
  'use strict';
  const sheetId = '1ElMWIti0qQiDmkDngQ6WffCzkGrL_72FH7rQLji6IOA';
  const gid = '1530173934';

  const panel = document.querySelector('.panel.right .stats-panel');
  const list = document.querySelector('.panel.right .stats-list');
  const errEl = document.querySelector('.panel.right .stats-error');
  const pointsEl = document.querySelector('.panel.right .stat-points .points-value');
  if (!panel || !list) return;

  const LS_ALLOC = 'poc_stat_alloc_v1';
  const LS_LEVEL = 'poc_level_state_v1';
  const STATS = ['힘', '재주', '지능', '화술', '행운'];

  let base = createZeroMap();
  let alloc = { ...createZeroMap(), ...loadAlloc() };
  const equipBonuses = {};

  function createZeroMap(){
    return STATS.reduce((map, key) => {
      map[key] = 0;
      return map;
    }, {});
  }

  function loadAlloc(){
    try { return JSON.parse(localStorage.getItem(LS_ALLOC) || '{}') || {}; }
    catch { return {}; }
  }
  function saveAlloc(){
    try { localStorage.setItem(LS_ALLOC, JSON.stringify(alloc || {})); }
    catch {}
  }
  function getCurrentLevelIndex(){
    try {
      const st = JSON.parse(localStorage.getItem(LS_LEVEL) || '{}') || {};
      return Math.max(0, parseInt(st.levelIndex || '0', 10) || 0);
    } catch {
      return 0;
    }
  }
  function getLevelNumberFromIndex(idx){ return idx + 1; }
  function getAvailablePoints(){
    const idx = getCurrentLevelIndex();
    const level = getLevelNumberFromIndex(idx);
    return Math.max(0, (level - 1) * 3);
  }
  function totalAllocated(){ return STATS.reduce((sum, key) => sum + (parseInt(alloc[key] || 0, 10) || 0), 0); }
  function remainingPoints(){ return Math.max(0, getAvailablePoints() - totalAllocated()); }
  function clampAllocationToCap(){
    let over = totalAllocated() - getAvailablePoints();
    if (over <= 0) return;
    for (const key of [...STATS].reverse()){
      if (over <= 0) break;
      const current = parseInt(alloc[key] || 0, 10) || 0;
      const dec = Math.min(current, over);
      alloc[key] = current - dec;
      over -= dec;
    }
  }

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
        if (!res.ok){ lastErr = new Error(`HTTP ${res.status}`); continue; }
        const text = await res.text();
        if (text && text.trim().length) return text;
      } catch (e){
        lastErr = e;
      }
    }
    throw lastErr || new Error('시트 로드 실패');
  }

  function parseBaseStats(csvText){
    const lines = csvText.replace(/\r\n?/g, '\n').split('\n');
    const out = createZeroMap();
    for (let i = 1; i < lines.length; i++){
      const cols = lines[i].split(',');
      if (!cols.length) continue;
      const name = (cols[0] || '').trim();
      const valStr = (cols[1] || '').trim();
      const n = parseFloat(valStr.replace(/[^0-9.-]/g,'')) || 0;
      if (STATS.includes(name)) out[name] = n;
    }
    return out;
  }

  function renderRows(){
    list.innerHTML = '';
    const frag = document.createDocumentFragment();
    STATS.forEach((key) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const label = document.createElement('div');
      label.className = 'stat-label';
      label.textContent = key;
      const value = document.createElement('div');
      value.className = 'stat-value';
      value.dataset.key = key;
      value.textContent = formatValue(base[key] + (parseInt(alloc[key] || 0, 10) || 0));
      const controls = document.createElement('div');
      controls.className = 'stat-controls';
      const minus = document.createElement('button');
      minus.className = 'stat-btn stat-minus';
      minus.textContent = '−';
      const allocSpan = document.createElement('span');
      allocSpan.className = 'stat-alloc';
      allocSpan.dataset.key = key;
      allocSpan.textContent = String(parseInt(alloc[key] || 0, 10) || 0);
      const plus = document.createElement('button');
      plus.className = 'stat-btn stat-plus';
      plus.textContent = '+';
      controls.appendChild(minus);
      controls.appendChild(allocSpan);
      controls.appendChild(plus);
      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(controls);
      frag.appendChild(row);
      minus.addEventListener('click', () => changeAlloc(key, -1));
      plus.addEventListener('click', () => changeAlloc(key, +1));
    });
    list.appendChild(frag);
    updatePointsUI();
  }

  function formatValue(v){ return (Math.round(v * 100) / 100).toString(); }

  function updatePointsUI(){
    const remain = remainingPoints();
    if (pointsEl) pointsEl.textContent = remain.toString();
    const pointsContainer = pointsEl?.closest('.stat-points');
    if (pointsContainer){
      pointsContainer.hidden = false;
    }
    updateControlsVisibility();
  }

  function getEquipBonusValue(key){
    return Object.values(equipBonuses).reduce((sum, eff) => {
      const v = parseFloat(eff?.[key]) || 0;
      return sum + v;
    }, 0);
  }

  function refreshValues(){
    STATS.forEach((k) => {
      const vEl = list.querySelector(`.stat-value[data-key="${k}"]`);
      const aEl = list.querySelector(`.stat-alloc[data-key="${k}"]`);
      const a = parseInt(alloc[k] || 0, 10) || 0;
      if (aEl) aEl.textContent = String(a);
      if (vEl) vEl.textContent = formatValue(base[k] + a + getEquipBonusValue(k));
    });
    updatePointsUI();
  }

  function updateControlsVisibility(){
    const hasPoints = remainingPoints() > 0;
    list.querySelectorAll('.stat-controls').forEach(ctrl => {
      ctrl.style.visibility = hasPoints ? 'visible' : 'hidden';
    });
  }

  function changeAlloc(key, delta){
    const cur = parseInt(alloc[key] || 0, 10) || 0;
    if (delta > 0){
      if (remainingPoints() <= 0) return;
      alloc[key] = cur + 1;
    } else if (delta < 0){
      if (cur <= 0) return;
      alloc[key] = cur - 1;
    }
    saveAlloc();
    refreshValues();
  }

  function onLevelChanged(ev){
    const prev = ev?.detail?.prevIndex;
    const cur = ev?.detail?.levelIndex;
    if (prev !== undefined && prev !== null && prev !== cur){
      alloc = createZeroMap();
    } else {
      clampAllocationToCap();
    }
    saveAlloc();
    refreshValues();
  }

  async function load(){
    try {
      if (errEl){ errEl.hidden = true; errEl.textContent = ''; }
      const csv = await fetchCSVText();
      base = parseBaseStats(csv);
      renderRows();
      onLevelChanged();
    } catch (e){
      if (errEl){
        errEl.hidden = false;
        errEl.textContent = '능력치를 불러오지 못했어요. 시트를 공개/게시했는지 확인해주세요.';
      }
      list.innerHTML = '';
    }
  }

  function onEquipmentChange(ev){
    const detail = ev?.detail;
    if (!detail || !detail.itemId || !detail.effects) return;
    if (detail.equipped) {
      equipBonuses[detail.itemId] = detail.effects;
    } else {
      delete equipBonuses[detail.itemId];
    }
    refreshValues();
  }

  window.addEventListener('level:changed', onLevelChanged);
  window.addEventListener('inventory:equipment-change', onEquipmentChange);

  load();
})();
