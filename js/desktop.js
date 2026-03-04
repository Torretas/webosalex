/* =============================================
   DESKTOP CORE — icons, windows, taskbar, ctx
   ============================================= */

const Desktop = (() => {

  /* ---------- STATE ---------- */
  let items = [];       // { id, type, label, icon, x, y, data, parentFolder }
  let windows = [];     // { id, itemId, el, minimized, maximized, prevRect }
  let zCounter = 100;
  let ctxTarget = null; // item or null (desktop)
  let selectionStart = null;

  /* ---------- ICONS MAP ---------- */
  const TYPE_ICONS = {
    folder: '📁',
    link:   '🔗',
    note:   '📝',
    pdf:    '📄',
    video:  '🎬',
    image:  '🖼️',
  };

  /* ---------- INIT ---------- */
  function init() {
    load();
    renderDesktop();
    initTaskbar();
    initContextMenu();
    initSelection();
    tick();
  }

  /* ---------- STORAGE ---------- */
  function save() {
    localStorage.setItem('webos_items', JSON.stringify(items));
    // Sincroniza con Drive si está conectado (debounced)
    if (typeof Drive !== 'undefined' && Drive.isLoggedIn()) {
      clearTimeout(save._timer);
      save._timer = setTimeout(() => Drive.saveConfig(), 1200);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem('webos_items');
      if (raw) items = JSON.parse(raw);
    } catch(e) { items = []; }
    if (!items.length) seedDefaults();
  }

  function seedDefaults() {
    items = [
      { id: uid(), type: 'folder', label: 'Apuntes',  icon: '📚', x: 20,  y: 20,  data: {} },
      { id: uid(), type: 'folder', label: 'Links',    icon: '🌐', x: 20,  y: 130, data: {} },
      { id: uid(), type: 'note',   label: 'Bienvenida', icon: '📝', x: 20,  y: 240, data: { content: '# Bienvenido a tu WebOS personal\n\nEmpieza a organizar tus apuntes y links.' } },
    ];
    save();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- RENDER DESKTOP ICONS ---------- */
  function renderDesktop() {
    const container = document.getElementById('desktop-icons');
    container.innerHTML = '';
    items
      .filter(item => !item.parentFolder)
      .forEach(item => container.appendChild(createIconEl(item, false)));
  }

  function createIconEl(item, inFolder) {
    const el = document.createElement('div');
    el.className = 'icon';
    el.dataset.id = item.id;
    if (!inFolder) {
      el.style.left = item.x + 'px';
      el.style.top  = item.y + 'px';
    }
    el.innerHTML = `
      <div class="icon-img">${item.icon || TYPE_ICONS[item.type] || '📄'}</div>
      <div class="icon-label">${item.label}</div>
    `;
    el.addEventListener('dblclick', e => { e.stopPropagation(); openItem(item.id); });
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, item.id, inFolder);
    });
    if (!inFolder) makeDraggableIcon(el, item);
    return el;
  }

  /* ---------- DRAG ICONS ---------- */
  function makeDraggableIcon(el, item) {
    let startX, startY, origX, origY, dragging = false;

    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      startX = e.clientX; startY = e.clientY;
      origX = item.x; origY = item.y;

      // select
      if (!e.shiftKey) clearSelection();
      el.classList.add('selected');

      const onMove = mv => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (!dragging && Math.abs(dx) + Math.abs(dy) > 4) {
          dragging = true;
          el.classList.add('dragging');
        }
        if (dragging) {
          item.x = Math.max(0, origX + dx);
          item.y = Math.max(0, origY + dy);
          el.style.left = item.x + 'px';
          el.style.top  = item.y + 'px';
        }
      };

      const onUp = () => {
        if (dragging) { dragging = false; el.classList.remove('dragging'); save(); }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function clearSelection() {
    document.querySelectorAll('.icon.selected').forEach(el => el.classList.remove('selected'));
  }

  /* ---------- SELECTION BOX ---------- */
  function initSelection() {
    const desktop = document.getElementById('desktop');
    const box = document.getElementById('selection-box');

    desktop.addEventListener('mousedown', e => {
      if (e.target !== desktop && e.target !== document.getElementById('desktop-icons')) return;
      if (e.button !== 0) return;
      clearSelection();
      selectionStart = { x: e.clientX, y: e.clientY };
      box.style.display = 'block';
      box.style.left = e.clientX + 'px';
      box.style.top  = e.clientY + 'px';
      box.style.width = '0';
      box.style.height = '0';

      const onMove = mv => {
        const x1 = Math.min(selectionStart.x, mv.clientX);
        const y1 = Math.min(selectionStart.y, mv.clientY);
        const x2 = Math.max(selectionStart.x, mv.clientX);
        const y2 = Math.max(selectionStart.y, mv.clientY);
        box.style.left   = x1 + 'px';
        box.style.top    = y1 + 'px';
        box.style.width  = (x2 - x1) + 'px';
        box.style.height = (y2 - y1) + 'px';

        // highlight overlapping icons
        document.querySelectorAll('#desktop-icons .icon').forEach(icon => {
          const r = icon.getBoundingClientRect();
          const hit = r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1;
          icon.classList.toggle('selected', hit);
        });
      };

      const onUp = () => {
        box.style.display = 'none';
        selectionStart = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ---------- OPEN ITEM ---------- */
  function openItem(itemId, fromFolderWinId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // If already open, focus
    const existing = windows.find(w => w.itemId === itemId);
    if (existing) { focusWindow(existing); existing.el.classList.remove('minimized'); updateTaskbar(); return; }

    if (item.type === 'folder') openFolder(item, fromFolderWinId);
    else if (item.type === 'note')   Apps.openNote(item, createWindow);
    else if (item.type === 'link')   Apps.openLink(item, createWindow);
    else if (item.type === 'pdf')    Apps.openPDF(item, createWindow);
    else if (item.type === 'video')  Apps.openVideo(item, createWindow);
    else if (item.type === 'image')  Apps.openImage(item, createWindow);
  }

  /* ---------- FOLDER WINDOW ---------- */
  function openFolder(item, fromFolderWinId) {
    const winEl = createWindow({
      title: item.label,
      icon: item.icon || '📁',
      width: 520, height: 380,
      itemId: item.id,
    });

    const body = winEl.querySelector('.win-body');
    renderFolderContent(body, item.id, winEl.dataset.winId);
  }

  function renderFolderContent(body, folderId, winId) {
    body.innerHTML = '<div class="folder-grid"></div>';
    const grid = body.querySelector('.folder-grid');

    const children = items.filter(i => i.parentFolder === folderId);
    children.forEach(child => {
      const el = createIconEl(child, true);
      el.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, child.id, true, folderId, winId);
      });
      grid.appendChild(el);
    });

    // Clic derecho en el área vacía de la carpeta
    body.addEventListener('contextmenu', e => {
      if (e.target.closest('.icon')) return; // el icono ya tiene su propio listener
      e.preventDefault();
      e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, null, false, folderId, winId);
    });

    // Drop zone: drag desktop icon into folder
    body.addEventListener('dragover', e => e.preventDefault());
  }

  /* ---------- CREATE WINDOW ---------- */
  function createWindow({ title, icon, width, height, itemId, content }) {
    const winId = uid();
    const el = document.createElement('div');
    el.className = 'window focused';
    el.dataset.winId = winId;

    // default position — cascade
    const offset = (windows.length % 8) * 30;
    const left = 80 + offset;
    const top  = 60 + offset;

    el.style.left   = left + 'px';
    el.style.top    = top + 'px';
    el.style.width  = (width  || 600) + 'px';
    el.style.height = (height || 420) + 'px';
    el.style.zIndex = ++zCounter;

    el.innerHTML = `
      <div class="win-titlebar">
        <span style="font-size:16px">${icon || '🪟'}</span>
        <span class="win-title">${title}</span>
        <div class="win-controls">
          <button class="win-btn min"   title="Minimizar"></button>
          <button class="win-btn max"   title="Maximizar"></button>
          <button class="win-btn close" title="Cerrar"></button>
        </div>
      </div>
      <div class="win-body">${content || ''}</div>
      <div class="win-resize"></div>
    `;

    document.getElementById('desktop').appendChild(el);

    const winObj = { id: winId, itemId, el, minimized: false, maximized: false, prevRect: null };
    windows.push(winObj);

    // Controls
    el.querySelector('.win-btn.close').addEventListener('click', () => closeWindow(winId));
    el.querySelector('.win-btn.min').addEventListener('click', () => minimizeWindow(winId));
    el.querySelector('.win-btn.max').addEventListener('click', () => toggleMaximize(winId));

    // Focus on click
    el.addEventListener('mousedown', () => focusWindow(winObj));

    // Drag titlebar
    makeDraggableWindow(el);

    // Resize
    makeResizableWindow(el);

    updateTaskbar();
    return el;
  }

  function focusWindow(winObj) {
    windows.forEach(w => w.el.classList.remove('focused'));
    winObj.el.style.zIndex = ++zCounter;
    winObj.el.classList.add('focused');
  }

  function closeWindow(winId) {
    const idx = windows.findIndex(w => w.id === winId);
    if (idx === -1) return;
    windows[idx].el.remove();
    windows.splice(idx, 1);
    updateTaskbar();
  }

  function minimizeWindow(winId) {
    const w = windows.find(w => w.id === winId);
    if (!w) return;
    w.minimized = !w.minimized;
    w.el.classList.toggle('minimized', w.minimized);
    updateTaskbar();
  }

  function toggleMaximize(winId) {
    const w = windows.find(w => w.id === winId);
    if (!w) return;
    if (!w.maximized) {
      w.prevRect = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
      w.el.style.left = '0'; w.el.style.top = '0';
      w.el.style.width  = '100vw';
      w.el.style.height = `calc(100vh - var(--taskbar-h))`;
      w.maximized = true;
    } else {
      const r = w.prevRect;
      w.el.style.left = r.left; w.el.style.top = r.top;
      w.el.style.width = r.width; w.el.style.height = r.height;
      w.maximized = false;
    }
  }

  /* ---------- DRAG WINDOW ---------- */
  function makeDraggableWindow(el) {
    const titlebar = el.querySelector('.win-titlebar');
    let startX, startY, origLeft, origTop;

    titlebar.addEventListener('mousedown', e => {
      if (e.target.classList.contains('win-btn')) return;
      const w = windows.find(w => w.id === el.dataset.winId);
      if (w && w.maximized) return;

      e.preventDefault();
      startX = e.clientX; startY = e.clientY;
      origLeft = parseInt(el.style.left) || 0;
      origTop  = parseInt(el.style.top)  || 0;

      const onMove = mv => {
        el.style.left = Math.max(0, origLeft + mv.clientX - startX) + 'px';
        el.style.top  = Math.max(0, origTop  + mv.clientY - startY) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ---------- RESIZE WINDOW ---------- */
  function makeResizableWindow(el) {
    const handle = el.querySelector('.win-resize');
    let startX, startY, origW, origH;

    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      startX = e.clientX; startY = e.clientY;
      origW = parseInt(el.style.width)  || el.offsetWidth;
      origH = parseInt(el.style.height) || el.offsetHeight;

      const onMove = mv => {
        const newW = Math.max(320, origW + mv.clientX - startX);
        const newH = Math.max(200, origH + mv.clientY - startY);
        el.style.width  = newW + 'px';
        el.style.height = newH + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  /* ---------- TASKBAR ---------- */
  function initTaskbar() {
    document.getElementById('taskbar-start').addEventListener('click', () => {
      showCtxMenu(60, window.innerHeight - 56, null, false, null, null, true);
    });
  }

  function updateTaskbar() {
    const bar = document.getElementById('taskbar-windows');
    bar.innerHTML = '';
    windows.forEach(w => {
      const item = items.find(i => i.id === w.itemId);
      const icon  = item ? (item.icon || TYPE_ICONS[item.type] || '🪟') : '🪟';
      const title = item ? item.label : 'Ventana';

      const btn = document.createElement('div');
      btn.className = 'taskbar-item' + (!w.minimized ? ' active' : '');
      btn.innerHTML = `<span class="taskbar-item-icon">${icon}</span><span>${title}</span>`;
      btn.addEventListener('click', () => {
        if (w.minimized) { w.minimized = false; w.el.classList.remove('minimized'); focusWindow(w); }
        else if (w.el.classList.contains('focused')) { w.minimized = true; w.el.classList.add('minimized'); }
        else focusWindow(w);
        updateTaskbar();
      });
      bar.appendChild(btn);
    });
  }

  /* ---------- CLOCK ---------- */
  function tick() {
    const el = document.getElementById('taskbar-clock');
    const now = new Date();
    el.innerHTML = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      + '<br>' + now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    setTimeout(tick, 10000);
  }

  /* ---------- CONTEXT MENU ---------- */
  function initContextMenu() {
    // desktop right-click
    document.getElementById('desktop').addEventListener('contextmenu', e => {
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, null, false);
    });
    // close on outside click
    document.addEventListener('click', hideCtxMenu);
    document.addEventListener('contextmenu', hideCtxMenu, true);
  }

  function hideCtxMenu() {
    const m = document.getElementById('ctx-menu');
    m.classList.remove('visible');
    m.innerHTML = '';
  }

  function showCtxMenu(x, y, itemId, inFolder, folderId, winId, isStart) {
    const menu = document.getElementById('ctx-menu');
    menu.innerHTML = '';

    const item = itemId ? items.find(i => i.id === itemId) : null;

    const addItem = (icon, label, cls, fn) => {
      const el = document.createElement('div');
      el.className = 'ctx-item' + (cls ? ' ' + cls : '');
      el.innerHTML = `<span>${icon}</span><span>${label}</span>`;
      el.addEventListener('click', e => { e.stopPropagation(); hideCtxMenu(); fn(); });
      menu.appendChild(el);
    };

    const addSep = () => {
      const el = document.createElement('div');
      el.className = 'ctx-separator';
      menu.appendChild(el);
    };

    if (item) {
      // Right-click on an item
      addItem('✏️', 'Renombrar', '', () => promptRename(item));
      addItem('🎨', 'Cambiar icono', '', () => promptChangeIcon(item));
      if (item.type !== 'folder') {
        addItem('✏️', 'Editar', '', () => openItem(item.id));
      }
      addSep();
      addItem('🗑️', 'Eliminar', 'danger', () => deleteItem(item.id, folderId, winId));
    } else if (!isStart) {
      // Right-click on desktop o carpeta
      addItem('📁', 'Nueva carpeta',  '', () => promptNew('folder', folderId, winId));
      addItem('📝', 'Nuevo apunte',   '', () => promptNew('note',   folderId, winId));
      addItem('🔗', 'Nuevo link',     '', () => promptNew('link',   folderId, winId));
      addItem('📄', 'Nuevo PDF',      '', () => promptNew('pdf',    folderId, winId));
      addItem('🎬', 'Nuevo vídeo',    '', () => promptNew('video',  folderId, winId));
      addSep();
      addItem('📎', 'Subir archivo',  '', () => promptUpload(folderId, winId));
    } else {
      // Start menu
      addItem('📁', 'Nueva carpeta',  '', () => promptNew('folder'));
      addItem('📝', 'Nuevo apunte',   '', () => promptNew('note'));
      addItem('🔗', 'Nuevo link',     '', () => promptNew('link'));
      addItem('📄', 'Nuevo PDF',      '', () => promptNew('pdf'));
      addItem('🎬', 'Nuevo vídeo',    '', () => promptNew('video'));
      addSep();
      addItem('📎', 'Subir archivo',  '', () => promptUpload());
      addItem('🖼️', 'Cambiar fondo',  '', () => promptBackground());
    }

    // position
    const mw = 200, mh = menu.children.length * 36;
    menu.style.left = Math.min(x, window.innerWidth  - mw) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 10) + 'px';
    menu.classList.add('visible');
  }

  /* ---------- MODALS ---------- */
  function modal(html, onSubmit) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box">${html}</div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.btn-secondary')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('form')?.addEventListener('submit', e => {
      e.preventDefault();
      onSubmit(overlay);
      overlay.remove();
    });
    // focus first input
    setTimeout(() => overlay.querySelector('input')?.focus(), 50);
    return overlay;
  }

  function promptNew(type, parentFolder, winId) {
    const typeLabel = { folder:'Carpeta', note:'Apunte', link:'Link', pdf:'PDF', video:'Vídeo' }[type];
    let extraFields = '';
    if (type === 'link' || type === 'pdf' || type === 'video') {
      extraFields = `<input name="url" placeholder="URL (https://...)" required />`;
    }

    modal(`
      <h3>Nuevo ${typeLabel}</h3>
      <form id="modal-form">
        <input name="label" placeholder="Nombre" required />
        ${extraFields}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear</button>
        </div>
      </form>
    `, overlay => {
      const form = overlay.querySelector('form');
      const label = form.label.value.trim();
      const url   = form.url ? form.url.value.trim() : '';
      if (!label) return;

      const newItem = {
        id: uid(),
        type,
        label,
        icon: TYPE_ICONS[type],
        x: 20 + Math.floor(Math.random() * 200),
        y: 20 + Math.floor(Math.random() * 200),
        data: url ? { url } : (type === 'note' ? { content: '' } : {}),
        parentFolder: parentFolder || null,
      };
      items.push(newItem);
      save();

      if (parentFolder && winId) {
        // Refresh folder window
        const win = windows.find(w => w.id === winId);
        if (win) renderFolderContent(win.el.querySelector('.win-body'), parentFolder, winId);
      } else {
        renderDesktop();
      }
    });
  }

  function promptRename(item) {
    modal(`
      <h3>Renombrar</h3>
      <form id="modal-form">
        <input name="label" value="${item.label}" required />
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    `, overlay => {
      const newLabel = overlay.querySelector('input[name=label]').value.trim();
      if (!newLabel) return;
      item.label = newLabel;
      save();
      renderDesktop();
      updateTaskbar();
      // Update open window title if any
      const w = windows.find(w => w.itemId === item.id);
      if (w) w.el.querySelector('.win-title').textContent = newLabel;
      // Refresh parent folder if needed
      if (item.parentFolder) {
        const parentWin = windows.find(w => w.itemId === item.parentFolder);
        if (parentWin) renderFolderContent(parentWin.el.querySelector('.win-body'), item.parentFolder, parentWin.id);
      }
    });
  }

  function promptChangeIcon(item) {
    modal(`
      <h3>Cambiar icono (emoji)</h3>
      <form id="modal-form">
        <input name="icon" value="${item.icon || ''}" placeholder="Pega un emoji" required maxlength="4" style="font-size:24px;text-align:center" />
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    `, overlay => {
      const val = overlay.querySelector('input[name=icon]').value.trim();
      if (!val) return;
      item.icon = val;
      save();
      renderDesktop();
      if (item.parentFolder) {
        const parentWin = windows.find(w => w.itemId === item.parentFolder);
        if (parentWin) renderFolderContent(parentWin.el.querySelector('.win-body'), item.parentFolder, parentWin.id);
      }
    });
  }

  function promptBackground() {
    modal(`
      <h3>Cambiar fondo de escritorio</h3>
      <form id="modal-form">
        <input name="url" placeholder="URL de imagen (https://...)" />
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">Aplicar</button>
        </div>
      </form>
    `, overlay => {
      const url = overlay.querySelector('input[name=url]').value.trim();
      const desktop = document.getElementById('desktop');
      if (url) {
        desktop.style.backgroundImage = `url('${url}')`;
        localStorage.setItem('webos_bg', url);
      }
    });
  }

  function promptUpload(parentFolder, winId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,.pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) { input.remove(); return; }

      const ext  = file.name.split('.').pop().toLowerCase();
      const name = file.name.replace(/\.[^/.]+$/, '');

      // Detectar tipo
      let type, icon;
      if (['txt','md'].includes(ext))                   { type = 'note';  icon = '📝'; }
      else if (ext === 'pdf')                           { type = 'pdf';   icon = '📄'; }
      else if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) { type = 'image'; icon = '🖼️'; }
      else if (['mp4','webm'].includes(ext))            { type = 'video'; icon = '🎬'; }
      else                                              { type = 'note';  icon = '📄'; }

      const MAX_SIZE = 4 * 1024 * 1024; // 4MB límite para localStorage
      if (file.size > MAX_SIZE) {
        alert(`El archivo es demasiado grande (${(file.size/1024/1024).toFixed(1)}MB). Máximo 4MB para almacenamiento local.`);
        input.remove(); return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target.result;
        let data = {};

        if (type === 'note') {
          data = { content: result }; // texto plano
        } else {
          data = { url: result }; // base64 data URL
        }

        const newItem = {
          id: uid(), type, label: name, icon,
          x: 20 + Math.floor(Math.random() * 150),
          y: 20 + Math.floor(Math.random() * 150),
          data,
          parentFolder: parentFolder || null,
        };
        items.push(newItem);
        save();

        if (parentFolder && winId) {
          const win = windows.find(w => w.id === winId);
          if (win) renderFolderContent(win.el.querySelector('.win-body'), parentFolder, winId);
        } else {
          renderDesktop();
        }
        input.remove();
      };

      if (type === 'note') reader.readAsText(file);
      else reader.readAsDataURL(file);
    });

    input.click();
  }

  function deleteItem(itemId, parentFolder, winId) {
    if (!confirm('¿Eliminar este elemento?')) return;
    // Also delete children if folder
    const toDelete = [itemId];
    const collectChildren = id => {
      items.filter(i => i.parentFolder === id).forEach(child => {
        toDelete.push(child.id);
        if (child.type === 'folder') collectChildren(child.id);
      });
    };
    collectChildren(itemId);

    // Close open windows
    toDelete.forEach(id => {
      const w = windows.find(w => w.itemId === id);
      if (w) closeWindow(w.id);
    });

    items = items.filter(i => !toDelete.includes(i.id));
    save();

    if (parentFolder && winId) {
      const win = windows.find(w => w.id === winId);
      if (win) renderFolderContent(win.el.querySelector('.win-body'), parentFolder, winId);
    } else {
      renderDesktop();
    }
  }

  /* ---------- BACKGROUND RESTORE ---------- */
  function restoreBackground() {
    const bg = localStorage.getItem('webos_bg');
    if (bg) document.getElementById('desktop').style.backgroundImage = `url('${bg}')`;
  }

  /* ---------- RELOAD (llamado desde Drive tras cargar config) ---------- */
  function reloadFromStorage() {
    try {
      const raw = localStorage.getItem('webos_items');
      if (raw) items = JSON.parse(raw);
    } catch(e) {}
    // Cierra todas las ventanas abiertas y redibuja
    windows.forEach(w => w.el.remove());
    windows = [];
    renderDesktop();
    updateTaskbar();
    // Restaurar fondo
    const bg = localStorage.getItem('webos_bg');
    if (bg) document.getElementById('desktop').style.backgroundImage = `url('${bg}')`;
  }

  /* ---------- PUBLIC ---------- */
  return { init, items: () => items, save, renderDesktop, reloadFromStorage, createWindow, updateTaskbar, openItem, uid };

})();
