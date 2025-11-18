/* Stats + affinity panels with sheet-driven names */
(function(){
  'use strict';
  const panel = document.querySelector('.panel.right .stats-panel');
  if (!panel) return;
  const statsListEl = panel.querySelector('.stats-list');
  const affinityListEl = document.createElement('div');
  affinityListEl.className = 'affinity-list';
  affinityListEl.setAttribute('role','list');
  panel.appendChild(affinityListEl);
  const errEl = panel.querySelector('.stats-error');
  const pointsEl = panel.querySelector('.stat-points .points-value');

  const sheetId = '1ElMWIti0qQiDmkDngQ6WffCzkGrL_72FH7rQLji6IOA';
  const gid = '1530173934';
  const LS_ALLOC = 'poc_stat_alloc_v1';
  const LS_AFFINITY = 'poc_affinity_alloc_v1';
  const LS_LEVEL = 'poc_level_state_v1';
  const DEFAULT_STATS = ['힘','재주','지능','화술','행운'];
  const AFFINITY_TYPES = ['화염','냉기','번개','빛','암흑'];

  let statsNames = [...DEFAULT_STATS];
  let baseStats = createBaseStats();
  let alloc = alignAlloc(loadAlloc());
  let affinityAlloc = alignAffinityAlloc(loadAffinityAlloc());

  function createBaseStats(){
    return statsNames.reduce((map,name) => {
      map[name] = 1;
      return map;
    }, {});
  }

  function loadAlloc(){
    try {
      return JSON.parse(localStorage.getItem(LS_ALLOC) || '{}') || {};
    } catch {
      return {};
    }
  }
  function saveAlloc(){
    try { localStorage.setItem(LS_ALLOC, JSON.stringify(alloc)); } catch {}
  }
  function loadAffinityAlloc(){
    try {
      return JSON.parse(localStorage.getItem(LS_AFFINITY) || '{}') || {};
    } catch {
      return {};
    }
  }
  function saveAffinityAlloc(){
    try { localStorage.setItem(LS_AFFINITY, JSON.stringify(affinityAlloc)); } catch {}
  }
  function alignAlloc(source = {}){
    return statsNames.reduce((map,name) => {
      map[name] = parseInt(source[name] || 0, 10) || 0;
      return map;
    }, {});
  }
  function alignAffinityAlloc(source = {}){
    return AFFINITY_TYPES.reduce((map,name) => {
      map[name] = parseInt(source[name] || 0, 10) || 0;
      return map;
    }, {});
  }

  function createControls(name, deltaHandler){
    const controls = document.createElement('div');
    controls.className = 'stat-controls';
    const minus = document.createElement('button');
    minus.className = 'stat-btn stat-minus';
    minus.textContent = '−';
    minus.addEventListener('click', () => deltaHandler(name, -1));
    const plus = document.createElement('button');
    plus.className = 'stat-btn stat-plus';
    plus.textContent = '+';
    plus.addEventListener('click', () => deltaHandler(name, +1));
    controls.appendChild(minus);
    controls.appendChild(plus);
    return controls;
  }

  function renderRows(){
    statsListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    statsNames.forEach((name) => {
      const row = createRow(name, baseStats[name] + (alloc[name] || 0), createControls(name, changeAlloc));
      fragment.appendChild(row);
    });
    statsListEl.appendChild(fragment);
  }

  function renderAffinityRows(){
    affinityListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    AFFINITY_TYPES.forEach((name) => {
      const row = createRow(name, affinityAlloc[name] || 0, createControls(name, changeAffinity), 'affinity');
      fragment.appendChild(row);
    });
    affinityListEl.appendChild(fragment);
  }

  function createRow(name, value, controls, type='stat'){
    const row = document.createElement('div');
    row.className = type === 'stat' ? 'stat-row' : 'stat-row affinity-row';
    const label = document.createElement('div');
    label.className = type === 'stat' ? 'stat-label' : 'stat-label affinity-label';
    label.textContent = name;
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.dataset.key = name;
    valueEl.textContent = value.toString();
    row.appendChild(label);
    row.appendChild(controls);
    row.appendChild(valueEl);
    return row;
  }

  function changeAlloc(name, delta){
    const current = alloc[name] || 0;
    if (delta > 0 && remainingPoints() <= 0) return;
    if (delta > 0){
      alloc[name] = current + 1;
    } else if (delta < 0 && current > 0){
      alloc[name] = current - 1;
    }
    saveAlloc();
    updateValues();
  }

  function changeAffinity(name, delta){
    const current = affinityAlloc[name] || 0;
    if (delta > 0){
      affinityAlloc[name] = current + 1;
    } else if (delta < 0 && current > 0){
      affinityAlloc[name] = current - 1;
    }
    saveAffinityAlloc();
    updateValues();
  }

  function updateValues(){
    statsNames.forEach((name) => {
      const el = statsListEl.querySelector(`.stat-value[data-key="${name}"]`);
      if (el) el.textContent = formatValue(baseStats[name] + (alloc[name] || 0));
    });
    AFFINITY_TYPES.forEach((name) => {
      const el = affinityListEl.querySelector(`.stat-value[data-key="${name}"]`);
      if (el) el.textContent = `${affinityAlloc[name] || 0}`;
    });
    const remain = remainingPoints();
    if (pointsEl) pointsEl.textContent = remain.toString();
  }

  function formatValue(v){ return (Math.round(v * 100) / 100).toString(); }

  function getLevelState(){
    try { return JSON.parse(localStorage.getItem(LS_LEVEL) || '{}') || {}; }
    catch { return {}; }
  }
  function getCurrentLevelIndex(){
    const state = getLevelState();
    return Math.max(0, parseInt(state.levelIndex || '0', 10) || 0);
  }
  function getAvailablePoints(){
    return Math.max(0, getCurrentLevelIndex() * 3);
  }
  function remainingPoints(){
    const total = statsNames.reduce((sum, name) => sum + (alloc[name] || 0), 0);
    return Math.max(0, getAvailablePoints() - total);
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
    throw lastErr || new Error('시트를 로드하지 못했습니다.');
  }

  function parseBaseStats(csvText){
    const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter(Boolean);
    const baseMap = {};
    const names = [];
    for (let i = 1; i < lines.length && names.length < 5; i++){
      const cols = lines[i].split(',');
      if (!cols.length) continue;
      const name = (cols[0] || '').trim();
      if (!name) continue;
      const value = parseFloat(cols[1]?.replace(/[^0-9.-]/g,'')) || 0;
      baseMap[name] = value || 0;
      names.push(name);
    }
    return { names, baseMap };
  }

  async function load(){
    renderStats();
    renderAffinityRows();
    updateValues();
    try {
      if (errEl){ errEl.hidden = true; errEl.textContent = ''; }
      const csv = await fetchCSVText();
      const parsed = parseBaseStats(csv);
      if (parsed.names.length){
        statsNames = parsed.names;
        baseStats = statsNames.reduce((map,name) => {
          map[name] = parsed.baseMap[name] ?? 1;
          return map;
        }, {});
        alloc = alignAlloc(alloc);
        renderStats();
        updateValues();
      }
    } catch (e){
      if (errEl){
        errEl.hidden = false;
        errEl.textContent = '능력치를 불러오지 못했어요. 시트를 공개/게시했는지 확인해주세요.';
      }
    }
  }

  window.addEventListener('level:changed', () => {
    renderStats();
    updateValues();
  });

  load();
})();
