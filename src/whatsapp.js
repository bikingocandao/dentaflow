// ═══════════════════════════════════════════════
// CLIENTE WHATSAPP — BAILEYS + QR SERVER-SIDE
// Versión producción — robusto y estable
// ═══════════════════════════════════════════════

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Browsers } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { getAIResponse, extractAppointmentData, cleanBotResponse } = require('./ai');
const conversations = require('./conversations');
const { initVoice, transcribeVoiceNote, isVoiceMessage } = require('./voice');
const tts = require('./tts');


let sock = null;
let qrDataUrl = null;
let connectionStatus = 'disconnected';
let io = null;

// Control de reconexión
let reconnectTimer = null;
let qrAttempts = 0;
let qrGeneratedAt = null; // timestamp del último QR
const MAX_QR_ATTEMPTS = 5; // Intentos antes de parar (cada uno dura ~60s)

// Watchdog de conexión: Revisa cada 60s si está desconectado y sin reintento activo
setInterval(() => {
  if (connectionStatus === 'disconnected' && !reconnectTimer) {
    console.log('🛡️ [Watchdog] WhatsApp desconectado detectado. Forzando reconexión automática...');
    connectWhatsApp();
  }
}, 60000);

function setSocketIO(socketIO) {
  io = socketIO;
}

function getStatus() {
  return connectionStatus;
}

function getQR() {
  return qrDataUrl;
}

function getQRAge() {
  if (!qrGeneratedAt) return null;
  return Math.floor((Date.now() - qrGeneratedAt) / 1000); // seconds
}

async function forceNewQR() {
  console.log('🔄 [QR] Forzando generación de QR nuevo...');
  // Cerrar socket actual sin marcar como logged out
  if (sock) {
    try { sock.end(); } catch(e) {}
    sock = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  qrDataUrl = null;
  qrGeneratedAt = null;
  qrAttempts = 0;
  connectionStatus = 'disconnected';
  emitToAll('status', 'disconnected');
  // Reconectar para generar QR nuevo
  reconnectTimer = setTimeout(connectWhatsApp, 500);
}

function emitToAll(event, data) {
  if (io) io.emit(event, data);
}

async function connectWhatsApp() {
  // Limpiar timer previo
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const authDir = process.env.AUTH_DIR || path.join(__dirname, '..', 'auth_info');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  // Identificador único por instancia — evita conflictos entre bots
  const botName = process.env.BOT_NAME || path.basename(path.join(__dirname, '..'));

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    // Ubuntu browser — más estable con WhatsApp multi-dispositivo
    browser: ['ChatBot', 'Chrome', '120.0.0'],
    connectTimeoutMs: 120000,
    qrTimeout: 90000,       // 90 segundos por QR para escanearlo
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 30000,
    emitOwnEvents: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  // ═══ EVENTOS DE CONEXIÓN ═══
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // === QR RECIBIDO ===
    if (qr) {
      qrAttempts++;
      try {
        qrDataUrl = await QRCode.toDataURL(qr, {
          width: 300,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'M'
        });
        qrGeneratedAt = Date.now(); // ← guardar timestamp
        connectionStatus = 'qr';
        console.log(`📱 QR Code generado (intento ${qrAttempts}/${MAX_QR_ATTEMPTS}) — Escanea con WhatsApp`);
        emitToAll('qr', qrDataUrl);
        emitToAll('status', 'qr');
      } catch (err) {
        console.error('❌ Error generando QR:', err.message);
      }
    }

    // === CONEXIÓN CERRADA ===
    if (connection === 'close') {
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.log(`🔌 Conexión de WhatsApp cerrada. Status Code: ${statusCode || 'unknown'}. Error:`, error ? error.message : 'none');
      if (error && error.stack) {
        console.log('   Error Stack:', error.stack);
      }

      connectionStatus = 'disconnected';
      qrDataUrl = null;
      emitToAll('status', 'disconnected');

      if (loggedOut) {
        // El usuario cerró sesión manualmente — borrar credenciales y generar QR nuevo
        console.log('🚫 Sesión cerrada por el usuario. Limpiando credenciales...');
        try {
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
        } catch (e) { /* ignorar */ }
        qrAttempts = 0;
        reconnectTimer = setTimeout(connectWhatsApp, 3000);
      } else if (qrAttempts >= MAX_QR_ATTEMPTS) {
        // Demasiados QR sin escanear — reconectar de inmediato con QR nuevo
        console.log(`🔄 Generando QR nuevo para escanear...`);
        qrAttempts = 0;
        reconnectTimer = setTimeout(connectWhatsApp, 3000);
      } else {
        // Desconexión inesperada — reconectar rápido
        console.log('🔄 Reconectando en 5s...');
        reconnectTimer = setTimeout(connectWhatsApp, 5000);
      }
    }

    // === CONECTADO ===
    if (connection === 'open') {
      connectionStatus = 'connected';
      qrDataUrl = null;
      qrAttempts = 0;
      console.log('');
      console.log('✅ ¡WhatsApp conectado exitosamente!');
      console.log('   El bot está escuchando mensajes...');
      console.log('');
      emitToAll('status', 'connected');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // 📞 DETECTOR Y RECHAZADOR DE LLAMADAS (AUTO-REJECT)
  sock.ev.on('call', async (callsList) => {
    for (const call of callsList) {
      if (call.status === 'offer') {
        console.log(`📞 Recibiendo llamada de: ${call.from} (${call.id}). Rechazando automáticamente...`);
        try {
          // Rechazar la llamada de inmediato
          await sock.rejectCall(call.id, call.from);
          
          // Enviar mensaje de texto educativo
          const jid = call.from;
          const rejectionMessage = '😊 *Nota del Sistema*: Hola. Por políticas de nuestro servicio automatizado, no podemos recibir llamadas directas por este número.\n\nSin embargo, *puedes enviarme un mensaje de texto o una nota de voz* 🎤 y con gusto te atenderé y agendaré tu cita de inmediato. ¡Muchas gracias! 👋';
          
          // Simular escritura y enviar
          await delay(1000);
          await sock.sendMessage(jid, { text: rejectionMessage });
          console.log(`✉️ Mensaje de rechazo de llamada enviado a ${call.from}`);
        } catch (err) {
          console.error('❌ Error al procesar rechazo de llamada:', err.message);
        }
      }
    }
  });

  // ═══ PROCESAMIENTO DE MENSAJES ═══
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await processMessage(msg);
      } catch (error) {
        console.error('❌ Error procesando mensaje:', error.message);
      }
    }
  });

  return sock;
}

// ═══ PROCESAR MENSAJE ENTRANTE ═══
async function processMessage(msg) {
  if (msg.key.fromMe) return;
  if (msg.key.remoteJid === 'status@broadcast') return;
  if (msg.key.remoteJid.endsWith('@g.us')) return; // Ignorar grupos

  let text = msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || msg.message?.imageMessage?.caption
    || '';

  // 🎤 SOPORTE DE NOTAS DE VOZ
  if (isVoiceMessage(msg) && sock) {
    console.log('🎤 Nota de voz recibida — Transcribiendo...');
    const transcription = await transcribeVoiceNote(msg, sock);
    if (transcription) {
      text = transcription;
    } else {
      // No se pudo transcribir, informar al cliente
      const jid = msg.key.remoteJid;
      await sendMessage(jid, '😊 Recibí tu nota de voz pero no pude procesarla. ¿Podrías escribir tu mensaje por texto? ¡Gracias!');
      return;
    }
  }

  if (!text.trim()) return;

  const jid = msg.key.remoteJid;
  const phone = jid.replace('@s.whatsapp.net', '');
  const pushName = msg.pushName || '';

  console.log(`📩 [${phone}] ${pushName}: ${text}`);

  // Guardar mensaje del usuario
  conversations.addMessage(jid, 'user', text);

  if (pushName && !conversations.getClientName(jid)) {
    conversations.setClientName(jid, pushName);
  }

  // 📒 Guardar SIEMPRE el contacto (número) de quien escribe, para poder recordarle luego.
  // No duplica (busca por teléfono) y actualiza el nombre cuando llega uno real.
  try {
    const contactName = conversations.getClientName(jid) || pushName || ('Contacto ' + phone);
    conversations.checkAndCreatePatient(contactName, phone, jid, '');
  } catch (e) { /* best-effort, nunca rompe el flujo */ }

  // Marcar como "leído"
  try {
    await sock.readMessages([msg.key]);
  } catch (e) { /* ignorar */ }

  // Obtener respuesta de IA
  const history = conversations.getHistory(jid);
  const plan = process.env.PLAN_ACTIVO || 'completo';
  const rawResponse = await getAIResponse(history, plan);

  // Extraer cita si la IA la detectó
  const appointmentData = extractAppointmentData(rawResponse);
  if (appointmentData) {
    const apt = conversations.saveAppointment(jid, appointmentData);
    console.log(`📅 Cita agendada: ${apt.id}`, appointmentData);
    emitToAll('newAppointment', apt);

    // 🔔 Notificar al dueño del negocio
    await notifyOwner(apt, conversations.getClientName(jid) || pushName || phone);
  }

  // Limpiar y enviar
  const cleanResponse = cleanBotResponse(rawResponse);
  conversations.addMessage(jid, 'assistant', cleanResponse);

  // Si el mensaje del usuario fue por nota de voz, respondemos con nota de voz
  if (isVoiceMessage(msg)) {
    await sendVoiceNote(jid, cleanResponse);
  } else {
    await sendMessage(jid, cleanResponse);
  }

  // Dashboard en tiempo real
  const clientName = conversations.getClientName(jid) || pushName || 'Sin nombre';
  emitToAll('newMessage', { jid, phoneNumber: phone, clientName, role: 'user', content: text, timestamp: new Date() });
  emitToAll('newMessage', { jid, phoneNumber: phone, clientName, role: 'assistant', content: cleanResponse, timestamp: new Date() });
  emitToAll('stats', conversations.getStats());
}

// ═══ ENVIAR NOTA DE VOZ (TTS) ═══
async function sendVoiceNote(jid, text) {
  if (!sock || connectionStatus !== 'connected') {
    console.error('❌ WhatsApp no conectado');
    return;
  }

  let audioPath = null;
  try {
    // 1. Simular grabación ("recording...") para realismo
    await sock.presenceSubscribe(jid);
    await delay(300);
    await sock.sendPresenceUpdate('recording', jid);

    // 2. Generar el archivo de audio
    audioPath = await tts.generateSpeech(text);

    if (audioPath && fs.existsSync(audioPath)) {
      // Calcular un delay de grabación proporcional al texto
      const recordingMs = Math.min(Math.max(text.length * 30, 1500), 5000);
      await delay(recordingMs);

      await sock.sendPresenceUpdate('paused', jid);

      // 3. Enviar audio como nota de voz
      await sock.sendMessage(jid, {
        audio: { url: audioPath },
        mimetype: 'audio/mpeg', // Enviar como audio/mpeg ya que el archivo generado es un MP3 real
        ptt: true // ptt: true indica que es un Push-To-Talk (nota de voz azul)
      });

      console.log(`📤 [${jid.replace('@s.whatsapp.net', '')}] Bot respondió con Nota de Voz ✓`);
    } else {
      console.warn('⚠️ Falló la generación de audio, respondiendo por texto como fallback.');
      await sock.sendPresenceUpdate('paused', jid);
      await sendMessage(jid, text);
    }
  } catch (error) {
    console.error('❌ Error enviando nota de voz:', error.message);
    // Fallback por texto
    try {
      await sendMessage(jid, text);
    } catch (e) {}
  } finally {
    // 4. Limpiar el archivo de audio temporal del servidor
    if (audioPath) {
      tts.cleanAudio(audioPath);
    }
  }
}

// ═══ ENVIAR MENSAJE ═══
async function sendMessage(jid, text) {
  if (!sock || connectionStatus !== 'connected') {
    console.error('❌ WhatsApp no conectado');
    return;
  }

  // Limpiar JID para asegurar formato correcto (solo dígitos antes de @s.whatsapp.net)
  let cleanJid = jid;
  if (jid && typeof jid === 'string') {
    const parts = jid.split('@');
    if (parts.length === 2) {
      let cleanPrefix = parts[0].replace(/[^0-9]/g, '');
      if (cleanPrefix.length === 10) {
        cleanPrefix = '1' + cleanPrefix;
      }
      cleanJid = `${cleanPrefix}@${parts[1]}`;
    }
  }

  try {
    // Simular "escribiendo..." para parecer humano
    await sock.presenceSubscribe(cleanJid);
    await delay(300);
    await sock.sendPresenceUpdate('composing', cleanJid);

    // Delay proporcional al texto (más texto = más tiempo "escribiendo")
    const typingMs = Math.min(Math.max(text.length * 20, 800), 3000);
    await delay(typingMs);

    await sock.sendPresenceUpdate('paused', cleanJid);
    await sock.sendMessage(cleanJid, { text });
    console.log(`📤 [${cleanJid.replace('@s.whatsapp.net', '')}] Bot respondió ✓`);
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error.message);
  }
}

// ═══ NOTIFICAR AL DUEÑO ═══
async function notifyOwner(appointment, clientName) {
  const ownerPhone = process.env.OWNER_PHONE;
  if (!ownerPhone || ownerPhone === 'PEGA-EL-NUMERO-DEL-DUEÑO-AQUI') {
    return; // No hay número configurado
  }

  let cleanOwnerPhone = ownerPhone.replace(/[^0-9]/g, '');
  if (cleanOwnerPhone.length === 10) {
    cleanOwnerPhone = '1' + cleanOwnerPhone;
  }
  const ownerJid = `${cleanOwnerPhone}@s.whatsapp.net`;
  const notification = `🔔 *NUEVA CITA AGENDADA*

👤 Cliente: ${appointment.nombre || clientName}
💼 Servicio: ${appointment.servicio || 'No especificado'}
📅 Fecha: ${appointment.fecha || 'No especificada'}
⏰ Hora: ${appointment.hora || 'No especificada'}
📱 Teléfono: ${appointment.jid?.replace('@s.whatsapp.net', '') || ''}

✅ La cita fue confirmada automáticamente por el bot.`;

  try {
    await sock.sendMessage(ownerJid, { text: notification });
    console.log(`🔔 Notificación enviada al dueño (${cleanOwnerPhone})`);
  } catch (error) {
    console.error('❌ Error notificando al dueño:', error.message);
  }
}

// ═══ RECORDATORIOS ═══
async function sendReminders() {
  if (connectionStatus !== 'connected') return;

  // 1. Recordatorios estándar de citas para mañana
  const pending = conversations.getAppointmentsForReminder();
  for (const apt of pending) {
    const msg = `Hola, ${apt.nombre} 👋\nMañana tiene una cita:\n\n📅 ${apt.fecha} a las ⏰ ${apt.hora}\n💼 Servicio: ${apt.servicio}\n\nConfirme su asistencia:\n✅ SÍ — Confirmar\n🔄 CAMBIAR — Reprogramar\n❌ CANCELAR — Cancelar\n\n¡Le esperamos! 😊`;

    try {
      await sendMessage(apt.jid, msg);
      conversations.markReminderSent(apt.id);
      console.log(`🔔 Recordatorio enviado a ${apt.nombre}`);
    } catch (e) {
      console.error(`❌ Error recordatorio ${apt.nombre}:`, e.message);
    }
    // 🛡️ Anti-baneo: espaciar 5–12s entre cada envío (nunca en ráfaga)
    await delay(5000 + Math.floor(Math.random() * 7000));
  }

  // 2. Recordatorios programados de retorno
  try {
    const dueReminders = conversations.getDueScheduledReminders();
    for (const apt of dueReminders) {
      let bizName = 'nuestra clínica';
      try {
        const { loadConfig } = require('./prompts');
        const config = loadConfig();
        if (config && config.negocio && config.negocio.nombre) {
          bizName = config.negocio.nombre;
        }
      } catch (cfgErr) {}

      const r = apt.scheduledReminder;
      const msg = r.customMessage || `Hola, ${apt.nombre} 👋\nLe escribimos de ${bizName} para saludarle y recordarle su consulta de seguimiento. Ha pasado el tiempo establecido (${r.timeframe}) para su: **${r.motive || 'Consulta general'}**.\n\nEscríbanos por aquí para agendar su próxima cita. ¡Le esperamos! 😊`;

      try {
        await sendMessage(apt.jid, msg);
        conversations.markScheduledReminderSent(apt.id);
        console.log(`🔔 Recordatorio programado enviado a ${apt.nombre} (Motivo: ${r.motive})`);
      } catch (e) {
        console.error(`❌ Error en recordatorio programado para ${apt.nombre}:`, e.message);
      }
      // 🛡️ Anti-baneo: espaciar 5–12s entre cada envío
      await delay(5000 + Math.floor(Math.random() * 7000));
    }
  } catch (err) {
    console.error('Error procesando recordatorios programados:', err.message);
  }
}

module.exports = { connectWhatsApp, setSocketIO, getStatus, getQR, getQRAge, forceNewQR, sendReminders, sendMessage };
