// ═══════════════════════════════════════════════
// SERVICIO DE INTEGRACIÓN CON GOOGLE CALENDAR
// Autenticación por Cuenta de Servicio (Service Account)
// ═══════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'google-credentials.json');

/**
 * Verifica si la integración de Google Calendar está configurada y lista
 */
function isConfigured() {
  const isActive = process.env.GOOGLE_CALENDAR_ACTIVE === 'true';
  if (!isActive) return false;

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.warn('⚠️  Google Calendar está ACTIVO en .env, pero falta el archivo "google-credentials.json" en la raíz del proyecto.');
    console.warn('   Descarga la clave JSON de tu Cuenta de Servicio en Google Cloud Console y colócala en la raíz.');
    return false;
  }

  return true;
}

/**
 * Crea un evento en el Google Calendar del cliente
 * @param {Object} appointment - Objeto de cita agendada
 * @returns {Promise<Object|null>} Evento creado o null si falló
 */
async function syncAppointmentToGoogleCalendar(appointment) {
  if (!isConfigured()) return null;

  try {
    console.log(`📅 Iniciando sincronización de cita ${appointment.id} con Google Calendar...`);

    // 1. Inicializar la autenticación
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // 2. Calcular fecha/hora de inicio y fin sin desfases de huso horario
    const timezone = process.env.GOOGLE_TIMEZONE || 'America/Santo_Domingo';
    const durationMinutes = parseInt(process.env.GOOGLE_CALENDAR_DURATION_MINUTES || '60', 10);

    // Formato inicial: YYYY-MM-DDTHH:MM:00
    const startIsoStr = `${appointment.fecha}T${appointment.hora}:00`;
    
    // Calcular el fin parseando de forma segura
    const startDateTime = new Date(startIsoStr);
    if (isNaN(startDateTime.getTime())) {
      throw new Error(`Fecha o hora de cita inválida: ${appointment.fecha} ${appointment.hora}`);
    }
    
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);
    
    const pad = (num) => String(num).padStart(2, '0');
    const endIsoStr = `${endDateTime.getFullYear()}-${pad(endDateTime.getMonth() + 1)}-${pad(endDateTime.getDate())}T${pad(endDateTime.getHours())}:${pad(endDateTime.getMinutes())}:${pad(endDateTime.getSeconds())}`;

    // 3. Estructurar los datos del evento
    const phone = appointment.jid ? appointment.jid.replace('@s.whatsapp.net', '') : 'No disponible';
    const event = {
      summary: `📅 Cita: ${appointment.nombre} - ${appointment.servicio || 'Servicio'}`,
      description: `Agendado automáticamente por el Chatbot de WhatsApp.\n\n👤 Cliente: ${appointment.nombre}\n💼 Servicio: ${appointment.servicio || 'No especificado'}\n📱 Teléfono: ${phone}\n🆔 ID de Cita: ${appointment.id}`,
      start: {
        dateTime: startIsoStr,
        timeZone: timezone
      },
      end: {
        dateTime: endIsoStr,
        timeZone: timezone
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 1440 } // 24 horas antes
        ]
      }
    };

    // 4. Insertar evento
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: event
    });

    console.log(`✅ Cita sincronizada con éxito en Google Calendar! Event ID: ${response.data.id}`);
    return response.data;

  } catch (error) {
    console.error('❌ Error sincronizando cita con Google Calendar:', error.message);
    if (error.errors) {
      console.error('   Detalles:', JSON.stringify(error.errors));
    }
    return null;
  }
}

module.exports = {
  isConfigured,
  syncAppointmentToGoogleCalendar
};
