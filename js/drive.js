/* =============================================
   GOOGLE DRIVE SYNC
   Guarda y carga la configuración del escritorio
   en un archivo webos-config.json en Drive.
   ============================================= */

const Drive = (() => {

  // ⚠️  RELLENA ESTO CON TUS CREDENCIALES DE GOOGLE CLOUD
  const CLIENT_ID = 'TU_CLIENT_ID_AQUI.apps.googleusercontent.com';
  const API_KEY   = 'TU_API_KEY_AQUI';

  const SCOPE     = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'webos-config.json';
  const DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

  let tokenClient = null;
  let gapiReady   = false;
  let gisReady    = false;
  let configFileId = null;  // ID del archivo en Drive una vez encontrado/creado

  /* ---------- INIT ---------- */
  async function init() {
    // Carga las dos librerías de Google en paralelo
    await Promise.all([loadGapi(), loadGis()]);
    restoreSession();
  }

  function loadGapi() {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.onload = () => {
        gapi.load('client', async () => {
          await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY] });
          gapiReady = true;
          resolve();
        });
      };
      document.head.appendChild(s);
    });
  }

  function loadGis() {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: handleTokenResponse,
        });
        gisReady = true;
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  /* ---------- AUTH ---------- */
  function login() {
    if (!gapiReady || !gisReady) { alert('Cargando librerías de Google, espera un momento...'); return; }
    // Si ya hay token vigente, lo usa directamente; si no, abre el popup de Google
    tokenClient.requestAccessToken({ prompt: gapi.client.getToken() ? '' : 'consent' });
  }

  function logout() {
    const token = gapi.client.getToken();
    if (token) google.accounts.oauth2.revoke(token.access_token, () => {});
    gapi.client.setToken(null);
    localStorage.removeItem('webos_drive_token');
    configFileId = null;
    updateUI(false);
  }

  async function handleTokenResponse(resp) {
    if (resp.error) { console.error('Drive auth error:', resp.error); return; }
    // Guarda el token para restaurarlo en la próxima visita (expira en 1h)
    const tokenData = { ...gapi.client.getToken(), savedAt: Date.now() };
    localStorage.setItem('webos_drive_token', JSON.stringify(tokenData));
    updateUI(true);
    await loadConfig();
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem('webos_drive_token');
      if (!raw) return;
      const token = JSON.parse(raw);
      const age = (Date.now() - token.savedAt) / 1000;
      if (age > 3400) { localStorage.removeItem('webos_drive_token'); return; } // expirado
      gapi.client.setToken(token);
      updateUI(true);
      loadConfig(); // carga silenciosa al arrancar
    } catch(e) {}
  }

  function isLoggedIn() {
    return !!gapi.client?.getToken();
  }

  /* ---------- CONFIG FILE ---------- */
  async function findOrCreateFile() {
    if (configFileId) return configFileId;

    // Buscar archivo existente
    const res = await gapi.client.drive.files.list({
      q: `name='${FILE_NAME}' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id,name)',
    });

    if (res.result.files.length > 0) {
      configFileId = res.result.files[0].id;
    } else {
      // Crear archivo nuevo vacío
      const created = await gapi.client.drive.files.create({
        resource: { name: FILE_NAME, mimeType: 'application/json' },
        fields: 'id',
      });
      configFileId = created.result.id;
    }
    return configFileId;
  }

  async function loadConfig() {
    try {
      setStatus('☁️ Cargando desde Drive...');
      const fileId = await findOrCreateFile();

      // Descarga el contenido
      const res = await gapi.client.drive.files.get({
        fileId,
        alt: 'media',
      });

      if (res.body && res.body.trim()) {
        const data = JSON.parse(res.body);
        if (data.items && Array.isArray(data.items)) {
          // Merge: Drive tiene prioridad sobre localStorage
          localStorage.setItem('webos_items', JSON.stringify(data.items));
          if (data.bg) localStorage.setItem('webos_bg', data.bg);
          // Recarga el escritorio con los datos de Drive
          Desktop.reloadFromStorage();
          setStatus('✅ Sincronizado con Drive');
          setTimeout(() => setStatus(''), 3000);
        }
      } else {
        // Archivo vacío — primera vez, sube la config local
        await saveConfig();
      }
    } catch(e) {
      console.error('Error cargando config de Drive:', e);
      setStatus('⚠️ Error al cargar desde Drive');
      setTimeout(() => setStatus(''), 4000);
    }
  }

  async function saveConfig() {
    if (!isLoggedIn()) return;
    try {
      const fileId = await findOrCreateFile();
      const payload = {
        items: Desktop.items(),
        bg: localStorage.getItem('webos_bg') || '',
        savedAt: new Date().toISOString(),
      };

      // Actualiza el contenido del archivo
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + gapi.client.getToken().access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      setStatus('☁️ Guardado en Drive');
      setTimeout(() => setStatus(''), 2000);
    } catch(e) {
      console.error('Error guardando en Drive:', e);
      setStatus('⚠️ Error al guardar en Drive');
      setTimeout(() => setStatus(''), 4000);
    }
  }

  /* ---------- UI ---------- */
  function updateUI(loggedIn) {
    const btn = document.getElementById('drive-btn');
    if (!btn) return;
    if (loggedIn) {
      btn.textContent = '☁️ Drive';
      btn.title = 'Sincronizado con Google Drive — clic para desconectar';
      btn.classList.add('connected');
      btn.onclick = () => {
        if (confirm('¿Desconectar Google Drive? Los datos quedan guardados en local.')) logout();
      };
    } else {
      btn.textContent = '☁️ Conectar Drive';
      btn.title = 'Conectar con Google Drive para sincronizar';
      btn.classList.remove('connected');
      btn.onclick = login;
    }
  }

  function setStatus(msg) {
    const el = document.getElementById('drive-status');
    if (el) el.textContent = msg;
  }

  return { init, login, logout, saveConfig, isLoggedIn };

})();
