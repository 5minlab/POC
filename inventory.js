(function(){
  'use strict';
  const inv = document.querySelector('.inventory');
  const panel = document.querySelector('.panel.left');
  if (!inv || !panel) return;

  // Populate 12x12 slots once
  const total = 12 * 12;
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
    const topGutter = 8;   // reserve a small top gutter so it won't cross upper area
    const bottomGutter = 8; // matches CSS bottom: 8px

    const panelWidth = panel.clientWidth;
    const panelHeight = panel.clientHeight;

    // Available size for the inventory box
    const maxW = Math.max(0, panelWidth - sideGutter * 2);
    const maxH = Math.max(0, panelHeight - (topGutter + bottomGutter));

  // For a 12x12 grid: size = 12*cell + 11*gap + 2*pad (pad=0 here)
  const cellFromW = (maxW - (11 * gap) - (2 * pad)) / 12;
  const cellFromH = (maxH - (11 * gap) - (2 * pad)) / 12;
  let cell = Math.min(cellFromW, cellFromH); // maximize within constraints
  cell = Math.max(12, cell); // ensure clickable min size

    // Set CSS variable to drive width/height and grid sizing
    inv.style.setProperty('--inv-cell', px(cell) + 'px');
  }

  // Initial and on resize
  layoutInventory();
  window.addEventListener('resize', layoutInventory);

  // Add a 1x2 Hammer item if not present
  if (!inv.querySelector('[data-item-id="hammer"]')) {
    const item = document.createElement('div');
    item.className = 'item hammer';
    item.setAttribute('data-item-id', 'hammer');
    item.setAttribute('role', 'img');
    item.setAttribute('aria-label', 'Hammer (1x2)');
    // Place at column 1, row 1, width 1, height 2
    item.style.setProperty('--col', 1);
    item.style.setProperty('--row', 1);
    item.style.setProperty('--w', 1);
    item.style.setProperty('--h', 2);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = '🔨';
    item.appendChild(label);

    inv.appendChild(item);
  }

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
    const totalW = 12 * cell + 11 * gap;
    const totalH = 12 * cell + 11 * gap;
    if (x < 0 || y < 0 || x > totalW || y > totalH) return null;
    const unit = cell + gap;
    const col = Math.floor((x + 0.0001) / unit) + 1;
    const row = Math.floor((y + 0.0001) / unit) + 1;
    if (col < 1 || row < 1 || col > 12 || row > 12) return null;
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
      item.style.setProperty('--col', st.col);
      item.style.setProperty('--row', st.row);
      item.style.setProperty('--w', st.w || 1);
      item.style.setProperty('--h', st.h || 1);
    } else if (st.loc === 'box' && st.boxId) {
      const box = document.querySelector(`.draggable-box[data-id="${st.boxId}"] .box-content`);
      if (box) {
        box.appendChild(item);
        item.classList.remove('in-inventory');
        // Clear inventory positioning
        item.style.removeProperty('--col');
        item.style.removeProperty('--row');
      }
    }
  }

  // Initialize from saved state
  const itemsState = loadItems();
  document.querySelectorAll('.inventory .item, .box-content .item').forEach((item) => {
    const id = item.dataset.itemId;
    if (id && itemsState[id]) applyItemState(item, itemsState[id]);
  });

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
        const col = Math.min(12 - (w - 1), Math.max(1, dropCell.col));
        const row = Math.min(12 - (h - 1), Math.max(1, dropCell.row));
        if (item.parentElement !== inv) inv.appendChild(item);
        item.classList.add('in-inventory');
        item.style.setProperty('--col', col);
        item.style.setProperty('--row', row);
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
})();
