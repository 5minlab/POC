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
})();
