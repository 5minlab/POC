(function(){
  'use strict';
  // Level system: C3, C4, ... = cumulative thresholds for reaching level 2, 3, ...
  const sheetId = '1ElMWIti0qQiDmkDngQ6WffCzkGrL_72FH7rQLji6IOA';
  const gid = '1223287132';
  const panel = document.querySelector('.panel.right .levels-panel');
  if (!panel) return;
  const selectEl = panel.querySelector('.level-select'); // Manual selection enabled
  const tableBody = panel.querySelector('.levels-table tbody');
  const errEl = panel.querySelector('.levels-error');
  const expInput = panel.querySelector('.current-exp-input');
  const expMinus = panel.querySelector('.exp-minus');
  const expPlus = panel.querySelector('.exp-plus');
  const progBar = panel.querySelector('.progress-bar');
  const progFill = panel.querySelector('.progress-fill');
  const progText = panel.querySelector('.progress-text');

  const LS = 'poc_level_state_v1';
  function loadState(){ try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } }
  function saveState(st){ try { localStorage.setItem(LS, JSON.stringify(st || {})); } catch {} }

  let cumulativeThresholds = []; // C3=level2 threshold, C4=level3, etc.
  let lastLevelIdx = null; // for prevIndex dispatch

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
        if (text && text.trim()) return text;
      } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('시트 로드 실패');
  }

  function parseThresholds(csv){
    // Parse C column values starting at C3 (skip C2). Use as cumulative thresholds.
    const lines = csv.replace(/\r\n?/g,'\n').split('\n');
    if (!lines.length) return [];
    const rows = lines.slice(1).map(l => l.split(',').map(s => s.trim())); // exclude header
    const thresholds = [];
    for (let i = 1; i < rows.length; i++){ // i=1 => sheet row 3 (C3)
      const cols = rows[i];
      if (!cols || cols.length < 3) continue;
      const num = toNumber(cols[2]);
      if (num > 0) thresholds.push(num);
    }
    return thresholds;
  }

  function toNumber(str){
    if (typeof str !== 'string') return 0;
    const cleaned = str.replace(/[^0-9.-]/g,'');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function deriveLevel(totalExp){
    // Determine level from cumulative thresholds
    let level = 1;
    for (let i = 0; i < cumulativeThresholds.length; i++){
      if (totalExp >= cumulativeThresholds[i]){
        level = i + 2; // C3 = level 2, C4 = level 3, etc.
      } else {
        break;
      }
    }
    const levelIndex = level - 1;
    // Calculate progress within current level
    const prevThreshold = level === 1 ? 0 : cumulativeThresholds[level - 2];
    const nextThreshold = cumulativeThresholds[level - 1] || 0;
    const expInto = totalExp - prevThreshold;
    const reqForNext = nextThreshold > 0 ? nextThreshold - prevThreshold : 0;
    return { level, levelIndex, expInto, reqForNext, totalExp };
  }

  function cumulativeExpForLevel(levelIndex){
    // Return minimum cumulative exp needed to reach levelIndex (0-based)
    if (levelIndex === 0) return 0; // level 1
    return cumulativeThresholds[levelIndex - 1] || 0;
  }

  function updateUI(totalExp){
    const { level, levelIndex, expInto, reqForNext } = deriveLevel(totalExp);
    // Select element: populate and enable for manual selection
    if (selectEl){
      if (!selectEl.options.length){
        // Populate options up to max known levels
        const maxLevel = cumulativeThresholds.length + 1;
        for (let l = 1; l <= maxLevel; l++){
          const opt = document.createElement('option');
          opt.value = String(l-1);
          opt.textContent = String(l);
          selectEl.appendChild(opt);
        }
      }
      selectEl.value = String(levelIndex);
      selectEl.removeAttribute('disabled'); // Enable manual selection
    }
    // Progress bar
    if (reqForNext > 0){
      const ratio = Math.max(0, Math.min(1, expInto / reqForNext));
      if (progFill) progFill.style.width = (ratio * 100).toFixed(1) + '%';
      if (progBar) progBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      if (progText) progText.textContent = `${expInto.toLocaleString()} / ${reqForNext.toLocaleString()} (${(ratio*100).toFixed(1)}%)`;
    } else {
      // Max level reached
      if (progFill) progFill.style.width = '100%';
      if (progBar) progBar.setAttribute('aria-valuenow','100');
      if (progText) progText.textContent = `최대 레벨 (총 경험치 ${totalExp.toLocaleString()})`;
    }
    // Table: show current level & next requirement
    if (tableBody){
      tableBody.innerHTML = '';
      const tr = document.createElement('tr');
      const tdL = document.createElement('td'); tdL.textContent = String(level);
      const tdR = document.createElement('td'); tdR.textContent = reqForNext > 0 ? String(reqForNext) : '-';
      tr.appendChild(tdL); tr.appendChild(tdR); tableBody.appendChild(tr);
    }
    // Persist & dispatch level change if changed
    const st = loadState();
    if (st.totalExp !== totalExp || st.levelIndex !== levelIndex){
      saveState({ totalExp, levelIndex });
      dispatchLevelChanged(levelIndex);
    }
  }

  function dispatchLevelChanged(levelIndex){
    try {
      const prevIndex = lastLevelIdx;
      lastLevelIdx = levelIndex;
      window.dispatchEvent(new CustomEvent('level:changed', { detail: { levelIndex, prevIndex, level: String(levelIndex+1) } }));
    } catch {}
  }

  function setTotalExp(newVal){
    const totalExp = Math.max(0, Math.round(newVal));
    if (expInput) expInput.value = String(totalExp);
    updateUI(totalExp);
  }

  function bindExpControls(){
    // Manual level selection
    selectEl?.addEventListener('change', () => {
      const selectedIdx = parseInt(selectEl.value, 10) || 0;
      const minExp = cumulativeExpForLevel(selectedIdx);
      setTotalExp(minExp);
    });
    expInput?.addEventListener('input', () => {
      setTotalExp(parseFloat(expInput.value) || 0);
    });
    expMinus?.addEventListener('click', () => {
      const cur = parseFloat(expInput.value) || 0;
      setTotalExp(Math.max(0, cur - 10));
    });
    expPlus?.addEventListener('click', () => {
      const cur = parseFloat(expInput.value) || 0;
      setTotalExp(cur + 10);
    });
  }

  async function init(){
    try {
      if (errEl){ errEl.hidden = true; errEl.textContent = ''; }
      const csv = await fetchCSVText();
      cumulativeThresholds = parseThresholds(csv);
      const st = loadState();
      const startExp = Math.max(0, parseInt(st.totalExp || '0', 10) || 0);
      bindExpControls();
      setTotalExp(startExp);
    } catch(e){
      if (errEl){
        errEl.hidden = false;
        errEl.textContent = '레벨 데이터를 불러오지 못했습니다. 시트를 공개/게시 및 C열 값을 확인하세요.';
      }
    }
  }

  init();
})();
