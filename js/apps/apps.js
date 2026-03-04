/* =============================================
   APPS — Notepad, Link viewer, PDF, Video
   ============================================= */

const Apps = (() => {

  /* --------- NOTEPAD --------- */
  function openNote(item, createWindow) {
    const winEl = createWindow({
      title: item.label,
      icon: item.icon || '📝',
      width: 680, height: 500,
      itemId: item.id,
    });

    const body = winEl.querySelector('.win-body');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:6px;padding:8px 10px;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;flex-wrap:wrap;align-items:center';

    // Format buttons
    const fmtBtns = [
      { label: 'B',     style: 'font-weight:bold',   md: '**', wrap: true  },
      { label: 'I',     style: 'font-style:italic',  md: '_',  wrap: true  },
      { label: '# H1', style: '',                    md: '# ', wrap: false },
      { label: '## H2',style: '',                    md: '## ',wrap: false },
      { label: '—',    style: '',                    md: '\n---\n', wrap: false },
      { label: '• List',style: '',                   md: '- ', wrap: false },
    ];

    fmtBtns.forEach(({ label, style, md, wrap }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `${style};padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.07);color:#f0f0f0;cursor:pointer;font-size:11px`;
      btn.addEventListener('click', () => insertMarkdown(editor, md, wrap));
      toolbar.appendChild(btn);
    });

    // Preview toggle
    const previewBtn = document.createElement('button');
    previewBtn.textContent = '👁 Preview';
    previewBtn.style.cssText = 'margin-left:auto;padding:3px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(79,142,247,0.2);color:#f0f0f0;cursor:pointer;font-size:11px';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Guardar';
    saveBtn.style.cssText = 'padding:3px 10px;border-radius:4px;border:none;background:#4f8ef7;color:#fff;cursor:pointer;font-size:11px;font-weight:600';

    toolbar.appendChild(previewBtn);
    toolbar.appendChild(saveBtn);
    body.appendChild(toolbar);

    // Editor
    const editor = document.createElement('textarea');
    editor.value = item.data?.content || '';
    editor.style.cssText = 'flex:1;width:100%;padding:16px;background:transparent;color:#f0f0f0;border:none;outline:none;resize:none;font-family:\'Consolas\',monospace;font-size:13px;line-height:1.6';
    editor.placeholder = 'Escribe tus apuntes aquí... (soporta Markdown)';
    body.appendChild(editor);

    // Preview pane
    const preview = document.createElement('div');
    preview.style.cssText = 'flex:1;padding:16px;overflow:auto;display:none;line-height:1.7;color:#e0e0e0';
    body.appendChild(preview);

    let showingPreview = false;
    previewBtn.addEventListener('click', () => {
      showingPreview = !showingPreview;
      if (showingPreview) {
        preview.innerHTML = renderMarkdown(editor.value);
        preview.style.display = 'block';
        editor.style.display = 'none';
        previewBtn.textContent = '✏️ Editar';
      } else {
        preview.style.display = 'none';
        editor.style.display = 'block';
        previewBtn.textContent = '👁 Preview';
      }
    });

    saveBtn.addEventListener('click', () => {
      item.data = item.data || {};
      item.data.content = editor.value;
      Desktop.save();
      saveBtn.textContent = '✓ Guardado';
      setTimeout(() => { saveBtn.textContent = '💾 Guardar'; }, 1500);
    });

    // Auto-save on Ctrl+S
    editor.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveBtn.click();
      }
    });
  }

  function insertMarkdown(editor, md, wrap) {
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    const sel   = editor.value.substring(start, end);
    let newText;
    if (wrap && sel) {
      newText = editor.value.substring(0, start) + md + sel + md + editor.value.substring(end);
      editor.setSelectionRange(start + md.length, end + md.length);
    } else {
      newText = editor.value.substring(0, start) + md + sel + editor.value.substring(end);
      editor.setSelectionRange(start + md.length, start + md.length);
    }
    editor.value = newText;
    editor.focus();
  }

  function renderMarkdown(text) {
    // Basic Markdown renderer (no dependencies)
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold / italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // Code
      .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;font-family:monospace">$1</code>')
      // HR
      .replace(/^---$/gm, '<hr style="border-color:rgba(255,255,255,0.15)">')
      // Lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul style="padding-left:20px">$1</ul>')
      // Links
      .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" target="_blank" style="color:#4f8ef7">$1</a>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    return '<p>' + html + '</p>';
  }

  /* --------- LINK VIEWER --------- */
  function openLink(item, createWindow) {
    const url = item.data?.url || '';
    const winEl = createWindow({
      title: item.label,
      icon: item.icon || '🔗',
      width: 900, height: 600,
      itemId: item.id,
    });

    const body = winEl.querySelector('.win-body');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.padding = '0';

    // Nav bar
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0';

    const urlInput = document.createElement('input');
    urlInput.value = url;
    urlInput.style.cssText = 'flex:1;padding:5px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:20px;color:#f0f0f0;font-size:12px;outline:none';

    const goBtn = document.createElement('button');
    goBtn.textContent = '→';
    goBtn.style.cssText = 'padding:5px 12px;border-radius:20px;border:none;background:#4f8ef7;color:#fff;cursor:pointer;font-size:13px';

    const openExt = document.createElement('button');
    openExt.textContent = '↗';
    openExt.title = 'Abrir en nueva pestaña';
    openExt.style.cssText = 'padding:5px 10px;border-radius:20px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.07);color:#f0f0f0;cursor:pointer;font-size:13px';
    openExt.addEventListener('click', () => window.open(urlInput.value, '_blank'));

    nav.append(urlInput, goBtn, openExt);
    body.appendChild(nav);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'flex:1;border:none;background:#fff';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';

    const noEmbed = document.createElement('div');
    noEmbed.style.cssText = 'flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#aaa;padding:20px;text-align:center';
    noEmbed.innerHTML = `<div style="font-size:48px">🔗</div><div>Este sitio no permite incrustarse.<br>Usa el botón ↗ para abrirlo en el navegador.</div>`;

    body.appendChild(iframe);
    body.appendChild(noEmbed);

    iframe.addEventListener('error', () => {
      iframe.style.display = 'none';
      noEmbed.style.display = 'flex';
    });

    const navigate = (u) => {
      if (!u) return;
      if (!/^https?:\/\//.test(u)) u = 'https://' + u;
      urlInput.value = u;
      noEmbed.style.display = 'none';
      iframe.style.display = 'block';
      iframe.src = u;
    };

    goBtn.addEventListener('click', () => navigate(urlInput.value));
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(urlInput.value); });

    if (url) navigate(url);
  }

  /* --------- PDF VIEWER --------- */
  function openPDF(item, createWindow) {
    const url = item.data?.url || '';
    const winEl = createWindow({
      title: item.label,
      icon: item.icon || '📄',
      width: 800, height: 600,
      itemId: item.id,
    });

    const body = winEl.querySelector('.win-body');
    body.style.padding = '0';

    if (url) {
      // Use Google Docs viewer as fallback for cross-origin PDFs
      const embedUrl = url.startsWith('http') ? `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true` : url;
      body.innerHTML = `<iframe src="${embedUrl}" style="width:100%;height:100%;border:none" allowfullscreen></iframe>`;
    } else {
      body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:#aaa">
        <div style="font-size:48px">📄</div>
        <div>No se especificó URL para el PDF</div>
      </div>`;
    }
  }

  /* --------- VIDEO PLAYER --------- */
  function openVideo(item, createWindow) {
    const url = item.data?.url || '';
    const winEl = createWindow({
      title: item.label,
      icon: item.icon || '🎬',
      width: 700, height: 430,
      itemId: item.id,
    });

    const body = winEl.querySelector('.win-body');
    body.style.padding = '0';
    body.style.background = '#000';

    if (!url) {
      body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#aaa">Sin URL de vídeo</div>`;
      return;
    }

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
    if (ytMatch) {
      const id = ytMatch[1];
      body.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1" style="width:100%;height:100%;border:none" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
      return;
    }

    // Direct video file
    body.innerHTML = `<video src="${url}" controls style="width:100%;height:100%;background:#000" autoplay></video>`;
  }

  return { openNote, openLink, openPDF, openVideo };

})();
