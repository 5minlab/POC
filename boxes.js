(function(){
  'use strict';

  const leftPanel = document.querySelector('.panel.left');
  const layer = document.querySelector('.boxes-layer');
  if (!leftPanel || !layer) return;

  // Ensure the left panel is the positioning context
  const panelRect = () => leftPanel.getBoundingClientRect();

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  function setupBox(box) {
    const handle = box.querySelector('.box-handle');
    const title = box.querySelector('.box-title');

    let dragging = false;
    let offsetX = 0, offsetY = 0;

    function onPointerDown(e){
      dragging = true;
      const br = box.getBoundingClientRect();
      offsetX = e.clientX - br.left;
      offsetY = e.clientY - br.top;
      handle.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e){
      if (!dragging) return;
      const pr = panelRect();
      const newLeft = clamp(e.clientX - pr.left - offsetX, 0, pr.width - box.offsetWidth);
      const newTop  = clamp(e.clientY - pr.top  - offsetY, 0, pr.height - box.offsetHeight);
      box.style.left = `${newLeft}px`;
      box.style.top  = `${newTop}px`;
    }

    function onPointerUp(e){
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch {}
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
    });
  }

  document.querySelectorAll('.draggable-box').forEach(setupBox);
})();
