// ═══════════════════════════════════════════════
// 🤖 CHATBOT IA — DASHBOARD FRONTEND
// ═══════════════════════════════════════════════

const socket = io(window.BACKEND_URL || undefined);

// ═══ STATE ═══
let currentView = 'dashboard';
let currentConversation = null;
let conversationsData = [];
let configData = null;

// ═══ SOCKET.IO — REAL-TIME EVENTS ═══

socket.on('connect', () => {
  console.log('🔌 Dashboard conectado al servidor');
  fetchInitialData();
});

socket.on('status', (status) => {
  updateConnectionStatus(status);
});

socket.on('qr', (qrDataUrl) => {
  showQRCode(qrDataUrl);
});

socket.on('stats', (stats) => {
  updateStats(stats);
});

socket.on('newMessage', (msg) => {
  fetchConversations();
  if (currentConversation && msg.jid === currentConversation) {
    appendMessage(msg.role, msg.content);
  }
  if (msg.role === 'user') {
    showToast(`📩 ${msg.clientName}: ${msg.content.substring(0, 50)}...`, 'success');
  }
});

socket.on('newAppointment', (apt) => {
  showToast(`📅 Nueva cita: ${apt.nombre} — ${apt.servicio}`, 'success');
  fetchAppointments();
});

// ═══ INITIALIZATION ═══

async function fetchInitialData() {
  try {
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    updateConnectionStatus(statusData.whatsapp);
    if (statusData.qr) showQRCode(statusData.qr);
    updatePlanBadge(statusData.plan);

    const statsRes = await fetch('/api/stats');
    const stats = await statsRes.json();
    updateStats(stats);

    await fetchConversations();
    await fetchAppointments();
    await fetchConfig();
    await fetchClients();
  } catch (e) {
    console.error('Error fetching initial data:', e);
  }
}

// ═══ CONNECTION STATUS ═══

function updateConnectionStatus(status) {
  const badge = document.getElementById('status-badge');
  const text = document.getElementById('status-text');
  const qrOverlay = document.getElementById('qr-overlay');
  const dashboard = document.getElementById('connected-dashboard');

  badge.className = `status-badge ${status}`;

  switch (status) {
    case 'connected':
      text.textContent = 'Conectado';
      qrOverlay.style.display = 'none';
      dashboard.style.display = 'flex';
      break;
    case 'qr':
      text.textContent = 'Escanear QR';
      qrOverlay.style.display = 'flex';
      dashboard.style.display = 'none';
      break;
    case 'disconnected':
    default:
      text.textContent = 'Conectando...';
      qrOverlay.style.display = 'flex';
      dashboard.style.display = 'none';
      document.getElementById('qr-loading').style.display = 'block';
      document.getElementById('qr-container').style.display = 'none';
      break;
  }
}

/**
 * Muestra el QR Code renderizado como imagen desde el servidor.
 * @param {string} qrDataUrl - Base64 data URL de la imagen QR
 */
function showQRCode(qrDataUrl) {
  const container = document.getElementById('qr-container');
  const loading = document.getElementById('qr-loading');
  const img = document.getElementById('qr-image');

  if (!qrDataUrl) return;

  img.src = qrDataUrl;
  img.onload = () => {
    loading.style.display = 'none';
    container.style.display = 'block';
  };
  img.onerror = () => {
    console.error('Error cargando imagen QR');
    loading.style.display = 'block';
    container.style.display = 'none';
  };
}

function updatePlanBadge(plan) {
  const badge = document.getElementById('plan-badge');
  const labels = {
    basico: 'PLAN BÁSICO',
    estandar: 'PLAN ESTÁNDAR',
    completo: 'PLAN COMPLETO'
  };
  badge.textContent = labels[plan] || 'PLAN COMPLETO';
}

// ═══ STATS ═══

function updateStats(stats) {
  document.getElementById('stat-messages').textContent = stats.totalMessages || 0;
  document.getElementById('stat-conversations').textContent = stats.activeConversations || 0;
  document.getElementById('stat-appointments').textContent = stats.totalAppointments || 0;

  const uptime = stats.uptime || 0;
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  document.getElementById('stat-uptime').textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// ═══ CONVERSATIONS ═══

async function fetchConversations() {
  try {
    const res = await fetch('/api/conversations');
    conversationsData = await res.json();
    renderConversations();
  } catch (e) {
    console.error('Error fetching conversations:', e);
  }
}

function renderConversations() {
  const list = document.getElementById('conversations-list');
  const count = document.getElementById('conv-count');
  count.textContent = conversationsData.length;

  if (conversationsData.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">Esperando mensajes...</div>
        <div class="empty-state-text">Las conversaciones aparecerán aquí cuando los clientes escriban al bot.</div>
      </div>`;
    return;
  }

  list.innerHTML = conversationsData.map(conv => {
    const initials = getInitials(conv.clientName);
    const time = formatTime(conv.lastActivity);
    const isActive = conv.jid === currentConversation ? 'active' : '';

    return `
      <div class="conversation-item ${isActive}" onclick="selectConversation('${conv.jid}')">
        <div class="conversation-avatar">${initials}</div>
        <div class="conversation-info">
          <div class="conversation-name">${escapeHtml(conv.clientName)}</div>
          <div class="conversation-preview">${escapeHtml(conv.lastMessage)}</div>
        </div>
        <div class="conversation-meta">
          <div class="conversation-time">${time}</div>
          <div class="conversation-count">${conv.messageCount}</div>
        </div>
      </div>`;
  }).join('');
}

async function selectConversation(jid) {
  currentConversation = jid;
  renderConversations();

  const conv = conversationsData.find(c => c.jid === jid);
  const title = document.getElementById('chat-title');
  title.textContent = `💬 ${conv ? conv.clientName : 'Conversación'}`;

  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(jid)}`);
    const messages = await res.json();
    renderMessages(messages);
  } catch (e) {
    console.error('Error fetching messages:', e);
  }
}

function renderMessages(messages) {
  const container = document.getElementById('chat-messages');

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📩</div>
        <div class="empty-state-title">Sin mensajes</div>
      </div>`;
    return;
  }

  container.innerHTML = messages.map(msg => `
    <div class="message-bubble ${msg.role}">
      ${escapeHtml(msg.content)}
      <div class="message-time">${msg.role === 'user' ? '👤 Cliente' : '🤖 Bot'}</div>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

function appendMessage(role, content) {
  const container = document.getElementById('chat-messages');
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const div = document.createElement('div');
  div.className = `message-bubble ${role}`;
  div.innerHTML = `
    ${escapeHtml(content)}
    <div class="message-time">${role === 'user' ? '👤 Cliente' : '🤖 Bot'}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ═══ APPOINTMENTS ═══

async function fetchAppointments() {
  try {
    const res = await fetch('/api/appointments');
    const appointments = await res.json();
    renderAppointments(appointments);
  } catch (e) {
    console.error('Error fetching appointments:', e);
  }
}

function renderAppointments(appointments) {
  const list = document.getElementById('appointments-list');
  const count = document.getElementById('apt-count');
  count.textContent = appointments.length;

  if (appointments.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <div class="empty-state-title">Sin citas</div>
        <div class="empty-state-text">Las citas agendadas por el bot aparecerán aquí.</div>
      </div>`;
    return;
  }

  list.innerHTML = appointments.slice().reverse().map(apt => `
    <div class="appointment-item">
      <div class="appointment-name">📋 ${escapeHtml(apt.nombre || 'Sin nombre')}</div>
      <div class="appointment-detail">💼 ${escapeHtml(apt.servicio || '-')}</div>
      <div class="appointment-detail">📅 ${escapeHtml(apt.fecha || '-')} ⏰ ${escapeHtml(apt.hora || '-')}</div>
      <span class="appointment-status ${apt.status || 'confirmada'}">${apt.status || 'confirmada'}</span>
    </div>
  `).join('');
}

// ═══ CONFIGURATION ═══

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    configData = await res.json();
    populateConfigForm();
  } catch (e) {
    console.error('Error fetching config:', e);
  }
}

function populateConfigForm() {
  if (!configData) return;

  const n = configData.negocio || {};
  const b = configData.bot || {};
  const h = n.horario || {};

  document.getElementById('cfg-bot-nombre').value = b.nombre || '';
  document.getElementById('cfg-bot-plan').value = b.plan || 'completo';
  document.getElementById('cfg-nombre').value = n.nombre || '';
  document.getElementById('cfg-tipo').value = n.tipo || '';
  document.getElementById('cfg-direccion').value = n.direccion || '';
  document.getElementById('cfg-referencia').value = n.referencia || '';
  document.getElementById('cfg-web').value = n.sitio_web || '';
  document.getElementById('cfg-telefono').value = n.telefono || '';
  document.getElementById('cfg-instagram').value = n.instagram || '';
  document.getElementById('cfg-horario-lv').value = h.lunes_viernes || '';
  document.getElementById('cfg-horario-sab').value = h.sabados || '';
  document.getElementById('cfg-horario-dom').value = h.domingos || '';
  document.getElementById('cfg-dias-libres').value = (n.dias_libres || []).join(', ');
  document.getElementById('cfg-pagos').value = (configData.formas_pago || []).join(', ');
  document.getElementById('cfg-cancelacion').value = n.politica_cancelacion || '';

  // Horarios de citas
  const hc = configData.horarios_citas || {};
  document.getElementById('cfg-citas-lv').value = (hc.lunes_viernes || []).join(', ');
  document.getElementById('cfg-citas-sab').value = (hc.sabados || []).join(', ');

  // Servicios
  renderServicesConfig(configData.servicios || []);

  // FAQs
  renderFAQsConfig(configData.preguntas_frecuentes || []);
}

function renderServicesConfig(servicios) {
  const list = document.getElementById('services-list');
  list.innerHTML = servicios.map((s, i) => `
    <div class="service-item" data-index="${i}">
      <input type="text" value="${escapeHtml(s.nombre || '')}" placeholder="Servicio" data-field="nombre">
      <input type="text" value="${s.precio || 0}" placeholder="Precio" data-field="precio">
      <input type="text" value="${escapeHtml(s.duracion || '')}" placeholder="Duración" data-field="duracion">
      <button class="btn-remove" onclick="removeService(${i})">✕</button>
    </div>
  `).join('');
}

function addService() {
  if (!configData) configData = { servicios: [] };
  if (!configData.servicios) configData.servicios = [];
  configData.servicios.push({ nombre: '', precio: 0, moneda: 'RD$', duracion: '', descripcion: '' });
  renderServicesConfig(configData.servicios);
}

function removeService(index) {
  if (!configData || !configData.servicios) return;
  configData.servicios.splice(index, 1);
  renderServicesConfig(configData.servicios);
}

// ═══ FAQs CONFIG ═══

function renderFAQsConfig(faqs) {
  const list = document.getElementById('faqs-list');
  list.innerHTML = faqs.map((faq, i) => `
    <div class="faq-item" data-index="${i}" style="margin-bottom: 12px; padding: 14px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 8px;">
      <div style="display: flex; gap: 10px; align-items: start;">
        <div style="flex: 1;">
          <input type="text" class="config-input" value="${escapeHtml(faq.pregunta || '')}" placeholder="Pregunta..." data-faq-field="pregunta" style="width: 100%; margin-bottom: 8px;">
          <input type="text" class="config-input" value="${escapeHtml(faq.respuesta || '')}" placeholder="Respuesta..." data-faq-field="respuesta" style="width: 100%;">
        </div>
        <button class="btn-remove" onclick="removeFAQ(${i})">✕</button>
      </div>
    </div>
  `).join('');
}

function addFAQ() {
  if (!configData) configData = { preguntas_frecuentes: [] };
  if (!configData.preguntas_frecuentes) configData.preguntas_frecuentes = [];
  configData.preguntas_frecuentes.push({ pregunta: '', respuesta: '' });
  renderFAQsConfig(configData.preguntas_frecuentes);
}

function removeFAQ(index) {
  if (!configData || !configData.preguntas_frecuentes) return;
  configData.preguntas_frecuentes.splice(index, 1);
  renderFAQsConfig(configData.preguntas_frecuentes);
}

function getFAQsFromForm() {
  const items = document.querySelectorAll('.faq-item');
  return Array.from(items).map(item => ({
    pregunta: item.querySelector('[data-faq-field="pregunta"]').value,
    respuesta: item.querySelector('[data-faq-field="respuesta"]').value
  })).filter(faq => faq.pregunta.trim());
}

// ═══ SAVE CONFIG ═══

async function saveConfiguration() {
  try {
    const config = {
      negocio: {
        nombre: document.getElementById('cfg-nombre').value,
        tipo: document.getElementById('cfg-tipo').value,
        direccion: document.getElementById('cfg-direccion').value,
        referencia: document.getElementById('cfg-referencia').value,
        horario: {
          lunes_viernes: document.getElementById('cfg-horario-lv').value,
          sabados: document.getElementById('cfg-horario-sab').value,
          domingos: document.getElementById('cfg-horario-dom').value
        },
        dias_libres: document.getElementById('cfg-dias-libres').value.split(',').map(s => s.trim()).filter(Boolean),
        telefono: document.getElementById('cfg-telefono').value,
        instagram: document.getElementById('cfg-instagram').value,
        sitio_web: document.getElementById('cfg-web').value,
        politica_cancelacion: document.getElementById('cfg-cancelacion').value
      },
      bot: {
        nombre: document.getElementById('cfg-bot-nombre').value,
        plan: document.getElementById('cfg-bot-plan').value
      },
      servicios: getServicesFromForm(),
      servicio_estrella: configData?.servicio_estrella || '',
      promocion_actual: configData?.promocion_actual || '',
      horarios_citas: {
        lunes_viernes: document.getElementById('cfg-citas-lv').value.split(',').map(s => s.trim()).filter(Boolean),
        sabados: document.getElementById('cfg-citas-sab').value.split(',').map(s => s.trim()).filter(Boolean)
      },
      formas_pago: document.getElementById('cfg-pagos').value.split(',').map(s => s.trim()).filter(Boolean),
      perfil_cliente: configData?.perfil_cliente || '',
      preguntas_frecuentes: getFAQsFromForm()
    };

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const result = await res.json();
    if (result.success) {
      showToast('✅ Configuración guardada exitosamente', 'success');
      configData = config;
      updatePlanBadge(config.bot.plan);
    } else {
      showToast('❌ Error guardando configuración', 'error');
    }
  } catch (e) {
    console.error('Error saving config:', e);
    showToast('❌ Error de conexión', 'error');
  }
}

function getServicesFromForm() {
  const items = document.querySelectorAll('.service-item');
  return Array.from(items).map(item => ({
    nombre: item.querySelector('[data-field="nombre"]').value,
    precio: parseFloat(item.querySelector('[data-field="precio"]').value) || 0,
    moneda: 'RD$',
    duracion: item.querySelector('[data-field="duracion"]').value,
    descripcion: ''
  }));
}

// ═══ VIEW SWITCHING ═══

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`tab-${view}`).classList.add('active');

  document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'flex' : 'none';
  document.getElementById('view-config').style.display = view === 'config' ? 'block' : 'none';
  const viewClients = document.getElementById('view-clients');
  if(viewClients) viewClients.style.display = view === 'clients' ? 'block' : 'none';
  document.getElementById('stats-bar').style.display = view === 'dashboard' ? 'grid' : 'none';
  
  // Iniciar/detener polling de clientes
  if (clientPollTimer) { clearInterval(clientPollTimer); clientPollTimer = null; }
  if (view === 'clients') {
    fetchClients();
    clientPollTimer = setInterval(fetchAllClientStatuses, 5000);
  }
}

// ═══ CLIENTS MANAGEMENT ═══

let clientsData = [];
let clientLiveCache = {};
let clientPollTimer = null;

function toggleNewClientForm() {
  const form = document.getElementById('new-client-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function fetchClients() {
  const grid = document.getElementById('clients-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/clients');
    clientsData = await res.json();
    renderClientCards();
    // Fetch live status for each
    fetchAllClientStatuses();
  } catch (e) {
    console.error('Error fetching clients:', e);
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Error cargando clientes</div></div>';
  }
}

async function fetchAllClientStatuses() {
  for (const client of clientsData) {
    fetchClientLiveStatus(client.port);
  }
}

async function fetchClientLiveStatus(port) {
  try {
    const res = await fetch('/api/clients/' + port + '/live');
    const data = await res.json();
    clientLiveCache[port] = data;
    updateClientCard(port, data);
  } catch (e) {
    clientLiveCache[port] = { whatsapp: 'offline', qr: null, totalMessages: 0, activeConversations: 0, totalAppointments: 0, uptime: 0 };
    updateClientCard(port, clientLiveCache[port]);
  }
}

function renderClientCards() {
  const grid = document.getElementById('clients-grid');
  if (!grid || clientsData.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">👥</div><div class="empty-state-title">No hay bots creados</div><div class="empty-state-text">Haz clic en "Nuevo Cliente" para crear tu primer bot.</div></div>';
    return;
  }

  const planLabels = { basico: 'BÁSICO', estandar: 'ESTÁNDAR', completo: 'COMPLETO' };

  grid.innerHTML = clientsData.map(function(c) {
    var live = clientLiveCache[c.port] || null;
    var statusClass = live ? live.whatsapp : 'loading';
    var statusText = !live ? 'Cargando...' : (live.whatsapp === 'connected' ? 'Conectado' : live.whatsapp === 'qr' ? 'Escanear QR' : live.whatsapp === 'offline' ? 'Apagado' : 'Desconectado');

    var middleSection = '';
    if (!live) {
      middleSection = '<div class="client-loading"><div class="spinner"></div> Consultando estado...</div>';
    } else if (live.whatsapp === 'qr' && live.qr) {
      middleSection = '<div class="client-qr-section"><img src="' + escapeHtml(live.qr) + '" alt="QR ' + escapeHtml(c.businessName) + '" /><p>📱 Escanea con WhatsApp del cliente</p></div>';
    } else if (live.whatsapp === 'connected') {
      middleSection = '<div class="client-connected-section">✅ WhatsApp conectado y escuchando mensajes</div>';
    } else {
      middleSection = '<div class="client-offline-section">⚠️ Bot no disponible — verifica PM2</div>';
    }

    var statsSection = '';
    if (live) {
      var uptime = live.uptime || 0;
      var hours = Math.floor(uptime / 3600);
      var minutes = Math.floor((uptime % 3600) / 60);
      var uptimeStr = hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm';

      statsSection = '<div class="client-stats">'
        + '<div class="client-stat"><span class="client-stat-value">' + (live.totalMessages || 0) + '</span><span class="client-stat-label">Mensajes</span></div>'
        + '<div class="client-stat"><span class="client-stat-value">' + (live.activeConversations || 0) + '</span><span class="client-stat-label">Chats</span></div>'
        + '<div class="client-stat"><span class="client-stat-value">' + (live.totalAppointments || 0) + '</span><span class="client-stat-label">Citas</span></div>'
        + '<div class="client-stat"><span class="client-stat-value">' + uptimeStr + '</span><span class="client-stat-label">Uptime</span></div>'
        + '</div>';
    }

    return '<div class="client-card' + (c.isMain ? ' is-main' : '') + '" id="client-card-' + c.port + '">'
      + '<div class="client-card-header">'
      + '  <div>'
      + '    <div class="client-card-name">' + escapeHtml(c.businessName) + (c.isMain ? ' <span class="main-tag">Principal</span>' : '') + '</div>'
      + '    <div class="client-card-meta">'
      + '      <span>🤖 ' + escapeHtml(c.botName) + '</span>'
      + '      <span>🌐 Puerto ' + c.port + '</span>'
      + '      <span>💼 ' + c.servicios + ' servicios</span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="client-card-badges">'
      + '    <span class="plan-badge-sm">' + (planLabels[c.plan] || 'BÁSICO') + '</span>'
      + '    <span class="status-badge-sm ' + statusClass + '">● ' + statusText + '</span>'
      + '  </div>'
      + '</div>'
      + middleSection
      + statsSection
      + '<div class="client-card-actions">'
      + '  <a href="http://localhost:' + c.port + '" target="_blank" class="btn btn-primary">🌐 Abrir Dashboard</a>'
      + '  <a href="http://localhost:' + c.port + '/#config" target="_blank" class="btn btn-secondary">⚙️ Configurar</a>'
      + '</div>'
      + '</div>';
  }).join('');
}

function updateClientCard(port, live) {
  // Re-render just the specific card by re-rendering all (simple approach)
  renderClientCards();
}

async function createNewClient() {
  const folderName = document.getElementById('new-client-folder').value.trim();
  const businessName = document.getElementById('new-client-business').value.trim();
  const ownerPhone = document.getElementById('new-client-owner').value.trim();
  const plan = document.getElementById('new-client-plan').value;
  const port = document.getElementById('new-client-port').value.trim();
  const msgDiv = document.getElementById('new-client-msg');
  const btn = document.getElementById('btn-create-client');

  if (!folderName || !businessName || !port) {
    msgDiv.innerHTML = '<span style="color: #ef4444;">❌ Completa: Carpeta, Nombre del Negocio y Puerto.</span>';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Creando bot y levantando PM2...';
  msgDiv.innerHTML = '';

  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName, businessName, ownerPhone, plan, port })
    });
    const result = await res.json();

    if (result.success) {
      msgDiv.innerHTML = '<span style="color: #10b981;">✅ Bot creado. Esperando QR en el dashboard...</span>';
      showToast('✅ ' + businessName + ' creado en puerto ' + port, 'success');
      document.getElementById('new-client-folder').value = '';
      document.getElementById('new-client-business').value = '';
      document.getElementById('new-client-owner').value = '';
      document.getElementById('new-client-port').value = '';
      // Refrescar y mostrar el nuevo cliente
      setTimeout(function() { fetchClients(); }, 3000);
      setTimeout(function() { document.getElementById('new-client-form').style.display = 'none'; }, 4000);
    } else {
      msgDiv.innerHTML = '<span style="color: #ef4444;">❌ ' + (result.error || 'Error desconocido') + '</span>';
    }
  } catch (e) {
    console.error(e);
    msgDiv.innerHTML = '<span style="color: #ef4444;">❌ Error de conexión al crear cliente.</span>';
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Crear y Levantar Bot';
  }
}

// ═══ UTILITIES ═══

function getInitials(name) {
  if (!name || name === 'Sin nombre') return '?';
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return 'Ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ═══ QR POLLING FALLBACK ═══
// If WebSocket doesn't deliver the QR (race condition), poll the REST API
let qrDisplayed = false;

function markQRDisplayed() {
  qrDisplayed = true;
}

// Override showQRCode to track display
const _origShowQR = showQRCode;
showQRCode = function(qrDataUrl) {
  _origShowQR(qrDataUrl);
  if (qrDataUrl) markQRDisplayed();
};

// Poll for QR every 3 seconds if we're still waiting
const qrPoller = setInterval(async () => {
  if (qrDisplayed) return;
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();
    if (data.qr) {
      updateConnectionStatus('qr');
      _origShowQR(data.qr);
      markQRDisplayed();
    } else if (data.whatsapp === 'connected') {
      updateConnectionStatus('connected');
      clearInterval(qrPoller);
    }
  } catch (e) {}
}, 3000);

// ═══ AUTO-REFRESH ═══
setInterval(fetchConversations, 10000);
setInterval(fetchAppointments, 30000);
setInterval(async () => {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    updateStats(stats);
  } catch (e) {}
}, 5000);
