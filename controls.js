(function(){
  'use strict';
  const panel = document.querySelector('.panel.left');
  const toolbar = document.querySelector('.left-toolbar');
  if (!panel || !toolbar) return;

  const BTN_SAVE = toolbar.querySelector('.btn-save');
  const BTN_RESTORE = toolbar.querySelector('.btn-restore');
  const BACKUP_SELECT = toolbar.querySelector('.backup-select');
  const backupMap = new Map();

  const LS_BOXES_MAIN = 'poc_boxes_state_v1';
  const LS_ITEMS_MAIN = 'poc_items_state_v1';
  const LS_SNAPSHOT = 'poc_manual_snapshot_v1';
  const LS_AUTO_BACKUP = 'poc_auto_backup_v1';
  const AUTO_BACKUP_INTERVAL_MS = 15 * 60 * 1000;
  const MAX_AUTO_BACKUPS = 5;

  function panelRect(){ return panel.getBoundingClientRect(); }
  function round3(x){ return Math.round(x * 1000) / 1000; }
  function generateSnapshotId(){
    return `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  }
  function normalizeSnapshot(raw){
    if (!raw || typeof raw !== 'object') return { snapshot: null, changed: false };
    let changed = false;
    if (!raw.id){
      raw.id = generateSnapshotId();
      changed = true;
    }
    if (!raw.ts){
      raw.ts = Date.now();
      changed = true;
    }
    if (!raw.boxes || typeof raw.boxes !== 'object'){
      raw.boxes = {};
      changed = true;
    }
    if (!raw.items || typeof raw.items !== 'object'){
      raw.items = {};
      changed = true;
    }
    return { snapshot: raw, changed };
  }
  function manualOptionValue(snap){
    return snap?.id ? `manual:${snap.id}` : '';
  }
  function autoOptionValue(snap){
    return snap?.id ? `auto:${snap.id}` : '';
  }
  function formatTimestamp(ts){
    if (!ts) return '';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ---- Boxes snapshot/apply ----
  function snapshotBoxes(){
    const pr = panelRect();
    const boxes = {};
    document.querySelectorAll('.draggable-box').forEach((box) => {
      const id = box.getAttribute('data-id');
      if (!id) return;
      const rect = box.getBoundingClientRect();
      const s = box.style;
      const endsPct = (v) => typeof v === 'string' && v.trim().endsWith('%');
      const toPct = (px, base) => base > 0 ? (px / base) * 100 : 0;
      const left = endsPct(s.left) ? parseFloat(s.left) : toPct(rect.left - pr.left, pr.width);
      const top = endsPct(s.top) ? parseFloat(s.top) : toPct(rect.top - pr.top, pr.height);
      const width = endsPct(s.width) ? parseFloat(s.width) : toPct(rect.width, pr.width);
      const height = endsPct(s.height) ? parseFloat(s.height) : toPct(rect.height, pr.height);
      const title = (box.querySelector('.box-title')?.textContent || '').trim();
      boxes[id] = { left: round3(left), top: round3(top), width: round3(width), height: round3(height), title };
    });
    return boxes;
  }
  function applyBoxes(snapshot){
    if (!snapshot) return;
    Object.entries(snapshot).forEach(([id, st]) => {
      const box = document.querySelector(`.draggable-box[data-id="${id}"]`);
      if (!box) return;
      const s = box.style;
      if (typeof st.left === 'number') s.left = `${st.left}%`;
      if (typeof st.top === 'number') s.top = `${st.top}%`;
      if (typeof st.width === 'number') s.width = `${st.width}%`;
      if (typeof st.height === 'number') s.height = `${st.height}%`;
      const titleEl = box.querySelector('.box-title');
      if (titleEl && typeof st.title === 'string') titleEl.textContent = st.title;
    });
    // Persist to main boxes state so autosave remains consistent
    try { localStorage.setItem(LS_BOXES_MAIN, JSON.stringify(snapshot)); } catch {}
    // Trigger a resize-based recalculation for items in boxes
    window.dispatchEvent(new Event('resize'));
  }

  // ---- Items snapshot/apply ----
  const inv = document.querySelector('.inventory');
  function getCellSize(){
    const cs = getComputedStyle(inv);
    return {
      cell: parseFloat(cs.getPropertyValue('--inv-cell')) || 40,
      gap: parseFloat(cs.getPropertyValue('--inv-gap')) || 4,
    };
  }
  function scaleItemToBox(item, boxContent){
    const w = parseInt(item.style.getPropertyValue('--w') || '1', 10) || 1;
    const h = parseInt(item.style.getPropertyValue('--h') || '1', 10) || 1;
    const {cell, gap} = getCellSize();
    const baseW = w * cell + (w - 1) * gap;
    const baseH = h * cell + (h - 1) * gap;
    const r = boxContent.getBoundingClientRect();
    const availW = Math.max(0, r.width);
    const availH = Math.max(0, r.height);
    let scale = 1;
    if (baseW > 0 && baseH > 0) {
      scale = Math.min(availW / baseW, availH / baseH, 1);
    }
    item.style.setProperty('--scale', String(scale));
  }

  function snapshotItems(){
    const out = {};
    const all = document.querySelectorAll('.inventory .item, .box-content .item');
    all.forEach((item) => {
      const id = item.dataset.itemId;
      if (!id) return;
      if (item.closest('.inventory')){
        const col = parseInt(item.style.getPropertyValue('--col') || '1', 10) || 1;
        const row = parseInt(item.style.getPropertyValue('--row') || '1', 10) || 1;
        const w = parseInt(item.style.getPropertyValue('--w') || '1', 10) || 1;
        const h = parseInt(item.style.getPropertyValue('--h') || '1', 10) || 1;
        out[id] = { loc: 'inv', col, row, w, h };
      } else {
        const box = item.closest('.draggable-box');
        const boxId = box?.getAttribute('data-id');
        const w = parseInt(item.style.getPropertyValue('--w') || '1', 10) || 1;
        const h = parseInt(item.style.getPropertyValue('--h') || '1', 10) || 1;
        if (boxId) out[id] = { loc: 'box', boxId, w, h };
      }
    });
    return out;
  }
  function applyItems(snapshot){
    if (!snapshot) return;
    Object.entries(snapshot).forEach(([id, st]) => {
      const item = document.querySelector(`.item[data-item-id="${id}"]`);
      if (!item) return;
      if (st.loc === 'inv'){
        if (item.parentElement !== inv) inv.appendChild(item);
        item.classList.add('in-inventory');
        item.style.setProperty('--col', st.col || 1);
        item.style.setProperty('--row', st.row || 1);
        item.style.setProperty('--w', st.w || 1);
        item.style.setProperty('--h', st.h || 1);
        item.style.removeProperty('--scale');
      } else if (st.loc === 'box' && st.boxId){
        const boxContent = document.querySelector(`.draggable-box[data-id="${st.boxId}"] .box-content`);
        if (boxContent){
          boxContent.appendChild(item);
          item.classList.remove('in-inventory');
          item.style.removeProperty('--col');
          item.style.removeProperty('--row');
          item.style.setProperty('--w', st.w || 1);
          item.style.setProperty('--h', st.h || 1);
          scaleItemToBox(item, boxContent);
        }
      }
    });
    // Persist to main items state
    try { localStorage.setItem(LS_ITEMS_MAIN, JSON.stringify(snapshot)); } catch {}
  }

  function loadSnapshot(){
    try {
      const raw = localStorage.getItem(LS_SNAPSHOT);
      if (!raw) return null;
      const parsed = JSON.parse(raw) || null;
      const { snapshot, changed } = normalizeSnapshot(parsed);
      if (snapshot && changed) saveSnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }
  function saveSnapshot(data){
    const { snapshot } = normalizeSnapshot(data);
    if (!snapshot) return;
    try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(snapshot)); } catch {}
  }

  function captureSnapshot(){
    const base = { ts: Date.now(), boxes: snapshotBoxes(), items: snapshotItems() };
    return normalizeSnapshot(base).snapshot;
  }
  function onSave(){
    const snap = captureSnapshot();
    saveSnapshot(snap);
    populateBackupSelect(manualOptionValue(snap));
    BTN_SAVE.disabled = true;
    setTimeout(() => BTN_SAVE.disabled = false, 400);
  }
  function getSelectedBackupSnapshot(){
    if (BACKUP_SELECT){
      const selected = BACKUP_SELECT.value || '';
      if (selected && backupMap.has(selected)) return backupMap.get(selected);
    }
    const manual = loadSnapshot();
    if (manual) return manual;
    const autos = loadAutoBackups();
    return autos[0] || null;
  }
  function onRestore(){
    const snap = getSelectedBackupSnapshot();
    if (!snap) return;
    applyBoxes(snap.boxes || {});
    applyItems(snap.items || {});
    BTN_RESTORE.disabled = true; setTimeout(() => BTN_RESTORE.disabled = false, 400);
  }

  function loadAutoBackups(){
    try {
      const raw = localStorage.getItem(LS_AUTO_BACKUP);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      let dirty = false;
      const normalized = list.map((snap) => {
        const { snapshot, changed } = normalizeSnapshot(snap);
        if (changed) dirty = true;
        return snapshot;
      }).filter(Boolean);
      normalized.sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
      if (normalized.length > MAX_AUTO_BACKUPS){
        normalized.length = MAX_AUTO_BACKUPS;
        dirty = true;
      }
      if (dirty){
        try { localStorage.setItem(LS_AUTO_BACKUP, JSON.stringify(normalized)); } catch {}
      }
      return normalized;
    } catch {
      return [];
    }
  }
  function saveAutoBackup(data){
    const { snapshot } = normalizeSnapshot(data);
    if (!snapshot) return;
    const backups = loadAutoBackups().filter(Boolean);
    backups.push(snapshot);
    backups.sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
    if (backups.length > MAX_AUTO_BACKUPS) backups.length = MAX_AUTO_BACKUPS;
    try {
      localStorage.setItem(LS_AUTO_BACKUP, JSON.stringify(backups));
    } catch (err){
      console.warn('Auto backup failed to save', err);
    }
    populateBackupSelect(autoOptionValue(snapshot));
  }
  function addBackupOption(value, label){
    if (!BACKUP_SELECT) return;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    BACKUP_SELECT.appendChild(opt);
  }
  function populateBackupSelect(preferredValue){
    if (!BACKUP_SELECT) return;
    const previousValue = preferredValue ?? BACKUP_SELECT.value ?? '';
    backupMap.clear();
    BACKUP_SELECT.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '복구 시점 없음';
    BACKUP_SELECT.appendChild(placeholder);
    let firstSelectable = '';
    const manualSnap = loadSnapshot();
    if (manualSnap){
      const value = manualOptionValue(manualSnap);
      const timeLabel = formatTimestamp(manualSnap.ts) || '시간 정보 없음';
      addBackupOption(value, `수동 저장 (${timeLabel})`);
      backupMap.set(value, manualSnap);
      if (!firstSelectable) firstSelectable = value;
    }
    const autoBackups = loadAutoBackups();
    autoBackups.forEach((snap, idx) => {
      if (!snap) return;
      const value = autoOptionValue(snap);
      const timeLabel = formatTimestamp(snap.ts) || '시간 정보 없음';
      addBackupOption(value, `자동 백업 ${idx + 1} (${timeLabel})`);
      backupMap.set(value, snap);
      if (!firstSelectable) firstSelectable = value;
    });
    placeholder.disabled = backupMap.size > 0;
    placeholder.selected = backupMap.size === 0;
    const targetValue = (previousValue && backupMap.has(previousValue)) ? previousValue : (firstSelectable || '');
    if (targetValue) BACKUP_SELECT.value = targetValue;
  }
  function startAutoBackupTimer(){
    if (!AUTO_BACKUP_INTERVAL_MS || AUTO_BACKUP_INTERVAL_MS <= 0) return;
    const runBackup = () => {
      const snap = captureSnapshot();
      saveAutoBackup(snap);
    };
    runBackup();
    setInterval(runBackup, AUTO_BACKUP_INTERVAL_MS);
  }

  populateBackupSelect();
  BTN_SAVE?.addEventListener('click', onSave);
  BTN_RESTORE?.addEventListener('click', onRestore);
  startAutoBackupTimer();
})();
