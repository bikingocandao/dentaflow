// ═══════════════════════════════════════════════
//  🤖 CHATBOT IA — SERVIDOR PRINCIPAL
// ═══════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const { initAI } = require('./src/ai');
const { connectWhatsApp, setSocketIO, getStatus, getQR, getQRAge, forceNewQR, sendReminders, sendMessage } = require('./src/whatsapp');
const conversations = require('./src/conversations');
const { loadConfig, saveConfig } = require('./src/prompts');
const { createClient, getClientsList, getClientLiveStatus } = require('./src/clients');
const { initVoice } = require('./src/voice');
const crypto = require('crypto');
const QRCode = require('qrcode');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'dentaflow-default-secret-9911';

// Generar un token JWT simple de forma nativa sin dependencias
function generateToken(username) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// Verificar un token JWT de forma nativa sin dependencias
function verifyToken(token) {
  try {
    if (!token) return null;
    const [header, payload, signature] = token.split('.');
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    if (signature !== expectedSignature) return null;
    
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ═══ INICIALIZACIÓN ═══
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de verificación de token JWT local
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado: Token ausente o incorrecto' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Acceso denegado: Sesión inválida o expirada' });
  }
  req.user = decoded;
  next();
}

// Aplicar middleware de autenticación a rutas API (excepto públicas)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }
  // Excluir endpoints públicos específicos
  if (req.path === '/api/registro-visita' && req.method === 'POST') {
    return next();
  }
  if (req.path === '/api/config' && req.method === 'GET') {
    return next();
  }
  if (req.path === '/api/auth/login' && req.method === 'POST') {
    return next();
  }
  if (req.path === '/api/server-info' && req.method === 'GET') {
    return next();
  }
  if (req.path === '/api/debug-env' && req.method === 'GET') {
    return next(); // Temporal: diagnóstico de variables de entorno
  }
  if (req.path === '/api/registro-qr' && req.method === 'GET') {
    return next();
  }
  if (req.path === '/api/utils/qr' && req.method === 'GET') {
    return next();
  }
  if (req.path.startsWith('/api/patient-plan/')) {
    return next(); // Public: patient reads their own plan
  }
  if (req.path.startsWith('/api/verify/')) {
    return next(); // Public: verify prescription
  }
  if (req.path === '/api/patient-auth' && req.method === 'POST') {
    return next(); // Public: patient authenticates
  }
  if (req.path.startsWith('/api/patients/') && req.path.endsWith('/compliance') && req.method === 'POST') {
    return next(); // Public: patient marks compliance from their phone
  }
  requireAuth(req, res, next);
});

// Middleware de autenticación para Socket.IO
// Los pacientes se conectan con role='patient' y patientId (sin token JWT)
// Los doctores se conectan con token JWT válido
io.use((socket, next) => {
  const role = socket.handshake.auth?.role;
  const patientId = socket.handshake.auth?.patientId;

  // Paciente accediendo a su portal (sin token)
  if (role === 'patient' && patientId) {
    socket.role = 'patient';
    socket.patientId = patientId;
    return next();
  }

  // Doctor/admin con JWT
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Acceso denegado: Token ausente'));
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Acceso denegado: Token inválido'));
  }
  socket.user = decoded;
  socket.role = 'doctor';
  next();
});

// Mapa de pacientes online: patientId -> socketId
const patientOnlineSockets = new Map();

// ═══ API REST — DASHBOARD ═══

// Endpoint de login local del administrador (sin Supabase)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = generateToken(username);
    return res.json({ success: true, token, user: { email: username } });
  } else {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
});

// Obtener IP local del servidor (para generar QR de acceso en red LAN)
app.get('/api/server-info', (req, res) => {
  const nets = os.networkInterfaces();
  let localIp = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        localIp = alias.address;
        break;
      }
    }
    if (localIp !== 'localhost') break;
  }
  res.json({ localIp, port: process.env.PORT || 3000 });
});

// Endpoint temporal de diagnóstico de variables de entorno
app.get('/api/debug-env', (req, res) => {
  res.json({
    adminUsername: process.env.ADMIN_USERNAME || 'not set',
    adminPasswordSet: !!process.env.ADMIN_PASSWORD,
    supabaseUrlSet: !!process.env.SUPABASE_URL || !!process.env.SUPABASE_URL_KEY,
    supabaseKeySet: !!process.env.SUPABASE_KEY || !!process.env.SUPABASE_ANON_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: process.env.SUPABASE_URL || 'not set'
  });
});


// Generar QR de la página de registro de pacientes (acceso público)
app.get('/api/registro-qr', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const nets = os.networkInterfaces();
    let localIp = req.hostname || 'localhost';
    for (const iface of Object.values(nets)) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) { localIp = alias.address; break; }
      }
      if (localIp !== req.hostname) break;
    }
    const port = process.env.PORT || 3000;
    const url = `http://${localIp}:${port}/registro.html`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#0a0f1e', light: '#ffffff' } });
    res.json({ qr: qrDataUrl, url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generar QR genérico para cualquier texto (acceso público)
app.get('/api/utils/qr', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const { text } = req.query;
    if (!text) {
      return res.status(400).json({ error: 'Falta el parámetro text' });
    }
    const qrDataUrl = await QRCode.toDataURL(text, { width: 300, margin: 2, color: { dark: '#0a0f1e', light: '#ffffff' } });
    res.json({ qr: qrDataUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



// Estado de conexión
app.get('/api/status', (req, res) => {
  res.json({
    whatsapp: getStatus(),
    qr: getQR(),
    plan: process.env.PLAN_ACTIVO || 'completo'
  });
});

// QR Code como imagen
app.get('/api/qr', (req, res) => {
  const qr = getQR();
  if (!qr) return res.status(404).json({ error: 'No QR disponible' });
  res.json({ qr });
});

// Edad del QR en segundos
app.get('/api/qr/age', (req, res) => {
  const age = getQRAge();
  res.json({ ageSeconds: age, status: getStatus() });
});

// Forzar nuevo QR (frontend lo llama cuando el QR está a punto de expirar)
app.post('/api/qr/refresh', async (req, res) => {
  try {
    if (getStatus() === 'connected') {
      return res.json({ success: false, message: 'Ya conectado, no se necesita QR' });
    }
    await forceNewQR();
    res.json({ success: true, message: 'Generando nuevo QR...' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Estadísticas
app.get('/api/stats', (req, res) => {
  res.json(conversations.getStats());
});

// Conversaciones activas
app.get('/api/conversations', (req, res) => {
  res.json(conversations.getAllConversations());
});

// Mensajes de una conversación
app.get('/api/conversations/:jid', (req, res) => {
  const messages = conversations.getConversationMessages(req.params.jid);
  res.json(messages);
});

// Enviar mensaje manual a un cliente
app.post('/api/conversations/:jid/send', async (req, res) => {
  try {
    const { message } = req.body;
    const { jid } = req.params;
    if (!message) {
      return res.status(400).json({ error: 'Falta el mensaje' });
    }
    
    // Enviar el mensaje por WhatsApp
    await sendMessage(jid, message);
    
    // Registrar el mensaje en el historial local
    conversations.addMessage(jid, 'assistant', message);
    
    // Notificar por sockets
    const cleanPhone = jid.replace('@s.whatsapp.net', '');
    const clientName = conversations.getClientName(jid) || 'Sin nombre';
    io.emit('newMessage', {
      jid,
      phoneNumber: cleanPhone,
      clientName,
      role: 'assistant',
      content: message,
      timestamp: new Date()
    });
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ CITAS ═══

app.get('/api/appointments', (req, res) => {
  res.json(conversations.getAppointments());
});

// Crear cita manual desde dashboard
app.post('/api/appointments/manual', (req, res) => {
  try {
    const apt = conversations.addManualAppointment(req.body);
    io.emit('newAppointment', apt);
    res.json({ success: true, appointment: apt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar estado de una cita
app.post('/api/appointments/:id/status', (req, res) => {
  try {
    const apt = conversations.updateAppointmentStatus(req.params.id, req.body.status);
    if (!apt) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json({ success: true, appointment: apt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Guardar notas clínicas de una cita
app.post('/api/appointments/:id/notes', (req, res) => {
  try {
    const apt = conversations.addAppointmentNotes(req.params.id, req.body.notes);
    if (!apt) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json({ success: true, appointment: apt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enviar recordatorio manual por WhatsApp
app.post('/api/appointments/:id/remind', async (req, res) => {
  try {
    const { type, timeframe, motive, customDate, message } = req.body || {};
    const apt = conversations.getAppointments().find(a => a.id === req.params.id);
    if (!apt) return res.status(404).json({ error: 'Cita no encontrada' });

    // Helper: limpiar y construir JID válido desde un número de teléfono
    function buildValidJid(phone) {
      if (!phone) return null;
      let clean = String(phone).replace(/[^0-9]/g, '');
      if (clean.length === 0) return null;
      // Agregar código de país 1 (RD/EEUU) si el número tiene 10 dígitos
      if (clean.length === 10) clean = '1' + clean;
      return `${clean}@s.whatsapp.net`;
    }

    // Detectar si el JID es un @lid (ID de dispositivo interno) y no un número de teléfono
    const isLidJid = apt.jid && apt.jid.endsWith('@lid');
    const isValidPhoneJid = apt.jid && apt.jid.endsWith('@s.whatsapp.net');

    let targetJid = null;

    if (isValidPhoneJid) {
      // JID de teléfono válido — limpiar el prefijo por si tiene caracteres raros
      targetJid = buildValidJid(apt.jid.split('@')[0]);
    } else if (isLidJid || !apt.jid) {
      // JID de dispositivo o sin JID — usar campo telefono
      targetJid = buildValidJid(apt.telefono);
    }

    if (!targetJid) {
      console.error(`⚠️  [Recordatorio] Sin número válido para ${apt.nombre}. jid=${apt.jid}, telefono=${apt.telefono}`);
      return res.status(400).json({
        error: `No hay número de WhatsApp válido para ${apt.nombre}. El JID registrado (${apt.jid || 'ninguno'}) no es un número de teléfono. Edite la cita y admita el número correcto.`
      });
    }

    // Usar el JID construido para el envío
    apt.jid = targetJid;

    const { loadConfig } = require('./src/prompts');
    let bizName = 'nuestra clínica';
    try {
      const config = loadConfig();
      if (config && config.negocio && config.negocio.nombre) {
        bizName = config.negocio.nombre;
      }
    } catch (cfgErr) {
      console.error('Error al cargar config para el nombre del negocio:', cfgErr);
    }

    // --- MODO: PROGRAMAR RETORNO EN EL FUTURO ---
    if (type === 'schedule_return') {
      let sendAtStr = '';
      if (timeframe === 'custom' && customDate) {
        sendAtStr = customDate;
      } else {
        const sendDate = new Date();
        if (timeframe === '1 mes') sendDate.setMonth(sendDate.getMonth() + 1);
        else if (timeframe === '2 meses') sendDate.setMonth(sendDate.getMonth() + 2);
        else if (timeframe === '3 meses') sendDate.setMonth(sendDate.getMonth() + 3);
        else if (timeframe === '6 meses') sendDate.setMonth(sendDate.getMonth() + 6);
        else if (timeframe === '1 año') sendDate.setFullYear(sendDate.getFullYear() + 1);
        else sendDate.setMonth(sendDate.getMonth() + 6); // default 6 meses
        
        sendAtStr = sendDate.toISOString().split('T')[0];
      }

      apt.scheduledReminder = {
        sendAt: sendAtStr,
        timeframe: timeframe === 'custom' ? `Fecha: ${customDate}` : timeframe,
        motive: motive || 'Consulta general',
        customMessage: message,
        sent: false
      };

      conversations.saveAppointmentsToDisk();
      console.log(`📅 [Recordatorio] Programado para ${apt.nombre} el ${sendAtStr} (Motivo: ${motive})`);
      return res.json({ success: true, message: `Recordatorio programado para el ${sendAtStr}` });
    }

    // --- MODO: ENVIAR AHORA ---
    console.log(`📲 [Recordatorio] Enviando a ${apt.nombre} → ${targetJid}`);
    
    // Construir el mensaje segun la acción
    let msg = '';
    if (message) {
      msg = message;
    } else if (type === 'now_return') {
      msg = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para recordarle la importancia de realizar su próxima consulta de seguimiento en **${timeframe}** para su: **${motive || 'Consulta general'}**.\n\nEscríbanos por aquí para coordinar y agendar su cita. ¡Que tenga un excelente día! 😊`;
    } else {
      // Estándar (original)
      if (apt.status === 'asistida') {
        msg = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para agradecerle su visita reciente. Le recordamos la importancia de programar su próxima cita de control o seguimiento para mantener su salud dental al día.\n\nEscríbanos por aquí si desea agendar. ¡Que tenga un excelente día! 😊`;
      } else {
        msg = `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para recordarle su cita:\n\n📅 ${apt.fecha} a las ⏰ ${apt.hora}\n💼 Servicio: ${apt.servicio || 'Consulta general'}\n\nPor favor, confirme su asistencia respondiendo:\n✅ *SI* — Para confirmar\n🔄 *CAMBIAR* — Para reprogramar\n❌ *CANCELAR* — Para cancelar\n\n¡Le esperamos! 😊`;
      }
    }
    
    const { sendMessage } = require('./src/whatsapp');
    await sendMessage(apt.jid, msg);
    
    // Marcar recordatorio como enviado en memoria/disco (solo si es el recordatorio principal)
    if (!type || type === 'now_standard') {
      conversations.markReminderSent(apt.id);
    }
    
    res.json({ success: true, message: 'Recordatorio enviado exitosamente' });
  } catch (e) {
    console.error('Error al enviar recordatorio manual:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ INVENTARIO ═══

app.get('/api/inventory', (req, res) => {
  res.json(conversations.getInventory());
});

app.post('/api/inventory', (req, res) => {
  try {
    const item = conversations.addInventoryItem(req.body);
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/inventory/:id', (req, res) => {
  try {
    const item = conversations.updateInventoryItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/inventory/:id', (req, res) => {
  try {
    const ok = conversations.deleteInventoryItem(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ PAGOS ═══

app.get('/api/payments', (req, res) => {
  res.json(conversations.getPayments());
});

app.post('/api/payments', (req, res) => {
  try {
    const pay = conversations.addPayment(req.body);
    res.json({ success: true, payment: pay });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/:id/cobrar', (req, res) => {
  try {
    const pay = conversations.markPaymentPaid(req.params.id);
    if (!pay) return res.status(404).json({ error: 'Pago no encontrado' });
    res.json({ success: true, payment: pay });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ REGISTRO DE VISITA (QR FÍSICO) ═══

app.post('/api/registro-visita', async (req, res) => {
  try {
    const { nombre, telefono, correo } = req.body;
    if (!nombre || !telefono) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios' });
    }
    const cleanPhone = telefono.replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    // Vincular nombre al número de WhatsApp
    conversations.setClientName(jid, nombre);

    // Registrar como cita general (con correo opcional si existe)
    const apt = conversations.addManualAppointment({
      nombre,
      telefono: cleanPhone,
      correo: correo || '',
      servicio: 'Registro general',
      fecha: new Date().toISOString().split('T')[0],
      hora: new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
    });

    io.emit('newAppointment', apt);
    res.json({
      success: true,
      message: 'Paciente registrado y WhatsApp vinculado',
      appointment: apt
    });
  } catch (e) {
    console.error('Error en registro-visita:', e.message);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// ═══ PACIENTES (EXPEDIENTE CLÍNICO) ═══

app.get('/api/patients', (req, res) => {
  try {
    const pts = conversations.getPatients();
    // Enrich each patient with their appointment summary
    const apts = conversations.getAppointments();
    const pays = conversations.getPayments();
    const enriched = pts.map(p => {
      const phone = p.telefono || '';
      const patApts = apts.filter(a =>
        (a.telefono && a.telefono === phone) ||
        (a.nombre && a.nombre === p.nombre)
      );
      const patPays = pays.filter(pay =>
        (pay.telefono && pay.telefono === phone) ||
        (pay.paciente && pay.paciente === p.nombre)
      );
      return { ...p, _appointments: patApts, _payments: patPays };
    });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/patients', (req, res) => {
  try {
    const pat = conversations.addPatient(req.body);
    res.json({ success: true, patient: pat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/patients/:id', (req, res) => {
  try {
    const pat = conversations.updatePatient(req.params.id, req.body);
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json({ success: true, patient: pat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Historial de conversación WhatsApp para un paciente
app.get('/api/patients/:id/chat', (req, res) => {
  try {
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.id === req.params.id);
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });
    
    const patName = (pat.nombre || '').toLowerCase().trim();
    const patPhone = pat.telefono ? String(pat.telefono).replace(/[^0-9]/g, '') : '';
    const patPhoneLast10 = patPhone.slice(-10);

    const allConvs = conversations.getAllConversations();
    const matchingConvs = [];

    allConvs.forEach(c => {
      const cName = (c.clientName || '').toLowerCase().trim();
      const cPhone = c.phoneNumber ? String(c.phoneNumber).replace(/[^0-9]/g, '') : '';
      const cPhoneLast10 = cPhone.slice(-10);
      
      let score = 0;
      
      // 1. Exact JID match
      if (pat.jid && c.jid === pat.jid) {
        score += 100;
      }
      
      // 2. Exact phone number match
      if (patPhone && cPhone && cPhone === patPhone) {
        score += 90;
      }
      
      // 3. Last 10 digits match
      if (patPhoneLast10 && cPhoneLast10 && cPhoneLast10 === patPhoneLast10) {
        score += 80;
      }
      
      // 4. Fuzzy name match
      const patWords = patName.split(' ').filter(w => w.length > 2);
      const cWords = cName.split(' ').filter(w => w.length > 2);
      const matchName = (patWords.length > 0 && patWords.some(w => cName.includes(w))) || 
                        (cWords.length > 0 && cWords.some(w => patName.includes(w)));
      if (matchName) {
        score += 50;
      }
      
      if (score > 0) {
        const fullConvMsgs = conversations.getConversationMessages(c.jid) || [];
        matchingConvs.push({
          jid: c.jid,
          score: score,
          messages: fullConvMsgs,
          msgCount: fullConvMsgs.length,
          lastActivity: new Date(c.lastActivity || 0)
        });
      }
    });

    // Sort matching conversations:
    // 1. Has messages (msgCount > 0) first
    // 2. Higher match score
    // 3. More recent activity
    matchingConvs.sort((a, b) => {
      const hasMsgsA = a.msgCount > 0 ? 1 : 0;
      const hasMsgsB = b.msgCount > 0 ? 1 : 0;
      if (hasMsgsA !== hasMsgsB) {
        return hasMsgsB - hasMsgsA;
      }
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return b.lastActivity - a.lastActivity;
    });

    let msgs = [];
    if (matchingConvs.length > 0) {
      msgs = matchingConvs[0].messages;
    }
    
    res.json(msgs || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ PRESCRIPCIÓN Y CUMPLIMIENTO ═══

// Guardar/actualizar prescripción activa del paciente
app.put('/api/patients/:id/prescription', async (req, res) => {
  try {
    const prescriptionId = req.body.uuid || crypto.randomUUID();
    const host = req.get('host');
    const protocol = req.protocol;
    const verifyUrl = `${protocol}://${host}/verify/${prescriptionId}`;
    let qrCodeBase64 = '';
    try {
      qrCodeBase64 = await QRCode.toDataURL(verifyUrl);
    } catch (qrErr) {
      console.error('Error generating QR:', qrErr.message);
    }

    const activePrescription = {
      ...req.body,
      uuid: prescriptionId,
      qrCode: qrCodeBase64,
      verifyUrl: verifyUrl,
      updatedAt: new Date().toISOString()
    };

    const pat = conversations.updatePatient(req.params.id, {
      prescripcionActiva: activePrescription
    });
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });

    // Also store in their recetas history array if not already present
    if (!pat.recetas) pat.recetas = [];
    const rxIndex = pat.recetas.findIndex(r => r.uuid === prescriptionId);
    if (rxIndex !== -1) {
      pat.recetas[rxIndex] = activePrescription;
    } else {
      pat.recetas.push(activePrescription);
    }
    conversations.updatePatient(req.params.id, { recetas: pat.recetas });

    io.emit('prescriptionUpdated', { patientId: req.params.id, prescription: activePrescription });
    res.json({ success: true, patient: pat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Enviar plan del día al paciente por WhatsApp
app.post('/api/patients/:id/send-plan', async (req, res) => {
  try {
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.id === req.params.id);
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });
    if (!pat.jid && !pat.telefono) {
      return res.status(400).json({ error: 'El paciente no tiene número de WhatsApp registrado' });
    }

    const jid = pat.jid || `${pat.telefono}@s.whatsapp.net`;
    const { getLocalIP } = require('os');
    const nets = require('os').networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
      }
    }
    const planURL = `http://${localIP}:${process.env.PORT || 3000}/patient/${req.params.id}/today`;
    const plan = pat.prescripcionActiva;
    const dietaStr = plan && plan.dieta && plan.dieta.length
      ? plan.dieta.map(b => `🍽️ *${b.nombre}*: ${b.alimentos}`).join('\n')
      : 'Sin plan de alimentación hoy.';
    const rutinaStr = plan && plan.rutina && plan.rutina.length
      ? plan.rutina.map(e => `💪 *${e.ejercicio}*: ${e.series} series × ${e.reps} reps`).join('\n')
      : 'Sin rutina de ejercicio hoy.';

    const msg = `👨‍⚕️ *Tu médico te ha enviado tu plan de hoy*\n\n*Alimentación:*\n${dietaStr}\n\n*Rutina:*\n${rutinaStr}\n\n📱 Marca tu cumplimiento aquí:\n${planURL}`;

    await sendMessage(jid, msg);
    res.json({ success: true, message: 'Plan enviado por WhatsApp', url: planURL });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Registrar cumplimiento de un ítem del plan (llamado desde la app del paciente)
app.post('/api/patients/:id/compliance', (req, res) => {
  try {
    const { date, type, itemIndex, completed } = req.body; // type: 'dieta'|'rutina'|'medicamentos'
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.id === req.params.id);
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });

    const cumplimiento = pat.cumplimiento || {};
    if (!cumplimiento[date]) cumplimiento[date] = { dieta: {}, rutina: {}, medicamentos: {} };
    if (!cumplimiento[date][type]) cumplimiento[date][type] = {};
    cumplimiento[date][type][String(itemIndex)] = completed;

    conversations.updatePatient(req.params.id, { cumplimiento });

    // Calculate today's compliance %
    const today = cumplimiento[date] || {};
    const plan = pat.prescripcionActiva || {};
    const dietaItems = (plan.dieta || []).length;
    const rutinaItems = (plan.rutina || []).length;
    const medicamentosItems = (plan.medicamentos || []).length;
    const total = dietaItems + rutinaItems + medicamentosItems;
    const done = Object.values(today.dieta || {}).filter(Boolean).length +
                 Object.values(today.rutina || {}).filter(Boolean).length +
                 Object.values(today.medicamentos || {}).filter(Boolean).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Emit real-time update to doctor dashboard
    io.emit('complianceUpdate', { patientId: req.params.id, date, pct, done, total });
    res.json({ success: true, pct });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Página pública del plan diario del paciente (sin autenticación)
app.get('/patient/:id/today', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'patient.html'));
});

// Página de login para pacientes
app.get('/patient', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'patient-login.html'));
});

// Autenticación de paciente por Cédula o Teléfono
app.post('/api/patient-auth', (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: 'Ingresa tu teléfono o cédula' });
    }

    const cleanId = String(identifier).replace(/[^0-9]/g, '');
    const pts = conversations.getPatients();
    
    const pat = pts.find(p => {
      const cleanPatPhone = String(p.telefono || '').replace(/[^0-9]/g, '');
      const cleanPatCedula = String(p.cedula || '').replace(/[^0-9]/g, '');
      return (cleanPatPhone && cleanPatPhone === cleanId) || 
             (cleanPatCedula && cleanPatCedula === cleanId) ||
             (p.cedula && p.cedula.trim() === identifier.trim());
    });

    if (!pat) {
      return res.status(404).json({ error: 'Identificador no válido o paciente no registrado.' });
    }

    res.json({ success: true, patientId: pat.id, url: `/patient/${pat.id}/today` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Datos del plan para el paciente (público, solo lectura)
app.get('/api/patient-plan/:id', (req, res) => {
  try {
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.id === req.params.id);
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });
    const today = new Date().toISOString().split('T')[0];
    const dayData = (pat.cumplimiento || {})[today] || {};
    res.json({
      nombre: pat.nombre,
      prescripcionActiva: pat.prescripcionActiva || null,
      cumplimientoHoy: {
        dieta: dayData.dieta || {},
        rutina: dayData.rutina || {},
        medicamentos: dayData.medicamentos || {}
      },
      fecha: today
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ VERIFICACIÓN PÚBLICA DE RECETAS ═══
app.get('/verify/:prescriptionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

app.get('/api/verify/:prescriptionId', (req, res) => {
  try {
    const rxId = req.params.prescriptionId;
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.prescripcionActiva && p.prescripcionActiva.uuid === rxId);
    if (pat) {
      return res.json({
        pacienteNombre: pat.nombre,
        pacienteTelefono: pat.telefono,
        pacienteId: pat.id,
        receta: pat.prescripcionActiva
      });
    }
    for (const p of pts) {
      const matchingRx = (p.recetas || []).find(r => r.uuid === rxId);
      if (matchingRx) {
        return res.json({
          pacienteNombre: p.nombre,
          pacienteTelefono: p.telefono,
          pacienteId: p.id,
          receta: matchingRx
        });
      }
    }
    res.status(404).json({ error: 'Receta no encontrada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ ADHERENCIA SEMANAL ═══
app.get('/api/patients/:id/adherence', (req, res) => {
  try {
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.id === req.params.id);
    if (!pat) return res.status(404).json({ error: 'Paciente no encontrado' });

    const cumplimiento = pat.cumplimiento || {};
    const plan = pat.prescripcionActiva || {};
    const dietaItems = (plan.dieta || []).length;
    const rutinaItems = (plan.rutina || []).length;
    const medicamentosItems = (plan.medicamentos || []).length;
    const totalItems = dietaItems + rutinaItems + medicamentosItems;

    const history = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayData = cumplimiento[dateStr] || {};
      const done = Object.values(dayData.dieta || {}).filter(Boolean).length +
                   Object.values(dayData.rutina || {}).filter(Boolean).length +
                   Object.values(dayData.medicamentos || {}).filter(Boolean).length;
      
      const pct = totalItems > 0 ? Math.round((done / totalItems) * 100) : 0;
      history.push({
        date: dateStr,
        pct,
        done,
        total: totalItems
      });
    }

    res.json({
      history,
      totalItems
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ PLANTILLAS DE TRATAMIENTO ═══
app.get('/api/templates', (req, res) => {
  try {
    res.json(conversations.getTemplates());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/templates', (req, res) => {
  try {
    const temp = conversations.saveTemplate(req.body);
    res.json({ success: true, template: temp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const ok = conversations.deleteTemplate(req.params.id);
    res.json({ success: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ CONFIGURACIÓN ═══

app.get('/api/config', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    saveConfig(req.body);
    res.json({ success: true, message: 'Configuración actualizada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ GESTIÓN DE CLIENTES ═══

// Lista de clientes (desde disco)
app.get('/api/clients', (req, res) => {
  const list = getClientsList(__dirname);
  res.json(list);
});

// Estado en vivo de un cliente (proxy a su API)
app.get('/api/clients/:port/live', async (req, res) => {
  try {
    const data = await getClientLiveStatus(parseInt(req.params.port));
    res.json(data);
  } catch (e) {
    res.json({ whatsapp: 'offline', qr: null, totalMessages: 0, activeConversations: 0, totalAppointments: 0, uptime: 0 });
  }
});

// Crear nuevo cliente
app.post('/api/clients', (req, res) => {
  try {
    const { folderName, businessName, ownerPhone, plan, port } = req.body;
    if (!folderName || !businessName || !port) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    const result = createClient({
      folderName,
      businessName,
      ownerPhone: ownerPhone || '',
      plan: plan || 'basico',
      port: parseInt(port, 10),
      templateDir: __dirname
    });
    res.json(result);
  } catch (e) {
    console.error('Error al crear cliente:', e);
    res.status(500).json({ error: e.message });
  }
});


// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    whatsapp: getStatus(),
    timestamp: new Date().toISOString()
  });
});

// ═══ SOCKET.IO — TIEMPO REAL ═══
io.on('connection', (socket) => {

  // ── PACIENTE conectado a su portal ──────────────────────
  if (socket.role === 'patient') {
    const pid = socket.patientId;
    socket.join(`patient:${pid}`);
    patientOnlineSockets.set(pid, socket.id);
    console.log(`📱 Paciente ${pid} conectado al portal`);

    // Notificar al doctor que el paciente está online
    io.to(`doctor:watch:${pid}`).emit('patientOnline', { patientId: pid, online: true });

    socket.on('disconnect', () => {
      patientOnlineSockets.delete(pid);
      console.log(`📱 Paciente ${pid} desconectado`);
      io.to(`doctor:watch:${pid}`).emit('patientOnline', { patientId: pid, online: false });
    });

    // Paciente envía mensaje al doctor
    socket.on('patientMessage', ({ text }) => {
      if (!text || !text.trim()) return;
      const msg = {
        from: 'patient',
        patientId: pid,
        text: text.trim(),
        ts: new Date().toISOString()
      };
      // Guardar en historial
      const pts = conversations.getPatients();
      const pat = pts.find(p => p.id === pid);
      if (pat) {
        const chat = pat.chatMedico || [];
        chat.push(msg);
        conversations.updatePatient(pid, { chatMedico: chat });
      }
      // Enviar al doctor
      io.to(`doctor:watch:${pid}`).emit('chatMessage', msg);
      // Confirmar al paciente
      socket.emit('chatMessage', msg);
    });

    return;
  }

  // ── DOCTOR/ADMIN conectado al dashboard ─────────────────
  console.log('🖥️  Dashboard conectado');

  // Enviar estado actual
  socket.emit('status', getStatus());
  socket.emit('stats', conversations.getStats());

  const qr = getQR();
  if (qr) {
    socket.emit('qr', qr);
    socket.emit('status', 'qr');
  }

  // Doctor se suscribe a un paciente específico para ver sus eventos en vivo
  socket.on('watchPatient', (patientId) => {
    // Salir de salas previas de paciente
    [...socket.rooms].forEach(r => {
      if (r.startsWith('doctor:watch:')) socket.leave(r);
    });
    if (patientId) {
      socket.join(`doctor:watch:${patientId}`);
      // Informar al doctor si el paciente ya está online
      const isOnline = patientOnlineSockets.has(patientId);
      socket.emit('patientOnline', { patientId, online: isOnline });
      // Enviar historial de chat existente
      const pts = conversations.getPatients();
      const pat = pts.find(p => p.id === patientId);
      if (pat && pat.chatMedico) {
        socket.emit('chatHistory', pat.chatMedico);
      } else {
        socket.emit('chatHistory', []);
      }
    }
  });

  // Doctor envía mensaje al paciente
  socket.on('doctorMessage', ({ patientId, text }) => {
    if (!text || !text.trim() || !patientId) return;
    const msg = {
      from: 'doctor',
      patientId,
      text: text.trim(),
      ts: new Date().toISOString()
    };
    // Guardar en historial
    const pts = conversations.getPatients();
    const pat = pts.find(p => p.id === patientId);
    if (pat) {
      const chat = pat.chatMedico || [];
      chat.push(msg);
      conversations.updatePatient(patientId, { chatMedico: chat });
    }
    // Enviar al paciente
    io.to(`patient:${patientId}`).emit('chatMessage', msg);
    // Confirmar al doctor
    socket.emit('chatMessage', msg);
  });

  socket.on('disconnect', () => {
    console.log('🖥️  Dashboard desconectado');
  });
});

// ═══ ARRANQUE ═══
async function start() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  🤖 CHATBOT IA — Bot de WhatsApp con IA');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // 1. Inicializar conversaciones
  conversations.init();

  // 2. Inicializar IA
  const aiReady = initAI();
  if (!aiReady) {
    console.log('');
    console.log('⚠️  Configura tu GROQ_API_KEY en el archivo .env');
    console.log('   Obtén tu key gratis: https://console.groq.com/keys');
    console.log('   El bot funcionará pero no responderá con IA.');
    console.log('');
  }

  // 3. Inicializar transcripción de voz
  initVoice();

  // 3. Conectar Socket.IO al módulo de WhatsApp
  setSocketIO(io);

  // 4. Iniciar servidor web
  server.listen(PORT, () => {
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`📊 Plan activo: ${process.env.PLAN_ACTIVO || 'completo'}`);
    console.log('');
  });

  // 5. Conectar WhatsApp
  console.log('📱 Conectando WhatsApp...');
  await connectWhatsApp();

  // 6. Programar recordatorios (cada hora)
  setInterval(async () => {
    try {
      await sendReminders();
    } catch (e) {
      console.error('Error en recordatorios:', e.message);
    }
  }, 60 * 60 * 1000);
}

start().catch(console.error);
