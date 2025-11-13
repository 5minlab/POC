(function(){
  'use strict';
  const panel = document.querySelector('.panel.left');
  const toolbar = document.querySelector('.left-toolbar');
  if (!panel || !toolbar) return;

  const BTN_SAVE = toolbar.querySelector('.btn-save');
  const BTN_RESTORE = toolbar.querySelector('.btn-restore');

  const LS_BOXES_MAIN = 'poc_boxes_state_v1';
  const LS_ITEMS_MAIN = 'poc_items_state_v1';
  const LS_SNAPSHOT = 'poc_manual_snapshot_v1';

  function panelRect(){ return panel.getBoundingClientRect(); }
  function round3(x){ return Math.round(x * 1000) / 1000; }

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
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveSnapshot(data){
    try { localStorage.setItem(LS_SNAPSHOT, JSON.stringify(data)); } catch {}
  }

  function onSave(){
    const boxes = snapshotBoxes();
    const items = snapshotItems();
    const snap = { ts: Date.now(), boxes, items };
    saveSnapshot(snap);
    // Optional lightweight feedback via title flash
    BTN_SAVE.disabled = true; setTimeout(() => BTN_SAVE.disabled = false, 400);
  }
  function onRestore(){
    const snap = loadSnapshot();
    if (!snap) return;
    applyBoxes(snap.boxes || {});
    applyItems(snap.items || {});
    BTN_RESTORE.disabled = true; setTimeout(() => BTN_RESTORE.disabled = false, 400);
  }

  BTN_SAVE?.addEventListener('click', onSave);
  BTN_RESTORE?.addEventListener('click', onRestore);
})();
