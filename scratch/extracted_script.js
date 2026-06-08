
// ═══════════════════════════════════════════
// ESTADO GLOBAL — AUTENTICACIÓN LOCAL (SIN SUPABASE)
// ═══════════════════════════════════════════
let socket = null;
let currentSession = null;  // { token: '...', username: '...' }

let currentConvJid = null;
let allAppointments = [];
let allInventory = [];
let allPayments = [];
let configData = null;
let currentWeekOffset = 0;

// ─── TRANSPARENT FETCH INTERCEPTOR ───
const originalFetch = window.fetch;
window.fetch = async function (resource, options = {}) {
  const url = typeof resource === 'string' ? resource : resource.url;
  if (url.startsWith('/api') && !url.includes('/api/auth/login')) {
    const saved = getLocalToken();
    if (saved) {
      options.headers = options.headers || {};
      options.headers['Authorization'] = `Bearer ${saved}`;
    }
  }
  const response = await originalFetch(resource, options);
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    console.warn('Sesión expirada (401). Redirigiendo al Login.');
    handleLogout();
  }
  return response;
};

// ─── TOKEN HELPERS ───
function getLocalToken() {
  try { return localStorage.getItem('df_token'); } catch(_){ return null; }
}
function saveLocalToken(token) {
  try { localStorage.setItem('df_token', token); } catch(_){}
}
function clearLocalToken() {
  try { localStorage.removeItem('df_token'); } catch(_){}
}

// ─── SOCKET.IO DYNAMIC CONNECTION ───
function connectSocket(token) {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on('connect', () => { fetchAll(); });
  socket.on('status', updateWAStatus);
  socket.on('qr', showQR);
  socket.on('stats', updateKPIs);
  socket.on('newMessage', msg => {
    fetchConversations();
    if (currentConvJid && msg.jid === currentConvJid) appendMsg(msg.role, msg.content);
    if (msg.role === 'user') showToast(`✉️ ${msg.clientName}: ${msg.content.substring(0,50)}...`);
  });
  socket.on('newAppointment', apt => {
    showToast(`📅 Nueva cita: ${apt.nombre} — ${apt.servicio}`);
    fetchAppointments();
  });
}

// ─── AUTHENTICATION CONTROLLER ───
async function initAuth() {
  // Check for existing token in localStorage
  const token = getLocalToken();
  if (token) {
    // Verify the token is still valid by doing a lightweight request
    try {
      const res = await originalFetch('/api/health', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        currentSession = { token };
        enterDashboard(token);
        return;
      }
    } catch(_){}
    clearLocalToken();
  }
  showLoginScreen();
}

function enterDashboard(token) {
  currentSession = { token };
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  connectSocket(token);
  fetchAll();
  startIntervals();
}

function showLoginScreen() {
  currentSession = null;
  if (socket) { socket.disconnect(); socket = null; }
  stopIntervals();
  document.getElementById('main-app').style.display = 'none';
  const lc = document.getElementById('login-container');
  lc.style.display = 'flex';
  // Hide admin panel in case it was open
  const ap = document.getElementById('admin-login-panel');
  if (ap) ap.classList.remove('visible');
  // Load registration QR
  loadLoginRegQR();
}

// ─── Load the patient registration QR on the login screen ───
let _loginQRLoaded = false;
async function loadLoginRegQR() {
  if (_loginQRLoaded) return;
  const img = document.getElementById('login-reg-qr-img');
  const spinner = document.getElementById('login-reg-spinner');
  const urlLabel = document.getElementById('login-reg-qr-url');
  if (!img) return;
  try {
    const res = await originalFetch('/api/registro-qr');
    const data = await res.json();
    if (data.qr) {
      img.src = data.qr;
      img.style.display = 'block';
      if (spinner) spinner.style.display = 'none';
      if (urlLabel) urlLabel.textContent = data.url || '';
      _loginQRLoaded = true;
    }
  } catch(e) {
    if (spinner) spinner.style.display = 'none';
    const box = document.getElementById('login-reg-qr-box');
    if (box) box.innerHTML = '<span style="color:#f87171;font-size:11px">Error al generar QR</span>';
  }
}

// ─── Reveal hidden admin panel on double-click ───
let _adminClickCount = 0;
let _adminClickTimer = null;
function revealAdminPanel() {
  _adminClickCount++;
  clearTimeout(_adminClickTimer);
  _adminClickTimer = setTimeout(() => { _adminClickCount = 0; }, 600);
  if (_adminClickCount >= 2) {
    _adminClickCount = 0;
    const panel = document.getElementById('admin-login-panel');
    if (panel) {
      panel.classList.toggle('visible');
      if (panel.classList.contains('visible')) {
        setTimeout(() => { const u = document.getElementById('login-username'); if(u) u.focus(); }, 100);
      }
    }
  }
}

// ─── Login con usuario/contraseña local (sin Supabase) ───
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('btn-login');

  showLoginError('');

  if (!username || !password) {
    showLoginError('Por favor ingresa usuario y contraseña.'); return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="login-spinner"></span><span>Ingresando...</span>';

  try {
    const res = await originalFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      saveLocalToken(data.token);
      enterDashboard(data.token);
    } else {
      showLoginError(data.error || 'Usuario o contraseña incorrectos.');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-login"></i><span id="btn-login-text">Ingresar al Panel</span>';
    }
  } catch(e) {
    showLoginError('Error de red. ¿El servidor está activo?');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i><span id="btn-login-text">Ingresar al Panel</span>';
  }
}

async function handleLogout() {
  lockMultiBots();
  clearLocalToken();
  showLoginScreen();
}

function showLoginError(msg) {
  const errorBox = document.getElementById('login-error-box');
  if (!errorBox) return;
  if (!msg) { errorBox.style.display = 'none'; errorBox.textContent = ''; return; }
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
}

// ═══ MULTI-BOTS PIN LOCK ═══
const MULTIBOT_PIN = '1213686';
let _multiBotUnlocked = false;
let _pinBuffer = '';

function requestMultiBotAccess(navEl) {
  if (_multiBotUnlocked) {
    // Already unlocked — navigate directly
    showTab('clientes', navEl);
    return;
  }
  // Show PIN modal
  _pinBuffer = '';
  updatePinDisplay();
  const m = document.getElementById('modal-pin-multibots');
  if (m) m.classList.add('open');
  const err = document.getElementById('pin-error');
  if (err) err.style.display = 'none';
}

function pinPress(digit) {
  if (_pinBuffer.length >= 7) return;
  _pinBuffer += digit;
  updatePinDisplay();
}

function pinClear() {
  _pinBuffer = _pinBuffer.slice(0, -1);
  updatePinDisplay();
}

function updatePinDisplay() {
  const d = document.getElementById('pin-display');
  if (!d) return;
  d.textContent = _pinBuffer.length > 0 ? '•'.repeat(_pinBuffer.length) : '••••';
}

function submitMultiBotPin() {
  const err = document.getElementById('pin-error');
  if (_pinBuffer === MULTIBOT_PIN) {
    _multiBotUnlocked = true;
    closeModal('modal-pin-multibots');
    // Update lock icon
    const icon = document.getElementById('multibots-lock-icon');
    if (icon) {
      icon.classList.remove('ti-lock');
      icon.classList.add('ti-lock-open');
      icon.style.color = 'var(--green-text)';
    }
    // Navigate to panel
    showTab('clientes', document.getElementById('nav-clientes'));
  } else {
    _pinBuffer = '';
    updatePinDisplay();
    if (err) { err.style.display = 'block'; }
    // Shake animation
    const card = document.querySelector('#modal-pin-multibots .pin-modal-card');
    if (card) { card.style.animation='none'; card.offsetHeight; card.style.animation='shake 0.4s ease'; }
  }
}

function lockMultiBots() {
  _multiBotUnlocked = false;
  const icon = document.getElementById('multibots-lock-icon');
  if (icon) {
    icon.classList.remove('ti-lock-open');
    icon.classList.add('ti-lock');
    icon.style.color = '';
  }
}

function lockMultiBotsSession() {
  lockMultiBots();
  showTab('dashboard', document.getElementById('nav-dashboard'));
  showToast('🔑 Acceso a Multi-Bots cerrado');
}

// ═══════════════════════════════════════════
// ACCESO MÓVIL Y REGISTRO QR FUNCTIONS
// ═══════════════════════════════════════════
async function loadRegistroQR() {
  const display = document.getElementById('qr-display');
  const label = document.getElementById('qr-url-label');
  if (!display) return;
  display.innerHTML = '<span class="spinner"></span>';
  try {
    const res = await fetch('/api/registro-qr');
    const data = await res.json();
    if (data.qr) {
      display.innerHTML = `<img src="${data.qr}" alt="QR Registro" style="width:100%;height:100%;object-fit:contain">`;
      if (label) label.textContent = data.url;
    } else {
      display.innerHTML = '<span style="color:var(--accent-red);font-size:11px">Error al generar</span>';
    }
  } catch (e) {
    display.innerHTML = '<span style="color:var(--accent-red);font-size:11px">Error de conexión</span>';
  }
}

function openMobileLoginModal() {
  const modal = document.getElementById('modal-mobile-login');
  if (modal) {
    modal.classList.add('open');
    generateMobileLoginQR();
  }
}

async function generateMobileLoginQR() {
  const img = document.getElementById('mobile-login-qr-img');
  const spinner = document.getElementById('mobile-login-qr-spinner');
  const urlLabel = document.getElementById('mobile-login-url-text');
  if (!img || !currentSession) return;

  if (spinner) spinner.style.display = 'inline-block';
  img.style.display = 'none';

  let url = window.location.origin;
  try {
    const info = await fetch('/api/server-info').then(r => r.json());
    if (info.localIp && info.localIp !== 'localhost') {
      url = `http://${info.localIp}:${info.port}`;
    }
  } catch (_) {}

  // Incrustar tokens de sesión en la URL del QR
  const access = currentSession.access_token;
  const refresh = currentSession.refresh_token;
  const fullUrl = `${url}/?access_token=${access}&refresh_token=${refresh}`;

  if (urlLabel) {
    urlLabel.textContent = `${url} (Iniciará sesión al escanear)`;
  }

  try {
    const res = await fetch(`/api/utils/qr?text=${encodeURIComponent(fullUrl)}`);
    const data = await res.json();
    if (data.qr) {
      img.src = data.qr;
      img.style.display = 'block';
    }
  } catch (err) {
    console.error('Error fetching mobile login QR:', err);
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

// ═══════════════════════════════════════════
// INIT DATA
// ═══════════════════════════════════════════
async function fetchAll() {
  // Solo buscar si hay sesión activa para evitar llamadas 401
  if (!currentSession) return;
  try {
    const [statusRes, statsRes] = await Promise.all([fetch('/api/status'), fetch('/api/stats')]);
    const status = await statusRes.json();
    const stats = await statsRes.json();
    updateWAStatus(status.whatsapp);
    if (status.qr) showQR(status.qr);
    updateKPIs(stats);
    updatePlanBadge(status.plan);
  } catch(e) {}
  fetchConversations();
  fetchAppointments();
  fetchConfig();
  fetchInventory();
  fetchPayments();
  fetchClients();
}

// ═══════════════════════════════════════════
// WHATSAPP STATUS
// ═══════════════════════════════════════════
function updateWAStatus(status) {
  const labels = { connected:'Bot activo', qr:'Escanear QR', disconnected:'Desconectado' };
  const txt = labels[status] || 'Conectando...';
  ['wa-status-badge','wa-status-badge-2'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.textContent = txt; el.className = `status-dot ${status||'disconnected'}`; }
  });
  const qrOverlay = document.getElementById('qr-overlay-wa');
  const chatPanel = document.getElementById('wa-chat-panel');
  if(status === 'connected') {
    if(qrOverlay) qrOverlay.style.display = 'none';
    if(chatPanel) chatPanel.style.display = 'flex';
  } else {
    if(qrOverlay) qrOverlay.style.display = 'block';
    if(chatPanel) chatPanel.style.display = 'none';
    if(status === 'disconnected') {
      const loadingWa = document.getElementById('qr-loading-wa');
      const imgWa = document.getElementById('qr-img-wa');
      if(loadingWa) loadingWa.style.display = 'block';
      if(imgWa) imgWa.style.display = 'none';
    }
  }
}

function showQR(qrDataUrl) {
  const qrDisplay = document.getElementById('qr-display');
  if(qrDisplay) { qrDisplay.innerHTML = `<img src="${qrDataUrl}" alt="QR" style="width:100%;height:100%;object-fit:contain">`; }
  const loadingWa = document.getElementById('qr-loading-wa');
  const imgWa = document.getElementById('qr-img-wa');
  const imgEl = document.getElementById('qr-image-wa');
  if(loadingWa) loadingWa.style.display = 'none';
  if(imgWa) imgWa.style.display = 'block';
  if(imgEl) imgEl.src = qrDataUrl;
}

// ═══════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
function updateKPIs(stats) {
  if(!stats) return;
  const msgs = stats.totalMessages || 0;
  document.getElementById('kpi-messages').textContent = msgs.toLocaleString();
  document.getElementById('kpi-conversations').textContent = `${stats.activeConversations||0} conversaciones`;
  document.getElementById('kpi-msg-bar').style.width = Math.min(msgs/100*10, 100) + '%';
  const apts = stats.totalAppointments || 0;
  document.getElementById('kpi-appointments').textContent = apts;
  document.getElementById('kpi-apt-bar').style.width = Math.min(apts*10, 100) + '%';
  const uptime = stats.uptime || 0;
  const h = Math.floor(uptime/3600), m = Math.floor((uptime%3600)/60);
  document.getElementById('kpi-uptime').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  updateInvKPI();
}

function updateInvKPI() {
  const alerts = allInventory.filter(i => i.stockActual <= i.stockMinimo).length;
  document.getElementById('kpi-inv-alert').textContent = alerts;
  document.getElementById('kpi-inv-bar').style.width = Math.min(alerts * 33, 100) + '%';
  const badge = document.getElementById('inv-alert-badge');
  if(badge) { badge.style.display = alerts > 0 ? 'inline' : 'none'; badge.textContent = alerts; }
}

function updatePlanBadge(plan) {
  const sub = document.getElementById('topbar-sub');
  if(sub) sub.textContent = `Plan ${plan || 'completo'} · Bot WhatsApp IA`;
}

// -----------------------------------------------------------------------------------------------------
// CONVERSACIONES WHATSAPP
// -----------------------------------------------------------------------------------------------------
async function fetchConversations() {
  try {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    renderConvList(data);
  } catch(e) {}
}

function renderConvList(convs) {
  const list = document.getElementById('conv-list');
  if(!list) return;
  if(!convs.length) { list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-tertiary);text-align:center">Sin conversaciones aún</div>'; return; }
  list.innerHTML = convs.map(c => `
    <div class="conv-item ${c.jid === currentConvJid ? 'active' : ''}" onclick="selectConv('${c.jid}','${escHtml(c.clientName||'Sin nombre')}')">
      <span class="conv-time">${formatTime(c.lastActivity)}</span>
      <div class="conv-name">${escHtml(c.clientName||'Sin nombre')}</div>
      <div class="conv-preview">${escHtml(c.lastMessage||'')}</div>
    </div>`).join('');
}

async function selectConv(jid, name) {
  currentConvJid = jid;
  document.getElementById('chat-title-wa').textContent = `💬 ${name}`;
  const inputArea = document.getElementById('chat-input-area-wa');
  if (inputArea) inputArea.style.display = 'flex';
  const res = await fetch(`/api/conversations/${encodeURIComponent(jid)}`);
  const msgs = await res.json();
  const area = document.getElementById('chat-msgs-wa');
  if(!msgs.length) { area.innerHTML = '<div style="margin:auto;color:var(--text-tertiary);font-size:12px">Sin mensajes</div>'; return; }
  area.innerHTML = msgs.map(m => `
    <div class="msg-bubble ${m.role}">
      ${escHtml(m.content)}
      <div class="msg-role">${m.role === 'user' ? '👤 Cliente' : '🤖 Bot'}</div>
    </div>`).join('');
  area.scrollTop = area.scrollHeight;
  fetchConversations();
}

async function sendManualMessage() {
  if (!currentConvJid) return;
  const input = document.getElementById('chat-input-msg-wa');
  const msg = input.value.trim();
  if (!msg) return;

  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(currentConvJid)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    if (res.ok) {
      input.value = '';
      appendMsg('assistant', msg);
    } else {
      showToast('Error al enviar mensaje', true);
    }
  } catch(e) {
    showToast('Error de conexión', true);
  }
}

function appendMsg(role, content) {
  const area = document.getElementById('chat-msgs-wa');
  if(!area) return;
  const div = document.createElement('div');
  div.className = `msg-bubble ${role}`;
  div.innerHTML = `${escHtml(content)}<div class="msg-role">${role==='user'?'👤 Cliente':'🤖 Bot'}</div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

// ═══════════════════════════════════════════
// CITAS
// ═══════════════════════════════════════════
async function fetchAppointments() {
  try {
    const res = await fetch('/api/appointments');
    allAppointments = await res.json();
    renderAppointments();
    renderRecentApts();
    renderServicesChart();
    renderCalendar();
  } catch(e) {}
}

function renderAppointments() {
  const body = document.getElementById('citas-body');
  if(!body) return;
  const filter = document.getElementById('filtro-estado')?.value || '';
  const data = filter ? allAppointments.filter(a => a.status === filter) : allAppointments;
  if(!data.length) { body.innerHTML = '<tr class="empty-row"><td colspan="6">No hay citas registradas</td></tr>'; return; }
  body.innerHTML = [...data].reverse().map(a => {
    const phone = (a.jid||'').replace('@s.whatsapp.net','');
    const statusBadge = '<span class="badge b-' + (a.status||'confirmada') + '">' + (a.status||'confirmada') + '</span>';
    let actions = '';
    if(a.status === 'confirmada') {
      actions = '<button class="abtn abtn-primary" onclick="markApt(\'' + a.id + '\',\'asistida\')"><i class="ti ti-check"></i>Asistencia</button>' +
                '<button class="abtn" onclick="sendManualReminder(\'' + a.id + '\', this)" style="background:var(--amber-bg);color:var(--amber-text);border:1px solid var(--amber-border)" title="Enviar recordatorio por WhatsApp"><i class="ti ti-bell"></i>Recordar</button>' +
                '<button class="abtn" onclick="openNotes(\'' + escHtml(a.nombre||'') + '\',\'' + a.id + '\')"><i class="ti ti-notes"></i>Notas</button>' +
                '<button class="abtn abtn-danger" onclick="markApt(\'' + a.id + '\',\'cancelada\')"><i class="ti ti-x"></i></button>';
    } else if(a.status === 'asistida') {
      actions = '<button class="abtn" onclick="sendManualReminder(\'' + a.id + '\', this)" style="background:var(--amber-bg);color:var(--amber-text);border:1px solid var(--amber-border)" title="Enviar recordatorio por WhatsApp"><i class="ti ti-bell"></i>Recordar</button>' +
                '<button class="abtn" onclick="openNotes(\'' + escHtml(a.nombre||'') + '\',\'' + a.id + '\')"><i class="ti ti-notes"></i>Notas</button>' +
                '<button class="abtn" onclick="openWhatsApp(\'' + phone + '\')"><i class="ti ti-brand-whatsapp"></i>WA</button>';
    } else {
      actions = '<button class="abtn" onclick="openWhatsApp(\'' + phone + '\')"><i class="ti ti-brand-whatsapp"></i>WA</button>';
    }
    const originLabel = a.source === 'manual' ? '👤 Manual' : '🤖 Chatbot IA';
    let reminderLabel = '';
    if (a.scheduledReminder) {
      const r = a.scheduledReminder;
      if (r.sent) {
        reminderLabel = '<br><span style="color:var(--green-text);font-size:10px;display:inline-block;margin-top:2px;" title="Enviado el ' + escHtml((r.sentAt||'').split('T')[0]) + '"><i class="ti ti-bell-ringing"></i> Retorno enviado</span>';
      } else {
        reminderLabel = '<br><span style="color:var(--amber-text);font-size:10px;display:inline-block;margin-top:2px;" title="Se enviará el ' + escHtml(r.sendAt) + '"><i class="ti ti-clock"></i> Prog: ' + escHtml(r.timeframe) + ' (' + escHtml(r.motive) + ')</span>';
      }
    }
    return '<tr data-id="' + (a.id||'') + '" data-estado="' + (a.status||'confirmada') + '">' +
      '<td title="' + escHtml(a.nombre||'') + '">' +
        '<strong onclick="goToCalendarAppointment(\'' + a.id + '\')" style="cursor:pointer;color:var(--blue-text);transition:color .2s" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'" title="Ver en Agenda">' + escHtml(a.nombre||'Sin nombre') + '</strong>' +
        '<br><span style="color:var(--text-tertiary);font-size:10px;display:inline-block;margin-top:2px">' + originLabel + '</span>' + reminderLabel +
      '</td>' +
      '<td>' + (phone ? '<a href="https://wa.me/' + phone + '" target="_blank" style="color:var(--text-primary);text-decoration:none">' + phone + '</a>' : '—') + '</td>' +
      '<td title="' + escHtml(a.servicio||'') + '"><span>' + escHtml(a.servicio||'—') + '</span></td>' +
      '<td>' + escHtml(a.fecha||'—') + ' ' + escHtml(a.hora||'') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td><div class="actions-cell">' + actions + '</div></td>' +
    '</tr>';
  }).join('');
}

function renderRecentApts() {
  const body = document.getElementById('recent-apts-body');
  if(!body) return;
  const recent = [...allAppointments].reverse().slice(0, 5);
  if(!recent.length) { body.innerHTML = '<tr class="empty-row"><td colspan="5">No hay citas aún</td></tr>'; return; }
  body.innerHTML = recent.map(a => {
    const actions = a.status === 'confirmada'
      ? '<button class="abtn abtn-primary" onclick="markApt(\'' + a.id + '\',\'asistida\')"><i class="ti ti-check"></i>Marcar</button>' +
        '<button class="abtn" onclick="sendManualReminder(\'' + a.id + '\', this)" style="background:var(--amber-bg);color:var(--amber-text);border:1px solid var(--amber-border);margin-left:4px" title="Enviar recordatorio por WhatsApp"><i class="ti ti-bell"></i></button>'
      : (a.status === 'asistida'
          ? '<button class="abtn" onclick="sendManualReminder(\'' + a.id + '\', this)" style="background:var(--amber-bg);color:var(--amber-text);border:1px solid var(--amber-border);margin-right:4px" title="Enviar recordatorio por WhatsApp"><i class="ti ti-bell"></i></button>' +
            '<button class="abtn" onclick="openNotes(\'' + escHtml(a.nombre||'') + '\',\'' + a.id + '\')"><i class="ti ti-notes"></i>Notas</button>'
          : '<button class="abtn" onclick="openNotes(\'' + escHtml(a.nombre||'') + '\',\'' + a.id + '\')"><i class="ti ti-notes"></i>Notas</button>'
        );
    const originLabel = a.source === 'manual' ? '👤 Manual' : '🤖 Chatbot IA';
    let reminderLabel = '';
    if (a.scheduledReminder) {
      const r = a.scheduledReminder;
      if (r.sent) {
        reminderLabel = '<br><span style="color:var(--green-text);font-size:10px;display:inline-block;margin-top:2px;" title="Enviado el ' + escHtml((r.sentAt||'').split('T')[0]) + '"><i class="ti ti-bell-ringing"></i> Retorno enviado</span>';
      } else {
        reminderLabel = '<br><span style="color:var(--amber-text);font-size:10px;display:inline-block;margin-top:2px;" title="Se enviará el ' + escHtml(r.sendAt) + '"><i class="ti ti-clock"></i> Prog: ' + escHtml(r.timeframe) + ' (' + escHtml(r.motive) + ')</span>';
      }
    }
    return '<tr>' +
      '<td>' +
        '<strong onclick="goToCalendarAppointment(\'' + a.id + '\')" style="cursor:pointer;color:var(--blue-text);transition:color .2s" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'" title="Ver en Agenda">' + escHtml(a.nombre||'Sin nombre') + '</strong>' +
        '<br><span style="color:var(--text-tertiary);font-size:10px;display:inline-block;margin-top:2px">' + originLabel + '</span>' + reminderLabel +
      '</td>' +
      '<td>' + escHtml(a.servicio||'—') + '</td>' +
      '<td>' + escHtml(a.fecha||'—') + ' ' + escHtml(a.hora||'') + '</td>' +
      '<td><span class="badge b-' + (a.status||'confirmada') + '">' + (a.status||'confirmada') + '</span></td>' +
      '<td><div class="actions-cell">' + actions + '</div></td>' +
    '</tr>';
  }).join('');
}

function renderServicesChart() {
  const serviceCount = {};
  allAppointments.forEach(a => { if(a.servicio) serviceCount[a.servicio] = (serviceCount[a.servicio]||0)+1; });
  const sorted = Object.entries(serviceCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max = sorted[0]?.[1] || 1;
  const el = document.getElementById('services-chart');
  if(!el) return;
  if(!sorted.length) { el.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:20px 0">Sin datos aún</div>'; return; }
  el.innerHTML = sorted.map(([name,val]) => `
    <div class="bar-row">
      <span class="bar-name" title="${escHtml(name)}">${escHtml(name.substring(0,12))}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(val/max*100).toFixed(0)}%"></div></div>
      <span class="bar-val">${val}</span>
    </div>`).join('');
  const statuses = {confirmada:0, asistida:0, cancelada:0};
  allAppointments.forEach(a => { if(a.status && statuses.hasOwnProperty(a.status)) statuses[a.status]++; });
  const sumEl = document.getElementById('status-summary');
  if(sumEl) sumEl.innerHTML = `
    <span class="badge b-asistida">Asistidas ${statuses.asistida}</span>
    <span class="badge b-agendada">Confirmadas ${statuses.confirmada}</span>
    <span class="badge b-cancelada">Canceladas ${statuses.cancelada}</span>`;
}

async function markApt(id, status) {
  try {
    await fetch(`/api/appointments/${id}/status`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) });
    showToast(status === 'asistida' ? '✅ Cita marcada como asistida' : '❌ Cita cancelada');
    fetchAppointments();
  } catch(e) { showToast('Error al actualizar cita', true); }
}

function filtrarCitas() { renderAppointments(); }

function openWhatsApp(phone) {
  if(!phone) return;
  window.open(`https://wa.me/${phone}`, '_blank');
}

function openNewAppointment() {
  document.getElementById('apt-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('modal-nueva-cita').classList.add('open');
}

async function saveNewAppointment() {
  const apt = {
    nombre: document.getElementById('apt-nombre').value.trim(),
    telefono: document.getElementById('apt-telefono').value.trim(),
    servicio: document.getElementById('apt-servicio').value.trim(),
    fecha: document.getElementById('apt-fecha').value,
    hora: document.getElementById('apt-hora').value
  };
  if(!apt.nombre || !apt.fecha) { showToast('Completa nombre y fecha', true); return; }
  try {
    await fetch('/api/appointments/manual', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(apt) });
    showToast('✅ Cita agendada exitosamente');
    closeModal('modal-nueva-cita');
    fetchAppointments();
    ['apt-nombre','apt-telefono','apt-servicio','apt-hora'].forEach(id => document.getElementById(id).value='');
  } catch(e) { showToast('Error al agendar', true); }
}

// ═══════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════
async function fetchInventory() {
  try {
    const res = await fetch('/api/inventory');
    allInventory = await res.json();
    renderInventory();
    updateInvKPI();
  } catch(e) {}
}

function renderInventory() {
  const body = document.getElementById('inv-body');
  if(!body) return;
  document.getElementById('inv-total').textContent = allInventory.length;
  const alerts = allInventory.filter(i => i.stockActual <= i.stockMinimo);
  document.getElementById('inv-alerta').textContent = alerts.length;
  document.getElementById('inv-normal').textContent = allInventory.length - alerts.length;
  if(!allInventory.length) { body.innerHTML = '<tr class="empty-row"><td colspan="7">No hay insumos registrados. Haz clic en "Agregar insumo".</td></tr>'; return; }
  body.innerHTML = allInventory.map(inv => {
    const pct = inv.stockMinimo > 0 ? Math.min((inv.stockActual / (inv.stockMinimo * 2)) * 100, 100) : 100;
    const isLow = inv.stockActual <= inv.stockMinimo;
    const isWarn = !isLow && inv.stockActual <= inv.stockMinimo * 1.5;
    const color = isLow ? '#E24B4A' : isWarn ? '#BA7517' : '#639922';
    const cls = isLow ? 'stock-low' : isWarn ? 'stock-warn' : 'stock-ok';
    return `<tr>
      <td title="${escHtml(inv.nombre)}">${escHtml(inv.nombre)}</td>
      <td>${escHtml(inv.categoria||'—')}</td>
      <td class="${cls}">${inv.stockActual}</td>
      <td>${inv.stockMinimo}</td>
      <td>${escHtml(inv.unidad||'')}</td>
      <td><div class="inv-bar"><div class="inv-track"><div class="inv-fill" style="width:${pct.toFixed(0)}%;background:${color}"></div></div><span style="font-size:10px;color:${color};width:34px;text-align:right">${pct.toFixed(0)}%</span></div></td>
      <td><div class="actions-cell">
        <button class="abtn" onclick="editInsumo('${inv.id}')"><i class="ti ti-edit"></i></button>
        <button class="abtn abtn-danger" onclick="deleteInsumo('${inv.id}')"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

function openNewInsumo() { document.getElementById('modal-insumo').classList.add('open'); }

async function saveInsumo() {
  const ins = {
    nombre: document.getElementById('ins-nombre').value.trim(),
    categoria: document.getElementById('ins-categoria').value,
    unidad: document.getElementById('ins-unidad').value.trim(),
    stockActual: parseInt(document.getElementById('ins-stock').value)||0,
    stockMinimo: parseInt(document.getElementById('ins-min').value)||0
  };
  if(!ins.nombre) { showToast('Ingresa el nombre del insumo', true); return; }
  try {
    await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(ins) });
    showToast('✅ Insumo guardado');
    closeModal('modal-insumo');
    ['ins-nombre','ins-unidad','ins-stock','ins-min'].forEach(id => document.getElementById(id).value='');
    fetchInventory();
  } catch(e) { showToast('Error al guardar', true); }
}

async function deleteInsumo(id) {
  if(!confirm('¿Eliminar este insumo?')) return;
  try {
    await fetch(`/api/inventory/${id}`, { method:'DELETE' });
    showToast('Insumo eliminado');
    fetchInventory();
  } catch(e) { showToast('Error al eliminar', true); }
}

function editInsumo(id) { showToast('Edición próximamente'); }

// ═══════════════════════════════════════════
// PAGOS
// ═══════════════════════════════════════════
async function fetchPayments() {
  try {
    const res = await fetch('/api/payments');
    allPayments = await res.json();
    renderPayments();
  } catch(e) {}
}

function renderPayments() {
  const body = document.getElementById('pagos-body');
  if(!body) return;
  const search = document.getElementById('pago-search')?.value.toLowerCase()||'';
  const data = search ? allPayments.filter(p => (p.nombrePaciente||'').toLowerCase().includes(search)) : allPayments;
  const total = data.filter(p=>p.estado==='pagado').reduce((s,p)=>s+(p.monto||0), 0);
  const pending = data.filter(p=>p.estado==='pendiente').reduce((s,p)=>s+(p.monto||0), 0);
  const pendingCount = data.filter(p=>p.estado==='pendiente').length;
  document.getElementById('pay-total').textContent = `$${total.toLocaleString()}`;
  document.getElementById('pay-pending').textContent = `$${pending.toLocaleString()}`;
  document.getElementById('pay-pending-count').textContent = `${pendingCount} pendiente${pendingCount!==1?'s':''}`;
  document.getElementById('pay-count').textContent = data.length;
  document.getElementById('pay-done').textContent = data.filter(p=>p.estado==='pagado').length;
  if(!data.length) { body.innerHTML = '<tr class="empty-row"><td colspan="8">No hay pagos registrados</td></tr>'; return; }
    body.innerHTML = [...data].reverse().map((p,i) => `<tr>
    <td>#${String(data.length - i).padStart(4,'0')}</td>
    <td title="${escHtml(p.nombrePaciente||'')}"><strong>${escHtml(p.nombrePaciente||'â€”')}</strong></td>
    <td>${escHtml(p.servicio||'â€”')}</td>
    <td>${(p.monto||0).toLocaleString()}</td>
    <td>${escHtml(p.formaPago||'â€”')}</td>
    <td>${escHtml(p.fecha||'â€”')}</td>
    <td><span class="badge b-${p.estado||'pendiente'}">${p.estado||'pendiente'}</span></td>
    <td><div class="actions-cell">
      ${p.estado==='pendiente' ? `<button class="abtn abtn-primary" onclick="cobrarPago('${p.id}')"><i class="ti ti-cash"></i>Cobrar</button>` : ''}
      <button class="abtn" onclick="mostrarRecibo(${JSON.stringify(p).replace(/"/g,'&quot;')})"><i class="ti ti-printer"></i>Recibo</button>
    </div></td>
  </tr>`).join('');
}

function filtrarPagos() { renderPayments(); }
function openNewPago() { document.getElementById('modal-pago').classList.add('open'); }

async function savePago() {
  const p = {
    nombrePaciente: document.getElementById('pay-nombre').value.trim(),
    servicio: document.getElementById('pay-servicio').value.trim(),
    monto: parseFloat(document.getElementById('pay-monto').value)||0,
    formaPago: document.getElementById('pay-forma').value,
    fecha: new Date().toLocaleDateString('es-DO'),
    estado: 'pagado'
  };
  if(!p.nombrePaciente || !p.monto) { showToast('Completa los datos del pago', true); return; }
  try {
    await fetch('/api/payments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) });
    showToast('Pago registrado');
    closeModal('modal-pago');
    ['pay-nombre','pay-servicio','pay-monto'].forEach(id => document.getElementById(id).value='');
    fetchPayments();
  } catch(e) { showToast('Error al registrar pago', true); }
}

async function cobrarPago(id) {
  try {
    await fetch(`/api/payments/${id}/cobrar`, { method:'POST' });
    showToast('Pago marcado como cobrado');
    fetchPayments();
  } catch(e) { showToast('Error', true); }
}

function mostrarRecibo(p) {
  const content = document.getElementById('recibo-content');
  content.innerHTML = `
    <div style="text-align:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed var(--border)">
      <div style="font-size:18px;font-weight:700">${escHtml(document.getElementById('topbar-biz')?.textContent||'')}</div>
      <div style="font-size:11px;color:var(--text-secondary)">RECIBO DE PAGO</div>
    </div>
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <tr><td style="color:var(--text-secondary);padding:4px 0">Paciente:</td><td style="text-align:right;font-weight:600">${escHtml(p.nombrePaciente||'')}</td></tr>
      <tr><td style="color:var(--text-secondary);padding:4px 0">Servicio:</td><td style="text-align:right">${escHtml(p.servicio||'')}</td></tr>
      <tr><td style="color:var(--text-secondary);padding:4px 0">Fecha:</td><td style="text-align:right">${escHtml(p.fecha||'')}</td></tr>
      <tr><td style="color:var(--text-secondary);padding:4px 0">Forma de pago:</td><td style="text-align:right">${escHtml(p.formaPago||'')}</td></tr>
      <tr><td colspan="2" style="border-top:1px dashed var(--border);padding-top:8px"></td></tr>
      <tr><td style="font-size:14px;font-weight:700;padding:4px 0">TOTAL:</td><td style="text-align:right;font-size:16px;font-weight:700">RD$${(p.monto||0).toLocaleString()}</td></tr>
    </table>
    <div style="text-align:center;margin-top:14px;font-size:10px;color:var(--text-tertiary)">Gracias por su preferencia</div>`;
  document.getElementById('modal-recibo').classList.add('open');
}

function printRecibo() { window.print(); }

// AGENDA / CALENDARIO
const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];
const DAY_NAMES = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if(!grid) return;
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() + diffToMonday + currentWeekOffset * 7);
  const days = Array.from({length:7}, function(_,i) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
  const title = document.getElementById('agenda-title');
  const startLbl = days[0].toLocaleDateString('es-DO',{day:'2-digit',month:'short'});
  const endLbl = days[6].toLocaleDateString('es-DO',{day:'2-digit',month:'short',year:'numeric'});
  if(title) title.textContent = 'Agenda -- ' + startLbl + ' al ' + endLbl;
  grid.style.gridTemplateColumns = '60px repeat(7, 1fr)';
  var dayLabels = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
  var html = '<div class="cal-header"></div>';
  days.forEach(function(d) {
    var isToday = d.toDateString() === today.toDateString();
    var style = isToday ? 'color:var(--blue-text);background:var(--blue-bg);font-weight:700;border-radius:6px;' : '';
    html += '<div class="cal-header" style="'+style+'">'+dayLabels[d.getDay()]+' '+d.getDate()+'</div>';
  });
  HOURS.forEach(function(h) {
    html += '<div class="cal-time-cell">'+h+'</div>';
    days.forEach(function(d) {
      var dateStr = localDateStr(d);
      var hourPrefix = h.substring(0,2);
      var apts = allAppointments.filter(function(a) {
        if(!a.fecha || a.fecha !== dateStr) return false;
        if(!a.hora) return false;
        return a.hora.split(':')[0].padStart(2,'0') === hourPrefix;
      });
      var aptHtml = apts.map(function(a) {
        // Colores según estado
        var borderColor = '#3b82f6';
        var bgCard = 'background:linear-gradient(135deg,#eff6ff,#dbeafe);color:#1e3a8a;border-left:3px solid #3b82f6';
        if(a.status === 'asistida') { bgCard = 'background:linear-gradient(135deg,#f0fdf4,#dcfce7);color:#14532d;border-left:3px solid #22c55e'; borderColor='#22c55e'; }
        if(a.status === 'cancelada') { bgCard = 'background:linear-gradient(135deg,#fff1f2,#fee2e2);color:#7f1d1d;border-left:3px solid #ef4444'; borderColor='#ef4444'; }
        var statusLabel = a.status === 'asistida' ? '✓' : a.status === 'cancelada' ? '✗' : '●';
        var nm = escHtml(a.nombre||'Sin nombre');
        var hr = escHtml(a.hora||'');
        var svc = escHtml(a.servicio||'');
        var src = a.source === 'manual' ? '👤' : '🤖';
        var phone = (a.jid||'').replace('@s.whatsapp.net','').replace('@lid','') || (a.telefono||'');
        var originText = a.source === 'manual' ? 'Manual (Recepción)' : 'Chatbot IA';
        var tip = nm + ' | ' + svc + ' | ' + hr + ' | Registro: ' + originText + (phone ? ' | Tel: '+phone : '');
        var id = a.id || '';
        return '<div id="cal-card-'+id+'" onclick="goToAppointment(\''+id+'\')" style="'+bgCard+';font-size:11px;padding:5px 7px;border-radius:5px;margin-bottom:3px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.08);transition:transform .1s" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'" title="'+escHtml(tip)+'">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+src+' '+nm+'</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;gap:4px">'
          + '  <span style="opacity:.8;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">'+hr+'</span>'
          + '  <span style="background:rgba(0,0,0,.1);border-radius:3px;padding:1px 4px;font-size:9px;font-weight:600;white-space:nowrap">'+statusLabel+' '+escHtml(a.status||'confirm.')+'</span>'
          + '</div>'
          + (svc ? '<div style="opacity:.75;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">'+svc+'</div>' : '')
          + '</div>';
      }).join('');
      html += '<div class="cal-cell">'+aptHtml+'</div>';
    });
  });
  grid.innerHTML = html;
}

function changeWeek(dir) { currentWeekOffset += dir; renderCalendar(); }

// Navegar a la pestaña Citas y resaltar la cita clickeada
function goToAppointment(aptId) {
  // 1. Cambiar a la pestaña Citas
  var citasBtn = document.getElementById('nav-citas');
  if(citasBtn) citasBtn.click();
  // Si hay función showTab
  if(typeof showTab === 'function') showTab('citas', citasBtn);

  // 2. Esperar a que renderice y resaltar la fila
  setTimeout(function() {
    var rows = document.querySelectorAll('#citas-body tr');
    var found = false;
    rows.forEach(function(row) {
      // Buscar por atributo data-id o por botones que contengan el ID
      var btn = row.querySelector('[onclick*="'+aptId+'"]');
      if(btn || row.dataset.id === aptId || row.innerHTML.includes(aptId)) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.transition = 'background 0.3s';
        row.style.background = 'rgba(59,130,246,0.18)';
        row.style.boxShadow = '0 0 0 2px #3b82f6';
        row.style.borderRadius = '6px';
        setTimeout(function() {
          row.style.background = '';
          row.style.boxShadow = '';
        }, 2500);
        found = true;
      }
    });
    // Si no encontró por ID, buscar por nombre de la cita
    if(!found) {
      var apt = allAppointments.find(function(a){ return a.id === aptId; });
      if(apt) {
        rows.forEach(function(row) {
          if(row.textContent.includes(apt.nombre||'') && row.textContent.includes(apt.fecha||'')) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.transition = 'background 0.3s';
            row.style.background = 'rgba(59,130,246,0.18)';
            row.style.boxShadow = '0 0 0 2px #3b82f6';
            setTimeout(function() { row.style.background = ''; row.style.boxShadow = ''; }, 2500);
          }
        });
      }
    }
  }, 350);
}
function sendManualReminder(aptId, btnEl) {
  const apt = allAppointments.find(function(a) { return a.id === aptId; });
  if (!apt) return;

  document.getElementById('remind-apt-id').value = aptId;
  document.getElementById('remind-patient-name').value = apt.nombre || 'Sin nombre';
  
  // Set default values
  document.getElementById('remind-type').value = 'now_standard';
  document.getElementById('remind-timeframe').value = '6 meses';
  document.getElementById('remind-motive').value = '';
  document.getElementById('remind-custom-date').value = '';
  
  toggleReminderFields();
  
  document.getElementById('modal-recordatorio').classList.add('open');
}

function toggleReminderFields() {
  const type = document.getElementById('remind-type').value;
  const customFields = document.getElementById('reminder-custom-fields');
  const btn = document.getElementById('btn-submit-reminder');
  
  if (type === 'now_standard') {
    customFields.style.display = 'none';
    btn.innerHTML = '<i class="ti ti-send"></i> Enviar Ahora';
  } else {
    customFields.style.display = 'block';
    if (type === 'now_return') {
      btn.innerHTML = '<i class="ti ti-send"></i> Enviar Ahora';
    } else {
      btn.innerHTML = '<i class="ti ti-calendar-time"></i> Programar';
    }
    checkCustomTimeframe();
  }
  updateReminderPreview();
}

function checkCustomTimeframe() {
  const timeframe = document.getElementById('remind-timeframe').value;
  const fieldCustomDate = document.getElementById('field-custom-date');
  
  if (timeframe === 'custom') {
    fieldCustomDate.style.display = 'block';
    if (!document.getElementById('remind-custom-date').value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      document.getElementById('remind-custom-date').value = tomorrow.toISOString().split('T')[0];
    }
  } else {
    fieldCustomDate.style.display = 'none';
  }
  updateReminderPreview();
}

function updateReminderPreview() {
  const aptId = document.getElementById('remind-apt-id').value;
  const apt = allAppointments.find(function(a) { return a.id === aptId; });
  if (!apt) return;
  
  const type = document.getElementById('remind-type').value;
  const timeframe = document.getElementById('remind-timeframe').value;
  const customDate = document.getElementById('remind-custom-date').value;
  const motive = document.getElementById('remind-motive').value || 'Consulta general';
  
  let bizName = 'nuestra clínica';
  if (window.configData && window.configData.negocio && window.configData.negocio.nombre) {
    bizName = window.configData.negocio.nombre;
  }
  
  let preview = '';
  if (type === 'now_standard') {
    if (apt.status === 'asistida') {
      preview = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para agradecerle su visita reciente. Le recordamos la importancia de programar su próxima cita de control o seguimiento para mantener su salud dental al día.\n\nEscríbanos por aquí si desea agendar. ¡Que tenga un excelente día! 😊`;
    } else {
      preview = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para recordarle su cita:\n\n📅 ${apt.fecha} a las ⏰ ${apt.hora}\n💼 Servicio: ${apt.servicio || 'Consulta general'}\n\nPor favor, confirme su asistencia respondiendo:\n✅ *SI* — Para confirmar\n🔄 *CAMBIAR* — Para reprogramar\n❌ *CANCELAR* — Para cancelar\n\n¡Le esperamos! 😊`;
    }
  } else if (type === 'now_return') {
    preview = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para recordarle la importancia de realizar su próxima consulta de seguimiento en *${timeframe}* para su: *${motive}*.\n\nEscríbanos por aquí para coordinar y agendar su cita. ¡Que tenga un excelente día! 😊`;
  } else if (type === 'schedule_return') {
    const tLabel = timeframe === 'custom' ? `Fecha: ${customDate}` : timeframe;
    preview = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para saludarle y recordarle su consulta de seguimiento. Ha pasado el tiempo establecido (${tLabel}) para su: *${motive}*.\n\nEscríbanos por aquí para agendar su próxima cita. ¡Le esperamos! 😊`;
  }
  
  document.getElementById('reminder-preview').textContent = preview;
}

async function submitReminder() {
  const aptId = document.getElementById('remind-apt-id').value;
  const type = document.getElementById('remind-type').value;
  const timeframe = document.getElementById('remind-timeframe').value;
  const customDate = document.getElementById('remind-custom-date').value;
  const motive = document.getElementById('remind-motive').value;

  const btn = document.getElementById('btn-submit-reminder');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;margin:0"></span> Procesando...';

  try {
    const res = await fetch('/api/appointments/' + aptId + '/remind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: type,
        timeframe: timeframe,
        motive: motive,
        customDate: customDate
      })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast(data.message || '✅ Operación realizada con éxito');
      closeModal('modal-recordatorio');
      fetchAppointments();
    } else {
      showToast(data.error || 'Error al enviar recordatorio', true);
    }
  } catch (e) {
    showToast('Error de conexión', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}


function goToCalendarAppointment(aptId) {
  const apt = allAppointments.find(function(a) { return a.id === aptId; });
  if (!apt) return;

  var aptDateStr = apt.fecha;
  if (!aptDateStr || aptDateStr === 'hoy') {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    aptDateStr = y + '-' + m + '-' + day;
  }

  var parts = aptDateStr.split('-');
  if (parts.length !== 3) return;
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  
  var aptDate = new Date(year, month, day);
  aptDate.setHours(0,0,0,0);

  var today = new Date();
  today.setHours(0,0,0,0);
  var dayOfWeek = today.getDay();
  var diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() + diffToMonday);
  currentMonday.setHours(0,0,0,0);

  var diffTime = aptDate.getTime() - currentMonday.getTime();
  var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  var weekOffset = Math.floor(diffDays / 7);

  currentWeekOffset = weekOffset;
  renderCalendar();

  var agendaBtn = document.getElementById('nav-agenda');
  if (agendaBtn) {
    if (typeof showTab === 'function') {
      showTab('agenda', agendaBtn);
    } else {
      agendaBtn.click();
    }
  }

  setTimeout(function() {
    var card = document.getElementById('cal-card-' + aptId);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var originalStyle = card.style.boxShadow;
      var originalTransform = card.style.transform;
      var originalTransition = card.style.transition;
      
      card.style.transition = 'all 0.3s ease-in-out';
      card.style.boxShadow = '0 0 0 4px #3b82f6, 0 8px 20px rgba(59,130,246,0.4)';
      card.style.transform = 'scale(1.05)';
      
      setTimeout(function() {
        card.style.boxShadow = originalStyle;
        card.style.transform = originalTransform;
        card.style.transition = originalTransition;
      }, 3000);
    }
  }, 400);
}

function goToCalendarAppointment(aptId) {
  const apt = allAppointments.find(function(a) { return a.id === aptId; });
  if (!apt) return;

  var aptDateStr = apt.fecha;
  if (!aptDateStr || aptDateStr === 'hoy') {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    aptDateStr = y + '-' + m + '-' + day;
  }

  var parts = aptDateStr.split('-');
  if (parts.length !== 3) return;
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  
  var aptDate = new Date(year, month, day);
  aptDate.setHours(0,0,0,0);

  var today = new Date();
  today.setHours(0,0,0,0);
  var dayOfWeek = today.getDay();
  var diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() + diffToMonday);
  currentMonday.setHours(0,0,0,0);

  var diffTime = aptDate.getTime() - currentMonday.getTime();
  var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  var weekOffset = Math.floor(diffDays / 7);

  currentWeekOffset = weekOffset;
  renderCalendar();

  var agendaBtn = document.getElementById('nav-agenda');
  if (agendaBtn) {
    if (typeof showTab === 'function') {
      showTab('agenda', agendaBtn);
    } else {
      agendaBtn.click();
    }
  }

  setTimeout(function() {
    var card = document.getElementById('cal-card-' + aptId);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var originalStyle = card.style.boxShadow;
      var originalTransform = card.style.transform;
      var originalTransition = card.style.transition;
      
      card.style.transition = 'all 0.3s ease-in-out';
      card.style.boxShadow = '0 0 0 4px #3b82f6, 0 8px 20px rgba(59,130,246,0.4)';
      card.style.transform = 'scale(1.05)';
      
      setTimeout(function() {
        card.style.boxShadow = originalStyle;
        card.style.transform = originalTransform;
        card.style.transition = originalTransition;
      }, 3000);
    }
  }, 400);
}

// REGISTRO QR
// ═══════════════════════════════════════════
async function registrarPaciente() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const telefono = document.getElementById('reg-telefono').value.trim();
  const motivo = document.getElementById('reg-motivo').value;
  if(!nombre || !telefono || !motivo) { showToast('Completa todos los campos', true); return; }
  const btn = document.getElementById('btn-registrar');
  btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></span> Registrando...';
  try {
    const res = await fetch('/api/registro-visita', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nombre, telefono, motivo}) });
    const data = await res.json();
    if(data.success) {
      showToast('✅ Paciente registrado exitosamente');
      document.getElementById('reg-nombre').value = '';
      document.getElementById('reg-telefono').value = '';
      document.getElementById('reg-motivo').value = '';
    } else { showToast(data.message || 'Error al registrar', true); }
  } catch(e) { showToast('Error de conexión', true); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="ti ti-user-check"></i>Registrar paciente'; }
}

// ═══════════════════════════════════════════
// MULTI-BOTS / CLIENTES
// ═══════════════════════════════════════════
let clientsData = [];
let clientStatusCache = {};
let clientPollTimer = null;

async function fetchClients() {
  try {
    const res = await fetch('/api/clients');
    clientsData = await res.json();
    renderClients();
    clientsData.forEach(c => fetchClientStatus(c.port));
  } catch(e) {}
}

async function fetchClientStatus(port) {
  try {
    const res = await fetch(`/api/clients/${port}/live`);
    clientStatusCache[port] = await res.json();
    renderClients();
  } catch(e) {}
}

function renderClients() {
  const grid = document.getElementById('clients-grid');
  if(!grid || !clientsData.length) {
    if(grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-tertiary)">No hay bots creados aún. Haz clic en "Nuevo Bot".</div>';
    return;
  }
  const planMap = {basico:'BÁSICO', estandar:'ESTÁNDAR', completo:'COMPLETO'};
  grid.innerHTML = clientsData.map(c => {
    const live = clientStatusCache[c.port];
    const wa = live?.whatsapp || 'loading';
    const statusTxt = wa === 'connected' ? 'Conectado' : wa === 'qr' ? 'Escanear QR' : wa === 'offline' ? 'Apagado' : 'Cargando...';
    const uptime = live?.uptime || 0;
    const uptimeStr = uptime > 3600 ? `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m` : `${Math.floor(uptime/60)}m`;
    return `<div class="client-card">
      <div class="client-card-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="client-name">${escHtml(c.businessName)}${c.isMain?' <span style="font-size:10px;color:var(--blue-text)">(Principal)</span>':''}</div>
            <div class="client-meta"><span>🤖 ${escHtml(c.botName)}</span><span>🌐 :${c.port}</span></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            <span class="badge" style="background:var(--blue-bg);color:var(--blue-text)">${planMap[c.plan]||'BÁSICO'}</span>
            <span class="badge b-${wa==='connected'?'asistida':wa==='qr'?'pendiente':'cancelada'}">● ${statusTxt}</span>
          </div>
        </div>
      </div>
      ${live && live.whatsapp === 'qr' && live.qr ? `<div style="text-align:center;padding:12px;background:var(--amber-bg);border-bottom:0.5px solid var(--border)"><img src="${live.qr}" style="width:140px;height:140px;background:white;padding:6px;border-radius:6px"><p style="font-size:11px;color:var(--amber-text);margin-top:6px">📱 Escanea para conectar</p></div>` : ''}
      ${live && live.whatsapp === 'connected' ? `<div style="padding:10px 14px;background:var(--green-bg);border-bottom:0.5px solid var(--border);font-size:12px;color:var(--green-text);font-weight:500">✅ WhatsApp activo y recibiendo mensajes</div>` : ''}
      <div class="client-stats">
        <div class="client-stat"><div class="client-stat-val">${live?.totalMessages||0}</div><div class="client-stat-lbl">Mensajes</div></div>
        <div class="client-stat"><div class="client-stat-val">${live?.totalAppointments||0}</div><div class="client-stat-lbl">Citas</div></div>
        <div class="client-stat"><div class="client-stat-val">${live ? uptimeStr : '—'}</div><div class="client-stat-lbl">Uptime</div></div>
      </div>
      <div class="client-actions">
        <a href="http://localhost:${c.port}" target="_blank" class="btn btn-primary"><i class="ti ti-external-link"></i>Dashboard</a>
        <a href="http://localhost:${c.port}/#config" target="_blank" class="btn"><i class="ti ti-settings"></i>Config</a>
      </div>
    </div>`;
  }).join('');
}

function toggleNewClientForm() {
  const f = document.getElementById('new-client-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function createNewClient() {
  const folderName = document.getElementById('nc-folder').value.trim();
  const businessName = document.getElementById('nc-biz').value.trim();
  const ownerPhone = document.getElementById('nc-owner').value.trim();
  const plan = document.getElementById('nc-plan').value;
  const port = document.getElementById('nc-port').value.trim();
  const msg = document.getElementById('nc-msg');
  const btn = document.getElementById('btn-create-client');
  if(!folderName || !businessName || !port) { msg.innerHTML = '<span style="color:var(--red-text)">❌ Completa: Carpeta, Nombre y Puerto</span>'; return; }
  btn.disabled = true; btn.textContent = 'Creando...';
  try {
    const res = await fetch('/api/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({folderName,businessName,ownerPhone,plan,port}) });
    const result = await res.json();
    if(result.success) {
      msg.innerHTML = '<span style="color:var(--green-text)">✅ Bot creado. Aparecerá en la lista en unos segundos.</span>';
      setTimeout(()=>{ fetchClients(); document.getElementById('new-client-form').style.display='none'; msg.innerHTML=''; }, 3000);
    } else { msg.innerHTML = `<span style="color:var(--red-text)">❌ ${escHtml(result.error||'Error')}</span>`; }
  } catch(e) { msg.innerHTML = '<span style="color:var(--red-text)">❌ Error de conexión</span>'; }
  finally { btn.disabled = false; btn.innerHTML = '<i class="ti ti-rocket"></i>Crear y Levantar'; }
}

// ═══════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    configData = await res.json();
    populateConfig();
  } catch(e) {}
}

function populateConfig() {
  if(!configData) return;
  const n = configData.negocio||{};
  const b = configData.bot||{};
  const h = n.horario||{};
  const biz = n.nombre || 'Clínica';
  document.getElementById('topbar-biz').textContent = biz;
  document.getElementById('biz-name-logo').textContent = biz;
  document.getElementById('topbar-sub').textContent = `${b.plan||'Plan'} · Bot WhatsApp IA`;
  const fields = {
    'cfg-bot-nombre':b.nombre,'cfg-bot-plan':b.plan,
    'cfg-nombre':n.nombre,'cfg-tipo':n.tipo,
    'cfg-direccion':n.direccion,'cfg-telefono':n.telefono,
    'cfg-instagram':n.instagram,'cfg-web':n.sitio_web,
    'cfg-horario-lv':h.lunes_viernes,'cfg-horario-sab':h.sabados,'cfg-horario-dom':h.domingos,
    'cfg-pagos':(configData.formas_pago||[]).join(', ')
  };
  Object.entries(fields).forEach(([id,val]) => { const el = document.getElementById(id); if(el) el.value = val||''; });
  renderServicesConfig(configData.servicios||[]);
}

function renderServicesConfig(svcs) {
  const list = document.getElementById('services-list');
  if(!list) return;
  list.innerHTML = svcs.map((s,i) => `
    <div class="form-row" style="gap:10px;margin-bottom:8px" data-idx="${i}">
      <div class="form-field"><input type="text" class="form-input" value="${escHtml(s.nombre||'')}" placeholder="Servicio" data-field="nombre"></div>
      <div class="form-field"><input type="text" class="form-input" value="${s.precio||0}" placeholder="Precio" data-field="precio"></div>
      <div class="form-field"><input type="text" class="form-input" value="${escHtml(s.duracion||'')}" placeholder="Duración" data-field="duracion"></div>
      <div class="form-field" style="flex:none"><button class="abtn abtn-danger" onclick="this.closest('[data-idx]').remove()"><i class="ti ti-trash"></i></button></div>
    </div>`).join('');
}

function addService() {
  const list = document.getElementById('services-list');
  const div = document.createElement('div');
  div.className = 'form-row'; div.style.cssText = 'gap:10px;margin-bottom:8px';
  div.innerHTML = `<div class="form-field"><input type="text" class="form-input" placeholder="Servicio" data-field="nombre"></div><div class="form-field"><input type="text" class="form-input" placeholder="Precio" data-field="precio"></div><div class="form-field"><input type="text" class="form-input" placeholder="Duración" data-field="duracion"></div><div class="form-field" style="flex:none"><button class="abtn abtn-danger" onclick="this.closest('.form-row').remove()"><i class="ti ti-trash"></i></button></div>`;
  list.appendChild(div);
}

async function saveConfiguration() {
  const svcs = Array.from(document.querySelectorAll('#services-list .form-row')).map(row => ({
    nombre: row.querySelector('[data-field="nombre"]').value,
    precio: parseFloat(row.querySelector('[data-field="precio"]').value)||0,
    moneda:'RD$',
    duracion: row.querySelector('[data-field="duracion"]').value,
    descripcion:''
  }));
  const config = {
    negocio: {
      nombre: document.getElementById('cfg-nombre').value,
      tipo: document.getElementById('cfg-tipo').value,
      direccion: document.getElementById('cfg-direccion').value,
      horario: { lunes_viernes: document.getElementById('cfg-horario-lv').value, sabados: document.getElementById('cfg-horario-sab').value, domingos: document.getElementById('cfg-horario-dom').value },
      dias_libres:[], telefono: document.getElementById('cfg-telefono').value,
      instagram: document.getElementById('cfg-instagram').value,
      sitio_web: document.getElementById('cfg-web').value,
      politica_cancelacion: configData?.negocio?.politica_cancelacion||''
    },
    bot:{ nombre: document.getElementById('cfg-bot-nombre').value, plan: document.getElementById('cfg-bot-plan').value },
    servicios: svcs,
    servicio_estrella: configData?.servicio_estrella||'',
    promocion_actual: configData?.promocion_actual||'',
    horarios_citas: configData?.horarios_citas||{},
    formas_pago: document.getElementById('cfg-pagos').value.split(',').map(s=>s.trim()).filter(Boolean),
    perfil_cliente: configData?.perfil_cliente||'',
    preguntas_frecuentes: configData?.preguntas_frecuentes||[]
  };
  try {
    const res = await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config) });
    const result = await res.json();
    if(result.success) { showToast('✅ Configuración guardada'); configData = config; populateConfig(); }
    else { showToast('Error al guardar', true); }
  } catch(e) { showToast('Error de conexión', true); }
}

// ═══════════════════════════════════════════
// MODALES NOTAS
// ═══════════════════════════════════════════
let currentNoteAptId = null;
function openNotes(name, aptId) {
  currentNoteAptId = aptId;
  document.getElementById('modal-nombre').textContent = name;
  document.getElementById('notas-text').value = '';
  document.getElementById('modal-notas').classList.add('open');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
async function saveNotes() {
  const notes = document.getElementById('notas-text').value.trim();
  if(currentNoteAptId && notes) {
    try {
      await fetch(`/api/appointments/${currentNoteAptId}/notes`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({notes}) });
    } catch(e) {}
  }
  closeModal('modal-notas');
  showToast('✅ Notas clínicas guardadas');
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if(e.target === overlay) overlay.classList.remove('open'); });
});

// ═══════════════════════════════════════════
// NAV / TABS
// ═══════════════════════════════════════════
function showTab(id, el) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('tab-' + id);
  if(panel) panel.classList.add('active');
  if(el) el.classList.add('active');
  if(id === 'clientes') {
    const lockedOverlay = document.getElementById('multibots-locked-overlay');
    const contentArea = document.getElementById('multibots-content');
    if (_multiBotUnlocked) {
      if (lockedOverlay) lockedOverlay.style.display = 'none';
      if (contentArea) contentArea.style.display = 'block';
      fetchClients();
      if(clientPollTimer) clearInterval(clientPollTimer);
      clientPollTimer = setInterval(() => clientsData.forEach(c => fetchClientStatus(c.port)), 6000);
    } else {
      if (lockedOverlay) lockedOverlay.style.display = 'block';
      if (contentArea) contentArea.style.display = 'none';
      if(clientPollTimer) { clearInterval(clientPollTimer); clientPollTimer = null; }
    }
  } else {
    if(clientPollTimer) { clearInterval(clientPollTimer); clientPollTimer = null; }
  }
  if(id === 'agenda') renderCalendar();
  if(id === 'qr') loadRegistroQR();
  if(id === 'pacientes') fetchPatients();
}

// ═══════════════════════════════════════════════
// PACIENTES — EXPEDIENTE CLÍNICO
// ═══════════════════════════════════════════════

let allPatients = [];
let selectedPatientId = null;

async function fetchPatients() {
  try {
    const res = await fetch('/api/patients');
    allPatients = await res.json();
    renderPatientsList();
  } catch(e) {
    console.error('Error cargando pacientes:', e);
  }
}

function renderPatientsList() {
  const container = document.getElementById('patients-list-container');
  if (!container) return;
  const query = (document.getElementById('patients-search-input')?.value || '').toLowerCase();
  const filtered = allPatients.filter(p =>
    (p.nombre||'').toLowerCase().includes(query) ||
    (p.telefono||'').includes(query) ||
    (p.cedula||'').includes(query)
  );
  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:12px">No se encontraron pacientes</div>';
    return;
  }
  container.innerHTML = filtered.map(p => {
    const initials = (p.nombre||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    const isActive = p.id === selectedPatientId;
    const aptCount = (p._appointments||[]).length;
    return `<div class="patient-list-item${isActive?' active':''}" onclick="selectPatient('${p.id}')">
      <div class="patient-avatar">${initials}</div>
      <div class="patient-list-info">
        <div class="patient-list-name">${escHtml(p.nombre||'Sin nombre')}</div>
        <div class="patient-list-phone">${p.cedula ? escHtml(p.cedula) : (p.telefono ? escHtml(p.telefono) : '—')} · ${aptCount} cita${aptCount!==1?'s':''}</div>
      </div>
    </div>`;
  }).join('');
}

function filterPatientsList() {
  renderPatientsList();
}

function selectPatient(id) {
  selectedPatientId = id;
  renderPatientsList();
  const pat = allPatients.find(p => p.id === id);
  if (!pat) return;

  // Show record panel
  document.getElementById('patients-no-selection').style.display = 'none';
  const rc = document.getElementById('patients-record-content');
  rc.style.display = 'flex';
  rc.style.flexDirection = 'column';
  rc.style.height = '100%';

  // Header
  const initials = (pat.nombre||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('pr-avatar').textContent = initials;
  document.getElementById('pr-name').textContent = pat.nombre || 'Sin nombre';
  const aptCount = (pat._appointments||[]).length;
  document.getElementById('pr-sub').textContent = `${pat.cedula||pat.telefono||'Sin cédula'} · ${aptCount} cita${aptCount!==1?'s':''}`;
  const waPhone = pat.telefono || (pat.jid ? pat.jid.split('@')[0] : '');
  const waLink = document.getElementById('pr-wa-link');
  if (waPhone) { waLink.href = `https://wa.me/${waPhone}`; waLink.style.display=''; }
  else { waLink.style.display='none'; }

  // FICHA
  document.getElementById('pf-nombre').textContent = pat.nombre || '—';
  document.getElementById('pf-cedula').textContent = pat.cedula || '—';
  document.getElementById('pf-telefono').textContent = pat.telefono || '—';
  document.getElementById('pf-correo').textContent = pat.correo || '—';
  document.getElementById('pf-direccion').textContent = pat.direccion || '—';

  // Appointment summary badges
  const apts = pat._appointments || [];
  const confirmed = apts.filter(a=>a.status==='confirmada').length;
  const attended = apts.filter(a=>a.status==='asistida').length;
  const cancelled = apts.filter(a=>a.status==='cancelada').length;
  document.getElementById('pf-apts-summary').innerHTML = [
    `<span class="badge b-confirmada">${confirmed} confirmada${confirmed!==1?'s':''}</span>`,
    `<span class="badge b-asistida">${attended} asistida${attended!==1?'s':''}</span>`,
    `<span class="badge b-cancelada">${cancelled} cancelada${cancelled!==1?'s':''}</span>`
  ].join('');

  // HISTORIAL
  document.getElementById('p-historial-text').value = pat.historialClinico || '';

  // RECETAS
  renderRecetas(pat.recetas || []);

  // LABS
  renderLaboratorios(pat.laboratorios || []);

  // DIAGNOSTICOS
  renderDiagnosticos(pat.diagnosticos || []);

  // TIMELINE
  buildTimeline(pat);

  // PRESCRIPCIÓN ACTIVA
  loadPrescriptionTab(pat);

  // Prefill date fields with today
  const today = new Date().toISOString().split('T')[0];
  ['rx-fecha','lab-fecha','dx-fecha'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });

  // Switch to ficha sub-tab
  switchPatientSubtab('ficha');
}

function switchPatientSubtab(tab) {
  document.querySelectorAll('.patient-subtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.patient-subtab-content').forEach(c => c.classList.remove('active'));
  const btn = document.getElementById('pst-' + tab);
  const content = document.getElementById('psc-' + tab);
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  // Lazy load chat when tab opened
  if (tab === 'chat' && selectedPatientId) {
    loadPatientChat(selectedPatientId);
  }
}

async function loadPatientChat(patId) {
  const el = document.getElementById('patient-chat-log');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:12px"><span class="spinner"></span> Cargando conversación...</div>';
  try {
    const res = await fetch(`/api/patients/${patId}/chat`);
    const msgs = await res.json();
    if (!msgs.length) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:12px"><i class="ti ti-messages-off" style="font-size:32px;display:block;margin-bottom:8px;opacity:.3"></i>No hay historial de conversación aún</div>';
      return;
    }
    el.className = 'chat-transcript';
    el.innerHTML = msgs.map(m => {
      const isUser = m.role === 'user';
      const label = isUser ? '👤 Paciente' : '🤖 Bot';
      return `<div style="display:flex;flex-direction:column;align-items:${isUser?'flex-start':'flex-end'}">
        <div class="chat-bubble ${m.role}">${escHtml(m.content||'')}</div>
        <div class="chat-bubble-meta" style="text-align:${isUser?'left':'right'}">${label}</div>
      </div>`;
    }).join('');
    // Scroll to bottom of both elements
    setTimeout(() => {
      el.scrollTop = el.scrollHeight;
      const parent = document.getElementById('psc-chat');
      if (parent) parent.scrollTop = parent.scrollHeight;
    }, 50);
  } catch(e) {
    el.innerHTML = '<div style="padding:20px;color:var(--red-text);font-size:12px">Error al cargar historial</div>';
  }
}

function buildTimeline(pat) {
  const el = document.getElementById('patient-timeline');
  if (!el) return;

  const events = [];

  // Appointments
  (pat._appointments || []).forEach(a => {
    const colors = { confirmada: 'var(--blue-text)', asistida: 'var(--green-text)', cancelada: 'var(--red-text)' };
    events.push({
      date: a.fecha || a.createdAt || '',
      type: 'Cita',
      color: colors[a.status] || 'var(--text-tertiary)',
      title: `Cita — ${escHtml(a.servicio||'Consulta')}`,
      body: `Estado: ${a.status} · Hora: ${a.hora||'—'}${a.notes?'<br>Notas: '+escHtml(a.notes):''}`,
      icon: '📅'
    });
  });

  // Payments
  (pat._payments || []).forEach(p => {
    events.push({
      date: p.createdAt || '',
      type: 'Pago',
      color: 'var(--green-text)',
      title: `Pago — ${escHtml(p.descripcion||'Servicio')}`,
      body: `Monto: ${p.monto||'—'} · Estado: ${p.estado||'pendiente'}`,
      icon: '💳'
    });
  });

  // Diagnostics
  (pat.diagnosticos || []).forEach(d => {
    events.push({
      date: d.fecha || '',
      type: 'Diagnóstico',
      color: 'var(--amber-text)',
      title: `Diagnóstico${d.codigo?' ('+d.codigo+')':''}`,
      body: escHtml(d.descripcion||''),
      icon: '🩺'
    });
  });

  // Prescriptions
  (pat.recetas || []).forEach(r => {
    events.push({
      date: r.fecha || '',
      type: 'Receta',
      color: '#a855f7',
      title: `Receta — ${escHtml(r.medicamento||'')}`,
      body: escHtml(r.instrucciones||''),
      icon: '💊'
    });
  });

  // Labs
  (pat.laboratorios || []).forEach(l => {
    events.push({
      date: l.fecha || '',
      type: 'Laboratorio',
      color: 'var(--blue-text)',
      title: `Laboratorio — ${escHtml(l.tipo||'')}`,
      body: escHtml(l.resultado||''),
      icon: '🔬'
    });
  });

  // Sort descending
  events.sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });

  if (!events.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:20px">No hay eventos en la línea de tiempo</div>';
    return;
  }

  el.innerHTML = events.map(e => `
    <div class="timeline-event">
      <div class="timeline-dot" style="background:${e.color}"></div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <span class="timeline-card-title">${e.icon} ${e.title}</span>
          <span class="timeline-card-date">${e.date ? escHtml(e.date.split('T')[0]) : '—'}</span>
        </div>
        <div class="timeline-card-body">${e.body}</div>
      </div>
    </div>`).join('');
}

function renderRecetas(recetas) {
  const el = document.getElementById('recetas-list');
  if (!el) return;
  if (!recetas.length) { el.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No hay recetas registradas</div>'; return; }
  el.innerHTML = recetas.map((r, i) => `
    <div class="clinical-item">
      <div class="clinical-item-dot" style="background:#a855f7"></div>
      <div class="clinical-item-text">
        <div class="clinical-item-label"><i class="ti ti-pill"></i> ${escHtml(r.medicamento||'')} <span style="font-weight:400;font-size:10.5px;color:var(--text-tertiary);margin-left:6px">${r.fecha||''}</span></div>
        <div class="clinical-item-sub">${escHtml(r.instrucciones||'')}</div>
      </div>
      <button class="abtn" onclick="deleteReceta(${i})" style="color:var(--red-text);padding:2px 4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </div>`).join('');
}

function renderLaboratorios(labs) {
  const el = document.getElementById('labs-list');
  if (!el) return;
  if (!labs.length) { el.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No hay laboratorios registrados</div>'; return; }
  el.innerHTML = labs.map((l, i) => `
    <div class="clinical-item">
      <div class="clinical-item-dot" style="background:var(--blue-text)"></div>
      <div class="clinical-item-text">
        <div class="clinical-item-label"><i class="ti ti-microscope"></i> ${escHtml(l.tipo||'')} <span style="font-weight:400;font-size:10.5px;color:var(--text-tertiary);margin-left:6px">${l.fecha||''}</span></div>
        <div class="clinical-item-sub">${escHtml(l.resultado||'')}</div>
      </div>
      <button class="abtn" onclick="deleteLaboratorio(${i})" style="color:var(--red-text);padding:2px 4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </div>`).join('');
}

function renderDiagnosticos(dxs) {
  const el = document.getElementById('diagnosticos-list');
  if (!el) return;
  if (!dxs.length) { el.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No hay diagnósticos registrados</div>'; return; }
  el.innerHTML = dxs.map((d, i) => `
    <div class="clinical-item">
      <div class="clinical-item-dot" style="background:var(--amber-text)"></div>
      <div class="clinical-item-text">
        <div class="clinical-item-label"><i class="ti ti-stethoscope"></i> ${escHtml(d.descripcion||'')}${d.codigo?' <span style="font-size:10px;background:var(--bg-primary);border:0.5px solid var(--border);border-radius:4px;padding:1px 5px;margin-left:4px">'+escHtml(d.codigo)+'</span>':''} <span style="font-weight:400;font-size:10.5px;color:var(--text-tertiary);margin-left:6px">${d.fecha||''}</span></div>
      </div>
      <button class="abtn" onclick="deleteDiagnostico(${i})" style="color:var(--red-text);padding:2px 4px"><i class="ti ti-trash" style="font-size:13px"></i></button>
    </div>`).join('');
}

async function addReceta() {
  const med = document.getElementById('rx-medicamento').value.trim();
  const inst = document.getElementById('rx-instrucciones').value.trim();
  const fecha = document.getElementById('rx-fecha').value;
  if (!med) return showToast('Escribe el medicamento', true);
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  const recetas = [...(pat.recetas||[]), { medicamento: med, instrucciones: inst, fecha }];
  await updatePatientField({ recetas });
  document.getElementById('rx-medicamento').value = '';
  document.getElementById('rx-instrucciones').value = '';
}

async function addLaboratorio() {
  const tipo = document.getElementById('lab-tipo').value.trim();
  const resultado = document.getElementById('lab-resultado').value.trim();
  const fecha = document.getElementById('lab-fecha').value;
  if (!tipo) return showToast('Escribe el tipo de examen', true);
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  const laboratorios = [...(pat.laboratorios||[]), { tipo, resultado, fecha }];
  await updatePatientField({ laboratorios });
  document.getElementById('lab-tipo').value = '';
  document.getElementById('lab-resultado').value = '';
}

async function addDiagnostico() {
  const descripcion = document.getElementById('dx-descripcion').value.trim();
  const codigo = document.getElementById('dx-codigo').value.trim();
  const fecha = document.getElementById('dx-fecha').value;
  if (!descripcion) return showToast('Escribe la descripción del diagnóstico', true);
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  const diagnosticos = [...(pat.diagnosticos||[]), { descripcion, codigo, fecha }];
  await updatePatientField({ diagnosticos });
  document.getElementById('dx-descripcion').value = '';
  document.getElementById('dx-codigo').value = '';
}

async function deleteReceta(idx) {
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  const recetas = (pat.recetas||[]).filter((_, i) => i !== idx);
  await updatePatientField({ recetas });
}

async function deleteLaboratorio(idx) {
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  const laboratorios = (pat.laboratorios||[]).filter((_, i) => i !== idx);
  await updatePatientField({ laboratorios });
}

async function deleteDiagnostico(idx) {
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  const diagnosticos = (pat.diagnosticos||[]).filter((_, i) => i !== idx);
  await updatePatientField({ diagnosticos });
}

async function savePatientHistorial() {
  const text = document.getElementById('p-historial-text').value;
  await updatePatientField({ historialClinico: text });
  showToast('✅ Historial clínico guardado');
}

async function updatePatientField(fields) {
  if (!selectedPatientId) return;
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  try {
    const res = await fetch(`/api/patients/${selectedPatientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pat, ...fields })
    });
    const data = await res.json();
    if (data.success) {
      // Update local cache
      const idx = allPatients.findIndex(p => p.id === selectedPatientId);
      if (idx >= 0) allPatients[idx] = { ...allPatients[idx], ...fields };
      const updatedPat = allPatients[idx] || pat;
      if (fields.recetas !== undefined) renderRecetas(fields.recetas);
      if (fields.laboratorios !== undefined) renderLaboratorios(fields.laboratorios);
      if (fields.diagnosticos !== undefined) renderDiagnosticos(fields.diagnosticos);
      buildTimeline(updatedPat);
      showToast('✅ Guardado');
    } else {
      showToast(data.error || 'Error al guardar', true);
    }
  } catch(e) {
    showToast('Error de conexión', true);
  }
}

function openEditPatientModal() {
  const pat = allPatients.find(p => p.id === selectedPatientId);
  if (!pat) return;
  document.getElementById('edit-pat-id').value = pat.id;
  document.getElementById('edit-pat-nombre').value = pat.nombre || '';
  document.getElementById('edit-pat-cedula').value = pat.cedula || '';
  document.getElementById('edit-pat-telefono').value = pat.telefono || '';
  document.getElementById('edit-pat-correo').value = pat.correo || '';
  document.getElementById('edit-pat-direccion').value = pat.direccion || '';
  document.getElementById('modal-editar-paciente').classList.add('open');
}

async function savePatientEdit() {
  const id = document.getElementById('edit-pat-id').value;
  const data = {
    nombre: document.getElementById('edit-pat-nombre').value.trim(),
    cedula: document.getElementById('edit-pat-cedula').value.trim(),
    telefono: document.getElementById('edit-pat-telefono').value.trim(),
    correo: document.getElementById('edit-pat-correo').value.trim(),
    direccion: document.getElementById('edit-pat-direccion').value.trim()
  };
  if (!data.nombre) return showToast('El nombre es obligatorio', true);
  try {
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-editar-paciente');
      await fetchPatients();
      selectPatient(id);
      showToast('✅ Datos del paciente actualizados');
    } else {
      showToast(result.error || 'Error al guardar', true);
    }
  } catch(e) {
    showToast('Error de conexión', true);
  }
}

function openNewPatientModal() {
  ['new-pat-nombre','new-pat-cedula','new-pat-telefono','new-pat-correo','new-pat-direccion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('modal-nuevo-paciente').classList.add('open');
}

async function saveNewPatient() {
  const data = {
    nombre: document.getElementById('new-pat-nombre').value.trim(),
    cedula: document.getElementById('new-pat-cedula').value.trim(),
    telefono: document.getElementById('new-pat-telefono').value.trim(),
    correo: document.getElementById('new-pat-correo').value.trim(),
    direccion: document.getElementById('new-pat-direccion').value.trim()
  };
  if (!data.nombre) return showToast('El nombre es obligatorio', true);
  try {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modal-nuevo-paciente');
      await fetchPatients();
      selectPatient(result.patient.id);
      showToast('✅ Paciente creado');
    } else {
      showToast(result.error || 'Error al crear', true);
    }
  } catch(e) {
    showToast('Error de conexión', true);
  }
}

// ═══════════════════════════════════════════════
// PRESCRIPCIÓN ACTIVA — MOTOR DE PRESCRIPCIÓN
// ═══════════════════════════════════════════════

// In-memory prescription state for the current patient being edited
let rxDiet = [];     // [{ nombre, alimentos }]
let rxRoutine = [];  // [{ ejercicio, series, reps, frecuencia }]

const EXERCISE_SUGGESTIONS = [
  'Sentadillas','Flexiones de pecho','Plancha abdominal','Burpees','Zancadas',
  'Peso muerto','Press de hombros','Remo con mancuerna','Cardio suave (caminar)',
  'Bicicleta estática','Natación','Estiramientos'
];
const MEAL_SUGGESTIONS = ['Desayuno','Almuerzo','Cena','Colación AM','Colación PM','Merienda','Pre-entreno','Post-entreno'];

function loadPrescriptionTab(pat) {
  rxDiet = (pat.prescripcionActiva && pat.prescripcionActiva.dieta) ? [...pat.prescripcionActiva.dieta] : [];
  rxRoutine = (pat.prescripcionActiva && pat.prescripcionActiva.rutina) ? [...pat.prescripcionActiva.rutina] : [];
  renderRxDiet();
  renderRxRoutine();

  // Update patient link
  const link = document.getElementById('rx-patient-link');
  if (link) {
    link.href = `/patient/${pat.id}/today`;
    link.style.display = '';
  }

  // Update compliance gauge from saved data
  const today = new Date().toISOString().split('T')[0];
  const cumToday = (pat.cumplimiento || {})[today] || { dieta: {}, rutina: {} };
  const totalDieta = rxDiet.length;
  const totalRutina = rxRoutine.length;
  const total = totalDieta + totalRutina;
  const done = Object.values(cumToday.dieta || {}).filter(Boolean).length +
               Object.values(cumToday.rutina || {}).filter(Boolean).length;
  updateComplianceGauge(done, total);
}

function renderRxDiet() {
  const el = document.getElementById('rx-diet-list');
  if (!el) return;
  if (!rxDiet.length) {
    el.innerHTML = '<div class="rx-empty">🍽️ No hay bloques de alimentación. Pulsa "Agregar comida" para empezar.</div>';
    return;
  }
  el.innerHTML = rxDiet.map((b, i) => `
    <div class="rx-block" id="rx-diet-${i}">
      <div class="rx-block-header">
        <span class="rx-block-label">Comida ${i+1}</span>
        <button class="abtn" onclick="removeDietBlock(${i})" style="color:var(--red-text);font-size:13px"><i class="ti ti-trash"></i></button>
      </div>
      <div class="rx-block-row">
        <input list="meal-names" class="form-input" placeholder="Ej: Desayuno" value="${escHtml(b.nombre||'')}"
          onchange="rxDiet[${i}].nombre=this.value" style="flex:0 0 140px">
        <input class="form-input" placeholder="Alimentos y porciones (Ej: 3 huevos, tostada integral, café sin azúcar)"
          value="${escHtml(b.alimentos||'')}" onchange="rxDiet[${i}].alimentos=this.value">
      </div>
    </div>`).join('');
}

function renderRxRoutine() {
  const el = document.getElementById('rx-routine-list');
  if (!el) return;
  if (!rxRoutine.length) {
    el.innerHTML = '<div class="rx-empty">💪 No hay ejercicios. Pulsa "Agregar ejercicio" para empezar.</div>';
    return;
  }
  el.innerHTML = rxRoutine.map((e, i) => `
    <div class="rx-block" id="rx-rtn-${i}">
      <div class="rx-block-header">
        <span class="rx-block-label">Ejercicio ${i+1}</span>
        <button class="abtn" onclick="removeRoutineBlock(${i})" style="color:var(--red-text);font-size:13px"><i class="ti ti-trash"></i></button>
      </div>
      <div class="rx-block-row">
        <input list="exercise-names" class="form-input" placeholder="Ejercicio (Ej: Sentadillas)"
          value="${escHtml(e.ejercicio||'')}" onchange="rxRoutine[${i}].ejercicio=this.value" style="flex:2">
        <input class="form-input narrow" type="number" min="1" max="20" placeholder="Series"
          value="${escHtml(String(e.series||''))}" onchange="rxRoutine[${i}].series=this.value">
        <input class="form-input narrow" type="number" min="1" max="100" placeholder="Reps"
          value="${escHtml(String(e.reps||''))}" onchange="rxRoutine[${i}].reps=this.value">
        <input class="form-input" placeholder="Frecuencia (Ej: 3x/semana)" style="flex:1.5"
          value="${escHtml(e.frecuencia||'')}" onchange="rxRoutine[${i}].frecuencia=this.value">
      </div>
    </div>`).join('');
}

function addDietBlock() {
  rxDiet.push({ nombre: '', alimentos: '' });
  renderRxDiet();
  // Focus last input
  setTimeout(() => {
    const inputs = document.querySelectorAll('[id^="rx-diet-"] input');
    if (inputs.length) inputs[inputs.length - 2].focus();
  }, 50);
}

function addRoutineBlock() {
  rxRoutine.push({ ejercicio: '', series: 3, reps: 12, frecuencia: '' });
  renderRxRoutine();
  setTimeout(() => {
    const inputs = document.querySelectorAll('[id^="rx-rtn-"] input');
    if (inputs.length) inputs[inputs.length - 4].focus();
  }, 50);
}

function removeDietBlock(i) { rxDiet.splice(i, 1); renderRxDiet(); }
function removeRoutineBlock(i) { rxRoutine.splice(i, 1); renderRxRoutine(); }

async function savePrescription() {
  if (!selectedPatientId) return;
  const payload = { dieta: rxDiet, rutina: rxRoutine, updatedAt: new Date().toISOString() };
  try {
    const res = await fetch(`/api/patients/${selectedPatientId}/prescription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      // Update local cache
      const idx = allPatients.findIndex(p => p.id === selectedPatientId);
      if (idx >= 0) allPatients[idx].prescripcionActiva = payload;
      showToast('✅ Prescripción guardada y activada');
    } else {
      showToast(data.error || 'Error al guardar', true);
    }
  } catch(e) {
    showToast('Error de conexión', true);
  }
}

async function sendPlanWhatsApp() {
  if (!selectedPatientId) return;
  const btn = document.getElementById('rx-send-btn');
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Enviando…';
  btn.disabled = true;
  try {
    // Save first to ensure latest data is sent
    await savePrescription();
    const res = await fetch(`/api/patients/${selectedPatientId}/send-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Plan enviado por WhatsApp');
      if (data.url) {
        const link = document.getElementById('rx-patient-link');
        if (link) { link.href = data.url; link.style.display = ''; }
      }
    } else {
      showToast(data.error || 'Error al enviar', true);
    }
  } catch(e) {
    showToast('Error de conexión', true);
  } finally {
    btn.innerHTML = origHTML;
    btn.disabled = false;
  }
}

function updateComplianceGauge(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const ring = document.getElementById('rx-ring');
  const lbl = document.getElementById('rx-pct-label');
  const title = document.getElementById('rx-compliance-title');
  const sub = document.getElementById('rx-compliance-sub');
  if (!ring) return;

  const circum = 2 * Math.PI * 15.9;
  ring.style.strokeDasharray = `${circum} ${circum}`;
  ring.style.strokeDashoffset = circum - (pct / 100) * circum;

  const color = pct === 100 ? 'var(--green-text)' : pct >= 60 ? 'var(--amber-text)' : 'var(--blue-mid)';
  ring.style.stroke = color;
  if (lbl) { lbl.textContent = pct + '%'; lbl.style.color = color; }

  if (total === 0) {
    if (title) title.textContent = 'Sin prescripción activa';
    if (sub) sub.textContent = 'Crea un plan y guárdalo para empezar';
  } else if (pct === 100) {
    if (title) title.textContent = '🎉 ¡Plan completado al 100%!';
    if (sub) sub.textContent = `${done} de ${total} ítems completados hoy`;
  } else if (done > 0) {
    if (title) title.textContent = `${pct}% de cumplimiento`;
    if (sub) sub.textContent = `${done} de ${total} ítems completados hoy`;
  } else {
    if (title) title.textContent = 'Sin datos de cumplimiento';
    if (sub) sub.textContent = 'El paciente aún no ha marcado ningún ítem';
  }
}

// Real-time socket listener for compliance updates from the patient's phone
if (typeof socket !== 'undefined') {
  socket.on('complianceUpdate', ({ patientId, date, pct, done, total }) => {
    if (patientId === selectedPatientId) {
      updateComplianceGauge(done, total);
      showToast(`📱 Paciente actualizó su plan: ${pct}% cumplido`);
    }
  });
}

// ═══════════════════════════════════════════════
// EXPORT & REMINDER FUNCTIONS
// ═══════════════════════════════════════════════
async function exportToExcel(data, filename, sheetName, headers, title) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.views = [{ showGridLines: true }];

  // 1. Add title banner at the top
  const titleRow = worksheet.addRow([title]);
  worksheet.mergeCells(`A1:${String.fromCharCode(65 + headers.length - 1)}1`);
  titleRow.height = 40;
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1E3A8A' } // Deep Blue
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // 2. Add metadata (date of generation)
  const metaRow = worksheet.addRow([`Reporte generado el: ${new Date().toLocaleString('es-DO')} | Sistema: DentaFlow`]);
  worksheet.mergeCells(`A2:${String.fromCharCode(65 + headers.length - 1)}2`);
  metaRow.height = 20;
  const metaCell = worksheet.getCell('A2');
  metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: '4B5563' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Empty spacer row
  worksheet.addRow([]);

  // 3. Add table headers
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 26;
  
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '2563EB' } // Royal Blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: '93C5FD' } },
      left: { style: 'thin', color: { argb: '93C5FD' } },
      bottom: { style: 'medium', color: { argb: '1E3A8A' } },
      right: { style: 'thin', color: { argb: '93C5FD' } }
    };
  });

  // 4. Add data rows
  data.forEach((rowData, idx) => {
    const row = worksheet.addRow(rowData);
    row.height = 20;
    
    // Zebra striping
    const zebraColor = (idx % 2 === 0) ? 'F8FAFC' : 'FFFFFF';
    
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: zebraColor }
      };
      
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };

      const headerText = headers[colNumber - 1];
      if (headerText === 'Monto (RD$)' || headerText === 'Monto') {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        const val = parseFloat(cell.value);
        if (!isNaN(val)) {
          cell.value = val;
          cell.numFmt = '"RD$"#,##0.00';
        }
      } else if (headerText === 'Fecha' || headerText === 'Fecha / Hora' || headerText === 'Hora' || headerText === 'Estado' || headerText === 'Origen' || headerText === 'ID Pago' || headerText === 'Stock Actual' || headerText === 'Stock Mínimo' || headerText === 'Stock mín.') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (headerText === 'Estado') {
          const statusVal = String(cell.value).toLowerCase();
          if (statusVal === 'confirmada' || statusVal === 'pagado' || statusVal === 'normal' || statusVal === 'ok') {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '166534' } };
          } else if (statusVal === 'asistida') {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '1E3A8A' } };
          } else if (statusVal === 'cancelada' || statusVal.includes('alerta') || statusVal.includes('bajo')) {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '991B1B' } };
          } else if (statusVal === 'pendiente' || statusVal.includes('moderado')) {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '9A3412' } };
          }
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // 5. Auto-fit column widths
  worksheet.columns.forEach((column, colIdx) => {
    let maxLen = 0;
    column.eachCell((cell, rowIdx) => {
      if (rowIdx > 3) {
        const valStr = cell.value ? String(cell.value) : '';
        if (valStr.length > maxLen) {
          maxLen = valStr.length;
        }
      }
    });
    
    const headerText = headers[colIdx];
    if (headerText && headerText.length > maxLen) {
      maxLen = headerText.length;
    }
    
    column.width = Math.max(maxLen + 4, 12);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function exportCitasToExcel() {
  const filter = document.getElementById('filtro-estado')?.value || '';
  const data = filter ? allAppointments.filter(a => a.status === filter) : allAppointments;
  if (!data.length) {
    showToast('No hay citas para exportar', true);
    return;
  }
  
  const headers = ['Paciente', 'Teléfono', 'Servicio', 'Fecha', 'Hora', 'Estado', 'Origen'];
  const rows = data.map(a => [
    a.nombre || '',
    (a.jid || a.telefono || '').replace('@s.whatsapp.net', ''),
    a.servicio || '',
    a.fecha || '',
    a.hora || '',
    a.status || 'confirmada',
    a.source === 'manual' ? 'Manual' : 'Chatbot IA'
  ]);
  
  const clinicName = (configData && configData.negocio && configData.negocio.nombre) ? configData.negocio.nombre : 'Clínica';
  const filename = `Citas_${filter || 'Todas'}_${new Date().toISOString().slice(0,10)}.xlsx`;
  
  showToast('Generando Excel...');
  try {
    await exportToExcel(rows, filename, 'Citas', headers, `${clinicName} - Listado de Citas`);
    showToast('✅ Citas exportadas a Excel');
  } catch (err) {
    console.error('Error al exportar:', err);
    showToast('Error al generar Excel', true);
  }
}

async function exportInventarioToExcel() {
  if (!allInventory.length) {
    showToast('No hay insumos para exportar', true);
    return;
  }
  
  const headers = ['Insumo', 'Categoría', 'Stock Actual', 'Stock Mínimo', 'Unidad', 'Estado'];
  const rows = allInventory.map(i => {
    let estado = 'Normal';
    if (i.stockActual <= i.stockMinimo) {
      estado = 'Alerta - Stock bajo';
    } else if (i.stockActual <= i.stockMinimo * 1.5) {
      estado = 'Advertencia - Stock moderado';
    }
    return [
      i.nombre || '',
      i.categoria || '',
      i.stockActual,
      i.stockMinimo,
      i.unidad || '',
      estado
    ];
  });
  
  const clinicName = (configData && configData.negocio && configData.negocio.nombre) ? configData.negocio.nombre : 'Clínica';
  const filename = `Inventario_${new Date().toISOString().slice(0,10)}.xlsx`;
  
  showToast('Generando Excel...');
  try {
    await exportToExcel(rows, filename, 'Inventario', headers, `${clinicName} - Inventario de Insumos`);
    showToast('✅ Inventario exportado a Excel');
  } catch (err) {
    console.error('Error al exportar:', err);
    showToast('Error al generar Excel', true);
  }
}

async function exportPagosToExcel() {
  const search = document.getElementById('pago-search')?.value.toLowerCase() || '';
  const data = search ? allPayments.filter(p => (p.nombrePaciente||'').toLowerCase().includes(search)) : allPayments;
  
  if (!data.length) {
    showToast('No hay pagos para exportar', true);
    return;
  }
  
  const headers = ['ID Pago', 'Paciente', 'Servicio', 'Monto (RD$)', 'Forma de Pago', 'Fecha', 'Estado'];
  const rows = [...data].reverse().map((p, index) => [
    `#${String(data.length - index).padStart(4,'0')}`,
    p.nombrePaciente || '',
    p.servicio || '',
    p.monto || 0,
    p.formaPago || '',
    p.fecha || '',
    p.estado || 'pendiente'
  ]);
  
  const clinicName = (configData && configData.negocio && configData.negocio.nombre) ? configData.negocio.nombre : 'Clínica';
  const filename = `Pagos_${new Date().toISOString().slice(0,10)}.xlsx`;
  
  showToast('Generando Excel...');
  try {
    await exportToExcel(rows, filename, 'Pagos', headers, `${clinicName} - Registro de Pagos`);
    showToast('✅ Pagos exportados a Excel');
  } catch (err) {
    console.error('Error al exportar:', err);
    showToast('Error al generar Excel', true);
  }
}

async function sendAllReminders() {
  const filter = document.getElementById('filtro-estado')?.value || '';
  const targetApts = allAppointments.filter(a => {
    if (filter && a.status !== filter) return false;
    return a.status === 'confirmada' || a.status === 'asistida';
  });

  if (!targetApts.length) {
    showToast('No hay citas pendientes de recordar con el filtro actual', true);
    return;
  }

  // Pre-detectar citas sin número de WhatsApp válido
  const sinNumero = targetApts.filter(a => {
    const jid = a.jid || '';
    const tel = a.telefono || '';
    const hasLid = jid.endsWith('@lid');
    const hasPhone = jid.endsWith('@s.whatsapp.net') || tel.replace(/[^0-9]/g,'').length >= 10;
    return hasLid && !tel.replace(/[^0-9]/g,'').length;
  });

  let confirmMsg = `¿Estás seguro de enviar recordatorios de WhatsApp a ${targetApts.length} paciente(s)?`;
  if (sinNumero.length > 0) {
    confirmMsg += `\n\n⚠️ ${sinNumero.length} cita(s) no tienen número de teléfono guardado y serán omitidas:\n` +
      sinNumero.map(a => `• ${a.nombre}`).join('\n');
  }

  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById('btn-recordar-todos');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;

  let successCount = 0;
  let failDetails = [];

  for (let i = 0; i < targetApts.length; i++) {
    const apt = targetApts[i];
    btn.innerHTML = `<span class="spinner" style="width:10px;height:10px;border-width:1.5px;margin:0"></span> Enviando ${i+1}/${targetApts.length}...`;
    try {
      const res = await fetch('/api/appointments/' + apt.id + '/remind', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        successCount++;
      } else {
        failDetails.push(`${apt.nombre}: ${data.error || 'Error desconocido'}`);
      }
    } catch (e) {
      failDetails.push(`${apt.nombre}: Error de conexión`);
    }
    // Pequeña pausa entre mensajes para evitar bloqueo de WhatsApp
    await new Promise(r => setTimeout(r, 800));
  }

  btn.disabled = false;
  btn.innerHTML = originalHtml;

  if (failDetails.length > 0) {
    const failMsg = `🔔 Enviados: ${successCount} ✅  |  Fallidos: ${failDetails.length} ❌\n\n` + failDetails.join('\n');
    alert(failMsg);
    showToast(`🔔 ${successCount} enviados, ${failDetails.length} fallidos (ver detalle)`, failDetails.length > 0);
  } else {
    showToast(`✅ Recordatorios enviados exitosamente a ${successCount} paciente(s)`);
  }
  fetchAppointments();
}

// ═══════════════════════════════════════════
// TOAST & UTILS
// ═══════════════════════════════════════════
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  const icon = t.querySelector('i');
  document.getElementById('toast-msg').textContent = msg;
  icon.className = isError ? 'ti ti-circle-x' : 'ti ti-circle-check';
  t.className = `toast${isError?' error':''} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function escHtml(t) {
  if(!t) return '';
  const d = document.createElement('div');
  d.textContent = String(t);
  return d.innerHTML;
}

function formatTime(dateStr) {
  const d = new Date(dateStr), now = new Date();
  const diff = (now-d)/1000;
  if(diff < 60) return 'Ahora';
  if(diff < 3600) return `${Math.floor(diff/60)}m`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h`;
  return d.toLocaleDateString('es-DO',{day:'2-digit',month:'short'});
}

// ═══════════════════════════════════════════
// INTERVALOS DE ACTUALIZACIÓN
// ═══════════════════════════════════════════
let refreshTimers = [];

function startIntervals() {
  stopIntervals();
  
  refreshTimers.push(setInterval(async () => {
    if (!currentSession) return;
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      updateKPIs(stats);
    } catch(e) {}
  }, 5000));
  
  refreshTimers.push(setInterval(() => {
    if (currentSession) fetchConversations();
  }, 10000));
  
  refreshTimers.push(setInterval(() => {
    if (currentSession) fetchAppointments();
  }, 30000));
  
  refreshTimers.push(setInterval(() => {
    if (currentSession) fetchPayments();
  }, 60000));
  
  refreshTimers.push(setInterval(() => {
    if (currentSession) fetchInventory();
  }, 60000));

  refreshTimers.push(setInterval(async () => {
    if (!currentSession) return;
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if(data.qr) { 
        showQR(data.qr); 
        updateWAStatus('qr'); 
      } else if(data.whatsapp === 'connected') { 
        updateWAStatus('connected'); 
      } else {
        updateWAStatus(data.whatsapp || 'disconnected');
      }
    } catch(e) {}
  }, 2000));
}

function stopIntervals() {
  refreshTimers.forEach(t => clearInterval(t));
  refreshTimers = [];
}

// ─── INICIALIZAR CONTROLADOR DE AUTENTICACIÓN ───
initAuth();
