(function(){
  'use strict';
  const inv = document.querySelector('.inventory');
  const panel = document.querySelector('.panel.left');
  const COLS = 10; // width (n)
  const ROWS = 12; // height (m)
  if (!inv || !panel) return;

  // Populate 12x12 slots once
  const total = COLS * ROWS;
  if (!inv.hasChildNodes()) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', `Inventory slot ${i+1}`);
      frag.appendChild(cell);
    }
    inv.appendChild(frag);
  }

  function px(n){ return Math.max(0, Math.floor(n)); }

  function layoutInventory(){
    const cs = getComputedStyle(inv);
    const gap = parseFloat(cs.getPropertyValue('--inv-gap')) || 4;
    // No container padding to maximize grid area
    const pad = 0;
    const sideGutter = 8;  // keep small side gutter from panel edges
    const gapBelowImage = 8;   // space between image bottom and inventory
    const bottomGutter = 8; // small gutter to panel bottom

    const panelWidth = panel.clientWidth;
    const panelHeight = panel.clientHeight;

    // Compute background image rendered height: background-size: 100% auto
    const panelStyle = getComputedStyle(panel);
    let bgUrl = panelStyle.backgroundImage || '';
    const match = bgUrl.match(/url\(["']?(.*?)["']?\)/);
    let imageHeightPx = 0;
    function setTopAndSize(){
      // Position inventory immediately under the image
      inv.style.top = (imageHeightPx + gapBelowImage) + 'px';
      // Available size for the inventory box
      const invTop = imageHeightPx + gapBelowImage;
      const maxW = Math.max(0, panelWidth - sideGutter * 2);
      const maxH = Math.max(0, panelHeight - (invTop + bottomGutter));
      // For a COLS x ROWS grid: size = COLS*cell + (COLS-1)*gap + 2*pad
      const cellFromW = (maxW - ((COLS - 1) * gap) - (2 * pad)) / COLS;
      const cellFromH = (maxH - ((ROWS - 1) * gap) - (2 * pad)) / ROWS;
      let cell = Math.min(cellFromW, cellFromH);
      cell = Math.max(12, cell);
      inv.style.setProperty('--inv-cell', px(cell) + 'px');
    }

    if (match && match[1]){
      const url = match[1];
      // Load intrinsic size to compute rendered height
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) {
          const ratio = img.naturalHeight / img.naturalWidth;
          imageHeightPx = Math.round(panelWidth * ratio);
        } else {
          imageHeightPx = 0;
        }
        setTopAndSize();
      };
      // If already cached by browser, onload may fire synchronously
      img.src = url;
      // Fallback in case onload is delayed; compute once with zero height
      setTopAndSize();
    } else {
      // No background image; pin to top gutter only
      imageHeightPx = 0;
      setTopAndSize();
    }
  }

  // Initial and on resize
  layoutInventory();
  window.addEventListener('resize', layoutInventory);

  // Ensure a Hammer item exists and enforce 2x1 dimensions
  (function ensureHammer(){
    let item = inv.querySelector('[data-item-id="hammer"]')
             || document.querySelector('.box-content [data-item-id="hammer"]');
    if (!item) {
      item = document.createElement('div');
      item.className = 'item hammer';
      item.setAttribute('data-item-id', 'hammer');
      item.setAttribute('role', 'img');
      item.setAttribute('aria-label', 'Hammer (2x1)');
      // Default location in inventory at 1,1
      inv.appendChild(item);
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = '🔨';
      item.appendChild(label);
    }
    // Enforce 2x1 (n x m: n=width, m=height)
    item.style.setProperty('--w', 2);
    item.style.setProperty('--h', 1);
    // If in inventory and missing position, default to 1,1
    if (item.parentElement === inv) {
      if (!item.style.getPropertyValue('--col')) item.style.setProperty('--col', 1);
      if (!item.style.getPropertyValue('--row')) item.style.setProperty('--row', 1);
    }
  })();

  // ---- Drag and Drop between inventory and boxes ----
  const LS_ITEMS = 'poc_items_state_v1';
  function loadItems(){
    try {
      const raw = localStorage.getItem(LS_ITEMS);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveItems(state){
    try { localStorage.setItem(LS_ITEMS, JSON.stringify(state)); } catch {}
  }

  function getCellSize(){
    const cs = getComputedStyle(inv);
    return {
      cell: parseFloat(cs.getPropertyValue('--inv-cell')) || 40,
      gap: parseFloat(cs.getPropertyValue('--inv-gap')) || 4,
    };
  }
  function invRect(){ return inv.getBoundingClientRect(); }

  function pointToCell(clientX, clientY){
    const r = invRect();
    const {cell, gap} = getCellSize();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const totalW = COLS * cell + (COLS - 1) * gap;
    const totalH = ROWS * cell + (ROWS - 1) * gap;
    if (x < 0 || y < 0 || x > totalW || y > totalH) return null;
    const unit = cell + gap;
    const col = Math.floor((x + 0.0001) / unit) + 1;
    const row = Math.floor((y + 0.0001) / unit) + 1;
    if (col < 1 || row < 1 || col > COLS || row > ROWS) return null;
    return {col, row};
  }

  function findBoxContentAt(clientX, clientY){
    const contents = document.querySelectorAll('.draggable-box .box-content');
    for (const el of contents) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return el;
      }
    }
    return null;
  }

  function applyItemState(item, st){
    const id = item.dataset.itemId;
    if (!id || !st) return;
    if (st.loc === 'inv') {
      if (item.parentElement !== inv) inv.appendChild(item);
      item.classList.add('in-inventory');
      const w = st.w || 1;
      const h = st.h || 1;
      // Clamp to new grid bounds
      const col = Math.min(COLS - (w - 1), Math.max(1, st.col || 1));
      const row = Math.min(ROWS - (h - 1), Math.max(1, st.row || 1));
      item.style.setProperty('--col', col);
      item.style.setProperty('--row', row);
      item.style.setProperty('--w', w);
      item.style.setProperty('--h', h);
      item.style.removeProperty('--scale');
    } else if (st.loc === 'box' && st.boxId) {
      const box = document.querySelector(`.draggable-box[data-id="${st.boxId}"] .box-content`);
      if (box) {
        box.appendChild(item);
        item.classList.remove('in-inventory');
        // Clear inventory positioning
        item.style.removeProperty('--col');
        item.style.removeProperty('--row');
        // Scale to fit box
        scaleItemToBox(item, box);
      }
    }
  }

  // Initialize from saved state
  const itemsState = loadItems();
  document.querySelectorAll('.inventory .item, .box-content .item').forEach((item) => {
    const id = item.dataset.itemId;
    if (id && itemsState[id]) applyItemState(item, itemsState[id]);
  });
  // Enforce hammer size in saved state as 2x1 regardless of previous values
  (function enforceHammerState(){
    const hammer = document.querySelector('[data-item-id="hammer"]');
    if (!hammer) return;
    const st = loadItems();
    const cur = st['hammer'] || {};
    cur.w = 2; cur.h = 1;
    if (!cur.loc) cur.loc = (hammer.parentElement === inv) ? 'inv' : 'box';
    if (cur.loc === 'inv') {
      const col = parseInt(hammer.style.getPropertyValue('--col') || '1', 10) || 1;
      const row = parseInt(hammer.style.getPropertyValue('--row') || '1', 10) || 1;
      cur.col = Math.min(COLS - (cur.w - 1), Math.max(1, col));
      cur.row = Math.min(ROWS - (cur.h - 1), Math.max(1, row));
    } else if (cur.loc === 'box') {
      const boxEl = hammer.closest('.draggable-box');
      if (boxEl) cur.boxId = boxEl.getAttribute('data-id') || cur.boxId;
    }
    st['hammer'] = cur;
    saveItems(st);
  })();

  function startDrag(e){
    const item = e.currentTarget;
    const id = item.dataset.itemId;
    if (!id) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    item.setPointerCapture?.(pointerId);
    const startRect = item.getBoundingClientRect();
    const offsetX = e.clientX - startRect.left;
    const offsetY = e.clientY - startRect.top;

    // Drag ghost
    const ghost = item.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = (e.clientX - offsetX) + 'px';
    ghost.style.top = (e.clientY - offsetY) + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.9';
    ghost.style.zIndex = '9999';
    document.body.appendChild(ghost);

    function onMove(ev){
      ghost.style.left = (ev.clientX - offsetX) + 'px';
      ghost.style.top = (ev.clientY - offsetY) + 'px';
    }
    function onUp(ev){
      item.releasePointerCapture?.(pointerId);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      const dropCell = pointToCell(ev.clientX, ev.clientY);
      const boxContent = findBoxContentAt(ev.clientX, ev.clientY);
      const st = loadItems();
      if (dropCell) {
        // Drop to inventory grid (snap to cell), ensure fits within bounds for its size
        const w = parseInt(item.style.getPropertyValue('--w') || '1', 10) || 1;
        const h = parseInt(item.style.getPropertyValue('--h') || '1', 10) || 1;
        const col = Math.min(COLS - (w - 1), Math.max(1, dropCell.col));
        const row = Math.min(ROWS - (h - 1), Math.max(1, dropCell.row));
        if (item.parentElement !== inv) inv.appendChild(item);
        item.classList.add('in-inventory');
        item.style.setProperty('--col', col);
        item.style.setProperty('--row', row);
        item.style.removeProperty('--scale');
        st[id] = { loc: 'inv', col, row, w, h };
        saveItems(st);
      } else if (boxContent) {
        // Drop into a box area
        boxContent.appendChild(item);
        item.classList.remove('in-inventory');
        item.style.removeProperty('--col');
        item.style.removeProperty('--row');
        const box = boxContent.closest('.draggable-box');
        const boxId = box?.getAttribute('data-id');
        if (boxId) {
          const w = parseInt(item.style.getPropertyValue('--w') || '1', 10) || 1;
          const h = parseInt(item.style.getPropertyValue('--h') || '1', 10) || 1;
          st[id] = { loc: 'box', boxId, w, h };
          saveItems(st);
          // Scale item to fit inside the box content
          scaleItemToBox(item, boxContent);
        }
      }
      ghost.remove();
    }
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
  }

  // Bind drag handlers to all items (inventory or boxes)
  function bindItemDrag(item){
    item.addEventListener('pointerdown', startDrag);
  }
  document.querySelectorAll('.inventory .item, .box-content .item').forEach(bindItemDrag);

  // Scale item to fit into the given box content area if it's larger
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
    // Apply scaling (will be 1 if it already fits)
    item.style.setProperty('--scale', String(scale));
  }

  // Recompute scaling when boxes resize
  const boxContents = document.querySelectorAll('.draggable-box .box-content');
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      el.querySelectorAll('.item').forEach((it) => scaleItemToBox(it, el));
    }
  });
  boxContents.forEach((el) => {
    try { ro.observe(el); } catch {}
  });

  // Also update on window resize
  window.addEventListener('resize', () => {
    boxContents.forEach((el) => {
      el.querySelectorAll('.item').forEach((it) => scaleItemToBox(it, el));
    });
  });
})();
