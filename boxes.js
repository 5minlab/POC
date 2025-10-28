(function(){
  'use strict';

  const leftPanel = document.querySelector('.panel.left');
  const layer = document.querySelector('.boxes-layer');
  if (!leftPanel || !layer) return;

  // Ensure the left panel is the positioning context
  const panelRect = () => leftPanel.getBoundingClientRect();

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  // ---- Persistence helpers ----
  const LS_KEY = 'poc_boxes_state_v1';
  let bootstrapping = true; // ignore initial resize saves to prevent drift

  function loadState(){
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch { return {}; }
  }

  function saveState(state){
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }

  function getBoxId(box){
    return box.getAttribute('data-id') || '';
  }

  function getBoxStateFromDOM(box){
    const pr = panelRect();
    const rect = box.getBoundingClientRect();
    const s = box.style;
    const title = (box.querySelector('.box-title')?.textContent || '').trim();
    const toPct = (px, base) => base > 0 ? (px / base) * 100 : 0;
    const endsPct = (v) => typeof v === 'string' && v.trim().endsWith('%');
    const round3 = (x) => Math.round(x * 1000) / 1000;

    const left = endsPct(s.left) ? parseFloat(s.left) : toPct(rect.left - pr.left, pr.width);
    const top = endsPct(s.top) ? parseFloat(s.top) : toPct(rect.top - pr.top, pr.height);
    const width = endsPct(s.width) ? parseFloat(s.width) : toPct(rect.width, pr.width);
    const height = endsPct(s.height) ? parseFloat(s.height) : toPct(rect.height, pr.height);

    return {
      left: round3(left),
      top: round3(top),
      width: round3(width),
      height: round3(height),
      title,
    };
  }

  function applyBoxStateToDOM(box, st){
    if (!st) return;
    const s = box.style;
    if (typeof st.left === 'number') s.left = `${st.left}%`;
    if (typeof st.top === 'number') s.top = `${st.top}%`;
    if (typeof st.width === 'number') s.width = `${st.width}%`;
    if (typeof st.height === 'number') s.height = `${st.height}%`;
    const titleEl = box.querySelector('.box-title');
    if (titleEl && typeof st.title === 'string' && st.title.length) {
      titleEl.textContent = st.title;
    }
  }

  const state = loadState();

  function setupBox(box) {
    const handle = box.querySelector('.box-handle');
    const title = box.querySelector('.box-title');
    const id = getBoxId(box);

    // Apply saved state if available
    if (id && state[id]) {
      applyBoxStateToDOM(box, state[id]);
    }

    let dragging = false;
    let offsetX = 0, offsetY = 0;

    function onPointerDown(e){
      // If editing the title, do not start dragging
      if (e.target && e.target.closest('.box-title')) {
        return;
      }
      dragging = true;
      const br = box.getBoundingClientRect();
      offsetX = e.clientX - br.left;
      offsetY = e.clientY - br.top;
      try { handle.setPointerCapture(e.pointerId); } catch {}
    }

    function onPointerMove(e){
      if (!dragging) return;
      const pr = panelRect();
      const newLeftPx = clamp(e.clientX - pr.left - offsetX, 0, pr.width - box.offsetWidth);
      const newTopPx  = clamp(e.clientY - pr.top  - offsetY, 0, pr.height - box.offsetHeight);
      // Set as percentages so layout scales with panel size
      const toPct = (px, base) => base > 0 ? (px / base) * 100 : 0;
      const leftPct = toPct(newLeftPx, pr.width);
      const topPct = toPct(newTopPx, pr.height);
      box.style.left = `${leftPct}%`;
      box.style.top  = `${topPct}%`;
    }

    function onPointerUp(e){
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
      // Save position after drag ends
      queueSaveBox(box);
    }

    handle.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Prevent Enter from inserting newlines in title; blur instead
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        title.blur();
      }
    });

    // Trim extra whitespace on blur
    title.addEventListener('blur', () => {
      title.textContent = title.textContent.trim();
      queueSaveBox(box);
    });

    // Save on size changes via CSS resize handle
    const ro = new ResizeObserver(() => {
      // Debounce rapid size changes
      if (!bootstrapping) queueSaveBox(box);
    });
    try { ro.observe(box); } catch {}
  }

  // Per-box debounced save
  const saveTimers = new Map();
  function queueSaveBox(box){
    if (bootstrapping) return;
    const id = getBoxId(box);
    if (!id) return;
    if (saveTimers.has(id)) window.clearTimeout(saveTimers.get(id));
    const t = window.setTimeout(() => {
      const st = getBoxStateFromDOM(box);
      const full = loadState(); // read latest to merge
      full[id] = st;
      saveState(full);
      saveTimers.delete(id);
    }, 120);
    saveTimers.set(id, t);
  }

  document.querySelectorAll('.draggable-box').forEach(setupBox);

  // Turn off bootstrapping after initial layout stabilizes
  // Use two frames + small timeout to allow fonts/images to settle
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(() => { bootstrapping = false; }, 100);
    });
  });
})();
