(function(){
  'use strict';
  const inv = document.querySelector('.inventory');
  const panel = document.querySelector('.panel.left');
  const COLS = 12; // width (n)
  const ROWS = 10; // height (m)
  if (!inv || !panel) return;

  const dropPreview = document.createElement('div');
  dropPreview.className = 'drop-preview';
  (document.body || document.documentElement).appendChild(dropPreview);
  const dropAreaPreview = document.createElement('div');
  dropAreaPreview.className = 'drop-area-preview';
  (document.body || document.documentElement).appendChild(dropAreaPreview);
  let currentHoverBox = null;

  const pendingEquipmentEvents = [];
  let equipmentEventsEnabled = false;

  // Populate 12x12 slots once
  const total = COLS * ROWS;
  if (!inv.querySelector('.slot')) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', `Inventory slot ${i+1}`);
      frag.appendChild(cell);
    }
    if (typeof inv.prepend === 'function') {
      inv.prepend(frag);
    } else {
      inv.insertBefore(frag, inv.firstChild || null);
    }
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

  function findBoxContentAt(clientX, clientY, showPreview = false){
    const contents = document.querySelectorAll('.draggable-box .box-content');
    for (const el of contents) {
      const expanded = getExpandedRect(el);
      if (pointInRect(clientX, clientY, expanded)) {
        currentHoverBox = { content: el, rect: expanded };
        if (showPreview) {
          showDropAreaPreviewRect(expanded.left, expanded.top, expanded.width, expanded.height);
        }
        return el;
      }
    }
    currentHoverBox = null;
    if (showPreview) hideDropAreaPreview();
    return null;
  }
  function getExpandedRect(boxContent){
    const box = boxContent.closest('.draggable-box');
    const sourceRect = box ? box.getBoundingClientRect() : boxContent.getBoundingClientRect();
    const expandX = sourceRect.width * 0.5;
    const expandY = sourceRect.height * 0.5;
    return {
      left: sourceRect.left - expandX,
      top: sourceRect.top - expandY,
      width: sourceRect.width + expandX * 2,
      height: sourceRect.height + expandY * 2,
    };
  }
  function pointInRect(x, y, rect){
    return rect && x >= rect.left && x <= rect.left + rect.width &&
      y >= rect.top && y <= rect.top + rect.height;
  }

  function hideDropPreview(){
    dropPreview.style.display = 'none';
  }
  function showDropPreviewRect(left, top, width, height, boxMode){
    dropPreview.style.display = 'block';
    dropPreview.style.left = `${left}px`;
    dropPreview.style.top = `${top}px`;
    dropPreview.style.width = `${Math.max(0, width)}px`;
    dropPreview.style.height = `${Math.max(0, height)}px`;
    dropPreview.classList.toggle('box-mode', !!boxMode);
  }
  function previewInventoryPlacement(col, row, w, h){
    const {cell, gap} = getCellSize();
    const r = invRect();
    const left = r.left + (col - 1) * (cell + gap);
    const top = r.top + (row - 1) * (cell + gap);
    const width = w * cell + (w - 1) * gap;
    const height = h * cell + (h - 1) * gap;
    showDropPreviewRect(left, top, width, height, false);
  }
  function previewBoxArea(boxContent){
    const box = boxContent.closest('.draggable-box');
    const target = box ? box.getBoundingClientRect() : boxContent.getBoundingClientRect();
    showDropPreviewRect(target.left, target.top, target.width, target.height, true);
  }
  function hideDropAreaPreview(){
    dropAreaPreview.style.display = 'none';
  }
  function showDropAreaPreviewRect(left, top, width, height){
    dropAreaPreview.style.display = 'block';
    dropAreaPreview.style.left = `${left}px`;
    dropAreaPreview.style.top = `${top}px`;
    dropAreaPreview.style.width = `${Math.max(0, width)}px`;
    dropAreaPreview.style.height = `${Math.max(0, height)}px`;
  }
  function getBoxInfo(boxContent){
    const box = boxContent.closest('.draggable-box');
    return {
      boxId: box?.getAttribute('data-id') || '',
      slotType: getBoxSlotType(boxContent)
    };
  }
  function getItemType(item){
    return (item?.dataset?.itemType || '').trim().toLowerCase();
  }
  function getBoxSlotType(boxContent){
    const box = boxContent.closest('.draggable-box');
    return (box?.dataset?.slotType || '').trim().toLowerCase();
  }
  function getBoxTitle(boxContent){
    const box = boxContent.closest('.draggable-box');
    const title = box?.querySelector('.box-title')?.textContent || '';
    return title.trim();
  }
  function canDropInBox(item, boxContent){
    const type = getItemType(item);
    const required = getBoxSlotType(boxContent);
    if (required && (!type || type !== required)) return false;
    return true;
  }
  function getItemEffects(itemId){
    return null;
  }
  function dispatchEquipmentChange(item, equipped, slotType){
    if (!item) return;
    const itemId = item.dataset.itemId || '';
    if (!itemId) return;
    const effects = getItemEffects(itemId);
    const detail = { itemId, itemType: getItemType(item) || '', equipped: !!equipped };
    if (slotType) detail.slotType = slotType;
    if (effects) detail.effects = effects;
    if (!equipmentEventsEnabled) {
      pendingEquipmentEvents.push(detail);
    } else {
      window.dispatchEvent(new CustomEvent('inventory:equipment-change', { detail }));
    }
  }
  function clearEquipmentState(item){
    if (!item?.dataset?.equippedSlot) return;
    const prevType = item.dataset.equippedSlotType || '';
    delete item.dataset.equippedSlot;
    delete item.dataset.equippedSlotType;
    dispatchEquipmentChange(item, false, prevType);
  }
  function applyEquipmentState(item, boxId, slotType){
    if (!item) return;
    if (item.dataset.equippedSlot === boxId) return;
    clearEquipmentState(item);
    if (!boxId) return;
    item.dataset.equippedSlot = boxId;
    if (slotType) item.dataset.equippedSlotType = slotType;
    else delete item.dataset.equippedSlotType;
    dispatchEquipmentChange(item, true, slotType || '');
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
      clearEquipmentState(item);
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
        const info = getBoxInfo(box);
        applyEquipmentState(item, info.boxId, info.slotType);
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
    hideDropPreview();
    const pointerId = e.pointerId;
    item.setPointerCapture?.(pointerId);
    item.classList.add('dragging');
    const startRect = item.getBoundingClientRect();
    const offsetX = e.clientX - startRect.left;
    const offsetY = e.clientY - startRect.top;
    const startWidth = startRect.width;
    const startHeight = startRect.height;
    const itemW = parseInt(item.style.getPropertyValue('--w') || '1', 10) || 1;
    const itemH = parseInt(item.style.getPropertyValue('--h') || '1', 10) || 1;

    // Drag ghost
    const ghost = item.cloneNode(true);
    ghost.classList.remove('dragging');
    ghost.style.position = 'fixed';
    ghost.style.left = (e.clientX - offsetX) + 'px';
    ghost.style.top = (e.clientY - offsetY) + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.9';
    ghost.style.zIndex = '9999';
    ghost.style.width = `${startWidth}px`;
    ghost.style.height = `${startHeight}px`;
    document.body.appendChild(ghost);

    function updateDropPreview(ev){
      const dropCell = pointToCell(ev.clientX, ev.clientY);
      const boxContent = findBoxContentAt(ev.clientX, ev.clientY, true);
      if (dropCell) {
        const col = Math.min(COLS - (itemW - 1), Math.max(1, dropCell.col));
        const row = Math.min(ROWS - (itemH - 1), Math.max(1, dropCell.row));
        previewInventoryPlacement(col, row, itemW, itemH);
        hideDropAreaPreview();
      } else if (boxContent) {
        if (canDropInBox(item, boxContent)) {
          previewBoxArea(boxContent);
        } else {
          hideDropPreview();
          hideDropAreaPreview();
        }
      } else {
        hideDropPreview();
        hideDropAreaPreview();
      }
    }

    function onMove(ev){
      ghost.style.left = (ev.clientX - offsetX) + 'px';
      ghost.style.top = (ev.clientY - offsetY) + 'px';
      updateDropPreview(ev);
    }
    function onUp(ev){
      updateDropPreview(ev);
      item.releasePointerCapture?.(pointerId);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      item.classList.remove('dragging');
      hideDropPreview();
      const dropCell = pointToCell(ev.clientX, ev.clientY);
      const boxContent = findBoxContentAt(ev.clientX, ev.clientY, true);
    const st = loadItems();
    if (dropCell) {
      // Drop to inventory grid (snap to cell), ensure fits within bounds for its size
        const w = itemW;
        const h = itemH;
        const col = Math.min(COLS - (w - 1), Math.max(1, dropCell.col));
        const row = Math.min(ROWS - (h - 1), Math.max(1, dropCell.row));
        if (item.parentElement !== inv) inv.appendChild(item);
        item.classList.add('in-inventory');
        item.style.setProperty('--col', col);
        item.style.setProperty('--row', row);
        item.style.removeProperty('--scale');
        st[id] = { loc: 'inv', col, row, w, h };
        saveItems(st);
        clearEquipmentState(item);
      }
      let targetBoxContent = boxContent;
      if (!targetBoxContent && currentHoverBox && pointInRect(ev.clientX, ev.clientY, currentHoverBox.rect)) {
        targetBoxContent = currentHoverBox.content;
      }
      if (targetBoxContent && canDropInBox(item, targetBoxContent)) {
        // Drop into a box area
        targetBoxContent.appendChild(item);
        item.classList.remove('in-inventory');
        item.style.removeProperty('--col');
        item.style.removeProperty('--row');
        const box = targetBoxContent.closest('.draggable-box');
        const boxId = box?.getAttribute('data-id');
        if (boxId) {
          const w = itemW;
          const h = itemH;
          st[id] = { loc: 'box', boxId, w, h };
          saveItems(st);
          // Scale item to fit inside the box content
          scaleItemToBox(item, targetBoxContent);
          const info = getBoxInfo(targetBoxContent);
          applyEquipmentState(item, info.boxId, info.slotType);
        }
      } else if (targetBoxContent) {
        // box hovered but item not allowed; ignore drop
      }
      ghost.remove();
      hideDropPreview();
      hideDropAreaPreview();
    }
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
  }

  // Bind drag handlers to all items (inventory or boxes)
  function bindItemDrag(item){
    item.addEventListener('pointerdown', startDrag);
  }

  document.querySelectorAll('.inventory .item, .box-content .item').forEach((item) => {
    bindItemDrag(item);
  });
  enableEquipmentEvents();

  function enableEquipmentEvents(){
    if (equipmentEventsEnabled) return;
    equipmentEventsEnabled = true;
    while (pendingEquipmentEvents.length) {
      const detail = pendingEquipmentEvents.shift();
      window.dispatchEvent(new CustomEvent('inventory:equipment-change', { detail }));
    }
  }

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
