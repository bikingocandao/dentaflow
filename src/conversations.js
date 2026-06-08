// ═══════════════════════════════════════════════
// GESTIÓN DE CONVERSACIONES E HISTORIAL
// Persistencia en disco — nada se pierde al reiniciar
// ═══════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
const PATIENTS_FILE = path.join(DATA_DIR, 'patients.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const calendarService = require('./calendar');

// Inventario y pagos en memoria
let inventory = [];
let payments = [];
let templates = [];


// Almacén en memoria para conversaciones activas
const activeConversations = new Map();

// Almacén de citas
let appointments = [];

// Almacén de pacientes
let patients = [];

// Estadísticas persistentes
let stats = {
  totalMessages: 0,
  totalConversations: 0,
  appointmentsBooked: 0,
  transfersToHuman: 0,
  startTime: new Date()
};

// ═══ INICIALIZACIÓN ═══
function init() {
  // Crear directorios si no existen
  if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  }

  // Cargar citas existentes
  if (fs.existsSync(APPOINTMENTS_FILE)) {
    try {
      appointments = JSON.parse(fs.readFileSync(APPOINTMENTS_FILE, 'utf-8'));
    } catch (e) {
      appointments = [];
    }
  }

  // Cargar inventario
  if (fs.existsSync(INVENTORY_FILE)) {
    try {
      inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf-8'));
    } catch (e) {
      inventory = [];
    }
  }

  // Cargar pagos
  if (fs.existsSync(PAYMENTS_FILE)) {
    try {
      payments = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8'));
    } catch (e) {
      payments = [];
    }
  }

  // Cargar estadísticas persistentes
  if (fs.existsSync(STATS_FILE)) {
    try {
      const savedStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
      stats.totalMessages = savedStats.totalMessages || 0;
      stats.totalConversations = savedStats.totalConversations || 0;
      stats.appointmentsBooked = savedStats.appointmentsBooked || 0;
      stats.transfersToHuman = savedStats.transfersToHuman || 0;
    } catch (e) { /* usar defaults */ }
  }

  // Cargar pacientes
  if (fs.existsSync(PATIENTS_FILE)) {
    try {
      patients = JSON.parse(fs.readFileSync(PATIENTS_FILE, 'utf-8'));
    } catch (e) {
      patients = [];
    }
  } else {
    patients = [];
  }

  // Cargar plantillas
  if (fs.existsSync(TEMPLATES_FILE)) {
    try {
      templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'));
    } catch (e) {
      templates = [];
    }
  } else {
    templates = [];
  }

  // Sembrar plantillas de ejemplo si no existen
  if (templates.length === 0) {
    templates = [
      {
        id: 'TPL-ORTODONCIA-01',
        nombre: '🦷 Ortodoncia — Primer Mes',
        descripcion: 'Plan inicial para pacientes que inician tratamiento de ortodoncia. Incluye analgésicos, higiene oral y dieta blanda.',
        diagnostico: 'Maloclusión dental / Inicio de ortodoncia',
        medicamentos: [
          { nombre: 'Ibuprofeno 400mg', dosis: '1 tableta', frecuencia: 'Cada 8h si hay dolor', duracion: '3 días', notas: 'Tomar con alimentos' },
          { nombre: 'Enjuague bucal con flúor', dosis: '15ml', frecuencia: '2 veces al día', duracion: 'Permanente', notas: 'No enjuagar con agua después' }
        ],
        dieta: [
          { nombre: 'Dieta blanda', alimentos: 'Yogur, puré de papa, sopas, frutas suaves, huevo' },
          { nombre: 'Evitar', alimentos: 'Palomitas, dulces duros, caramelos pegajosos, hielo, pan duro' },
          { nombre: 'Hidratación', alimentos: 'Mínimo 8 vasos de agua al día, sin bebidas carbonatadas' }
        ],
        rutina: [
          { ejercicio: 'Cepillado dental con cepillo ortodóncico', series: '3', reps: '2 min', frecuencia: 'Después de cada comida' },
          { ejercicio: 'Uso de hilo interdental / pasador', series: '1', reps: '5 min', frecuencia: 'Cada noche antes de dormir' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-BLANQUEAMIENTO-01',
        nombre: '✨ Blanqueamiento Dental',
        descripcion: 'Protocolo post-blanqueamiento para reducir sensibilidad y mantener resultados.',
        diagnostico: 'Tratamiento estético de blanqueamiento',
        medicamentos: [
          { nombre: 'Gel desensibilizante (Sensodyne Rapid)', dosis: 'Aplicar en cepillo', frecuencia: '2 veces al día', duracion: '2 semanas', notas: 'Usar durante y después del tratamiento' },
          { nombre: 'Vitamina D3 1000 UI', dosis: '1 cápsula', frecuencia: '1 vez al día', duracion: '30 días', notas: 'Con el desayuno' }
        ],
        dieta: [
          { nombre: 'Dieta blanca (primeras 48h)', alimentos: 'Arroz blanco, pollo hervido, papa, leche, queso blanco, pan blanco' },
          { nombre: 'Evitar', alimentos: 'Café, vino tinto, té, salsas oscuras, frutas muy pigmentadas, tabaco' },
          { nombre: 'Recomendado', alimentos: 'Agua, leche, manzana, pera, coliflor, apio' }
        ],
        rutina: [
          { ejercicio: 'Cepillado suave con pasta para sensibilidad', series: '2', reps: '2 min', frecuencia: 'Mañana y noche' },
          { ejercicio: 'Enjuague con agua tibia + bicarbonato', series: '1', reps: '1 min', frecuencia: 'Cada 12h los primeros 3 días' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-EXTRACCION-01',
        nombre: '🩹 Post-Extracción Dental',
        descripcion: 'Cuidados esenciales después de una extracción simple o muela del juicio.',
        diagnostico: 'Post-extracción dental / Alveolitis preventiva',
        medicamentos: [
          { nombre: 'Amoxicilina 500mg', dosis: '1 cápsula', frecuencia: 'Cada 8 horas', duracion: '7 días', notas: 'Completar todo el ciclo aunque mejore' },
          { nombre: 'Ibuprofeno 600mg', dosis: '1 tableta', frecuencia: 'Cada 6-8h si hay dolor', duracion: '3-5 días', notas: 'Con alimentos, no tomar en ayunas' },
          { nombre: 'Colutorio de clorhexidina 0.12%', dosis: '15ml', frecuencia: '2 veces al día', duracion: '7 días', notas: 'Comenzar 24h después de la extracción, no enjuagar' }
        ],
        dieta: [
          { nombre: 'Líquidos y blandos (primeras 24h)', alimentos: 'Caldos, yogur, helado sin trozos, gelatina, puré' },
          { nombre: 'Semi-blanda (días 2-7)', alimentos: 'Arroz, pasta, huevo, pescado, aguacate, plátano' },
          { nombre: 'Evitar', alimentos: 'Alimentos calientes, bebidas con pajilla/pitillo, alcohol, tabaco, comidas duras y crujientes' }
        ],
        rutina: [
          { ejercicio: 'Aplicar hielo envuelto en tela (primeras 6h)', series: '10 min on', reps: '10 min off', frecuencia: 'Alternar durante las primeras 6 horas' },
          { ejercicio: 'Enjuague suave con agua tibia y sal', series: '1', reps: '30 segundos', frecuencia: 'A partir del día 2, después de cada comida' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-GINGIVITIS-01',
        nombre: '🦠 Gingivitis / Periodontitis Leve',
        descripcion: 'Plan de higiene intensiva para controlar la inflamación gingival.',
        diagnostico: 'Gingivitis crónica / Periodontitis estadio I-II',
        medicamentos: [
          { nombre: 'Colutorio de clorhexidina 0.12%', dosis: '15ml', frecuencia: '2 veces al día', duracion: '14 días', notas: 'No enjuagar con agua. Puede causar tinción temporal' },
          { nombre: 'Metronidazol 500mg', dosis: '1 tableta', frecuencia: 'Cada 8 horas con alimentos', duracion: '7 días', notas: 'No consumir alcohol durante el tratamiento' }
        ],
        dieta: [
          { nombre: 'Anti-inflamatoria', alimentos: 'Pescado azul, nueces, frutas y verduras frescas, jengibre, cúrcuma' },
          { nombre: 'Evitar', alimentos: 'Azúcar refinada, harinas procesadas, alcohol, alimentos muy ácidos' },
          { nombre: 'Vitamina C', alimentos: 'Naranja, kiwi, pimiento rojo, brócoli — para fortalecer las encías' }
        ],
        rutina: [
          { ejercicio: 'Cepillado con técnica Bass (cervical)', series: '3', reps: '3 min', frecuencia: 'Mañana, tarde y noche' },
          { ejercicio: 'Uso de hilo dental', series: '1', reps: '5 min', frecuencia: 'Cada noche' },
          { ejercicio: 'Masaje gingival con el dedo o cepillo suave', series: '1', reps: '2 min', frecuencia: '1 vez al día' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-ENDODONCIA-01',
        nombre: '🔬 Post-Endodoncia (Tratamiento de Canal)',
        descripcion: 'Cuidados después de una endodoncia para control del dolor e infección.',
        diagnostico: 'Necrosis pulpar / Tratamiento de conductos radiculares',
        medicamentos: [
          { nombre: 'Amoxicilina 875mg + Ácido Clavulánico 125mg', dosis: '1 comprimido', frecuencia: 'Cada 12 horas', duracion: '7 días', notas: 'Tomar con agua y alimentos' },
          { nombre: 'Naproxeno 500mg', dosis: '1 tableta', frecuencia: 'Cada 12h si hay dolor', duracion: '5 días', notas: 'Alternativo al ibuprofeno. Con alimentos.' },
          { nombre: 'Paracetamol 500mg', dosis: '1-2 tabletas', frecuencia: 'Cada 6h si persiste el dolor', duracion: '3 días', notas: 'Máximo 4g al día. Combinar con naproxeno.' }
        ],
        dieta: [
          { nombre: 'Blanda los primeros días', alimentos: 'Sopas, puré, yogur, pasta bien cocida, pescado' },
          { nombre: 'No morder con ese lado', alimentos: 'Evitar masticar del lado del diente tratado hasta que tenga la corona definitiva' }
        ],
        rutina: [
          { ejercicio: 'Cepillado con cepillo de cerdas suaves', series: '2', reps: '2 min', frecuencia: 'Mañana y noche, muy suavemente en la zona' },
          { ejercicio: 'Evitar alimentos muy fríos o calientes', series: '—', reps: '—', frecuencia: 'Primeros 7 días' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-DIABETES-DENTAL-01',
        nombre: '💉 Paciente Diabético — Control Oral',
        descripcion: 'Plan dental preventivo para pacientes con diabetes tipo 2.',
        diagnostico: 'Diabetes tipo 2 / Higiene oral preventiva',
        medicamentos: [
          { nombre: 'Colutorios antisépticos sin alcohol', dosis: '15ml', frecuencia: '2 veces al día', duracion: 'Permanente', notas: 'Usar sin alcohol para evitar resequedad bucal' },
          { nombre: 'Xilitol (chicle o pastilla)', dosis: '1 pastilla', frecuencia: 'Después de cada comida', duracion: 'Permanente', notas: 'Reduce Streptococcus mutans, no afecta glucosa' }
        ],
        dieta: [
          { nombre: 'Baja en azúcar', alimentos: 'Verduras, legumbres, proteínas magras, frutos secos sin sal' },
          { nombre: 'Evitar', alimentos: 'Jugos de fruta, dulces, pan blanco, bebidas azucaradas, miel, frutas muy dulces en exceso' },
          { nombre: 'Control glucémico oral', alimentos: 'Mantener glucosa en rango: revisar niveles antes de procedimientos dentales' }
        ],
        rutina: [
          { ejercicio: 'Cepillado completo después de cada comida', series: '3', reps: '2 min', frecuencia: 'Desayuno, almuerzo y cena' },
          { ejercicio: 'Revisión dental profesional', series: '—', reps: '—', frecuencia: 'Cada 3 meses (más frecuente que el paciente promedio)' },
          { ejercicio: 'Inspección en espejo de encías', series: '1', reps: '2 min', frecuencia: 'Semanal — buscar sangrado o hinchazón' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-IMPLANTE-01',
        nombre: '🔩 Post-Implante Dental',
        descripcion: 'Protocolo de cuidado tras la colocación de un implante oseointegrado.',
        diagnostico: 'Post-cirugía implante dental — Fase de oseointegración',
        medicamentos: [
          { nombre: 'Amoxicilina 500mg', dosis: '1 cápsula', frecuencia: 'Cada 8 horas', duracion: '7 días', notas: 'Iniciar el día antes de la cirugía si fue prescrito' },
          { nombre: 'Ibuprofeno 600mg', dosis: '1 tableta', frecuencia: 'Cada 8h las primeras 72h', duracion: '3-5 días', notas: 'Mejor antiinflamatorio para esta cirugía' },
          { nombre: 'Clorhexidina en gel 0.2%', dosis: 'Aplicar en zona con hisopo', frecuencia: '2 veces al día', duracion: '14 días', notas: 'No frotar la zona del implante directamente' }
        ],
        dieta: [
          { nombre: 'Líquida / muy blanda (semana 1)', alimentos: 'Batidos proteicos, sopas, yogur, puré, huevo scrambled' },
          { nombre: 'Semi-blanda (semana 2-4)', alimentos: 'Pescado, pollo tierno, pasta, aguacate, arroz' },
          { nombre: 'Evitar siempre', alimentos: 'Tabaco (principal enemigo del implante), alcohol, alimentos muy calientes o duros en la zona' }
        ],
        rutina: [
          { ejercicio: 'No cepillar la zona del implante (semana 1)', series: '—', reps: '—', frecuencia: 'Usar solo gel de clorhexidina con hisopo' },
          { ejercicio: 'Cepillado delicado de las otras zonas', series: '2', reps: '2 min', frecuencia: 'Mañana y noche' },
          { ejercicio: 'Aplicar frío externamente en mejilla', series: '15 min', reps: 'cada 45 min', frecuencia: 'Las primeras 6 horas post-cirugía' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-NINOS-CARIES-01',
        nombre: '👦 Caries Infantil — Prevención',
        descripcion: 'Plan preventivo para niños con caries temprana o alto riesgo cariogénico.',
        diagnostico: 'Caries de primera infancia / Alto riesgo cariogénico',
        medicamentos: [
          { nombre: 'Flúor barniz 5% (aplicado en consulta)', dosis: 'Aplicación profesional', frecuencia: 'Cada 3 meses', duracion: 'Preventivo anual', notas: 'No comer ni beber 30 min después' },
          { nombre: 'Pasta dental con flúor 1000ppm', dosis: 'Porción del tamaño de un guisante', frecuencia: '2 veces al día', duracion: 'Permanente', notas: 'Para mayores de 3 años. Enseñar a no tragar' }
        ],
        dieta: [
          { nombre: 'Reducir azúcar', alimentos: 'Agua, leche sin azúcar, frutas enteras, verduras, queso' },
          { nombre: 'Evitar', alimentos: 'Jugos en caja/botella, gummy bears, caramelos, bebidas deportivas, galletas dulces entre comidas' },
          { nombre: 'Colaciones saludables', alimentos: 'Manzana, zanahoria, apio, queso, nueces (según edad)' }
        ],
        rutina: [
          { ejercicio: 'Cepillado supervisado por padres', series: '2', reps: '2 min', frecuencia: 'Mañana al levantarse y noche antes de dormir' },
          { ejercicio: 'Hilo dental con sostenedor para niños', series: '1', reps: '2 min', frecuencia: 'Cada noche (padres asisten)' },
          { ejercicio: 'No biberón con líquidos azucarados al dormir', series: '—', reps: '—', frecuencia: 'Nunca — causa caries severa en bebés' }
        ],
        creadoEn: new Date().toISOString()
      }
    ];
    try {
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
      console.log('✅ Plantillas de ejemplo creadas exitosamente');
    } catch (e) {
      console.error('Error guardando plantillas de ejemplo:', e.message);
    }
  }

  // Auto-importar desde citas si está vacío
  if (patients.length === 0 && appointments.length > 0) {
    const seenPhones = new Set();
    appointments.forEach(apt => {
      const phone = apt.telefono || (apt.jid ? apt.jid.split('@')[0] : '');
      const key = phone || apt.nombre;
      if (key && !seenPhones.has(key)) {
        seenPhones.add(key);
        patients.push({
          id: `PAT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          nombre: apt.nombre,
          telefono: phone,
          jid: apt.jid || (phone ? `${phone}@s.whatsapp.net` : null),
          cedula: '',
          direccion: '',
          correo: apt.correo || '',
          historialClinico: apt.notes || '',
          recetas: [],
          laboratorios: [],
          diagnosticos: []
        });
      }
    });
    try {
      fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
    } catch (e) {
      console.error('Error auto-generating patients:', e.message);
    }
  }

  // Cargar conversaciones guardadas en disco
  loadConversationsFromDisk();

  console.log('✅ Sistema de conversaciones inicializado');
  console.log(`   📊 ${stats.totalMessages} mensajes | ${stats.totalConversations} conversaciones | ${appointments.length} citas | ${patients.length} pacientes`);
}

// ═══ PERSISTENCIA EN DISCO ═══

/**
 * Carga todas las conversaciones guardadas en disco al iniciar.
 */
function loadConversationsFromDisk() {
  try {
    const files = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const filePath = path.join(CONVERSATIONS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.jid && data.messages) {
          activeConversations.set(data.jid, {
            messages: data.messages || [],
            clientName: data.clientName || null,
            lastActivity: new Date(data.lastActivity || Date.now()),
            startedAt: new Date(data.startedAt || Date.now()),
            messageCount: data.messageCount || 0
          });
        }
      } catch (e) {
        // Archivo corrupto, ignorar
      }
    }
    console.log(`   💾 ${activeConversations.size} conversaciones cargadas desde disco`);
  } catch (e) {
    // Directorio vacío o error, ignorar
  }
}

/**
 * Guarda una conversación en disco.
 */
function saveConversationToDisk(jid) {
  const conv = activeConversations.get(jid);
  if (!conv) return;

  const safeFileName = jid.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
  const filePath = path.join(CONVERSATIONS_DIR, safeFileName);

  try {
    fs.writeFileSync(filePath, JSON.stringify({
      jid,
      clientName: conv.clientName,
      messages: conv.messages,
      lastActivity: conv.lastActivity,
      startedAt: conv.startedAt,
      messageCount: conv.messageCount
    }, null, 2));
  } catch (e) {
    console.error('Error guardando conversación:', e.message);
  }
}

/**
 * Guarda estadísticas en disco.
 */
function saveStatsToDisk() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.error('Error guardando estadísticas:', e.message);
  }
}

/**
 * Guarda el listado de citas en el archivo JSON persistente.
 */
function saveAppointmentsToDisk() {
  try {
    fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
  } catch (e) {
    console.error('Error guardando citas en disco:', e.message);
  }
}

// ═══ GESTIÓN DE CONVERSACIONES ═══

/**
 * Obtiene el historial de una conversación.
 * @param {string} jid - ID del chat de WhatsApp
 * @returns {Array} Historial de mensajes en formato Anthropic
 */
function getHistory(jid) {
  if (!activeConversations.has(jid)) {
    activeConversations.set(jid, {
      messages: [],
      clientName: null,
      lastActivity: new Date(),
      startedAt: new Date(),
      messageCount: 0
    });
    stats.totalConversations++;
    saveStatsToDisk();
  }
  const conv = activeConversations.get(jid);
  conv.lastActivity = new Date();
  return conv.messages;
}

/**
 * Agrega un mensaje al historial y lo persiste en disco.
 */
function addMessage(jid, role, content) {
  const history = getHistory(jid);
  history.push({ role, content });
  
  const conv = activeConversations.get(jid);
  conv.messageCount++;
  stats.totalMessages++;

  // Limitar historial a 30 mensajes para no exceder tokens
  if (history.length > 30) {
    conv.messages = history.slice(-30);
  }

  // 💾 Persistir en disco después de cada mensaje
  saveConversationToDisk(jid);
  saveStatsToDisk();
}

/**
 * Obtiene el nombre del cliente si fue detectado.
 */
function getClientName(jid) {
  const conv = activeConversations.get(jid);
  return conv ? conv.clientName : null;
}

/**
 * Establece el nombre del cliente.
 */
function setClientName(jid, name) {
  if (!activeConversations.has(jid)) {
    activeConversations.set(jid, {
      messages: [],
      clientName: name,
      lastActivity: new Date(),
      startedAt: new Date(),
      messageCount: 0
    });
  } else {
    const conv = activeConversations.get(jid);
    conv.clientName = name;
  }
  saveConversationToDisk(jid);
}

/**
 * Guarda una cita agendada.
 */
function saveAppointment(jid, appointmentData) {
  const appointment = {
    id: `APT-${Date.now()}`,
    jid,
    ...appointmentData,
    createdAt: new Date().toISOString(),
    status: 'confirmada',
    reminderSent: false
  };
  appointments.push(appointment);
  stats.appointmentsBooked++;

  // Auto-crear paciente
  const phone = jid ? jid.split('@')[0] : (appointmentData.telefono || '');
  checkAndCreatePatient(appointmentData.nombre, phone, jid, appointmentData.correo);

  // Persistir en disco
  saveAppointmentsToDisk();
  saveStatsToDisk();

  // 📅 Sincronización en segundo plano con Google Calendar (si está configurado)
  if (calendarService.isConfigured()) {
    calendarService.syncAppointmentToGoogleCalendar(appointment)
      .then(event => {
        if (event && event.id) {
          appointment.googleEventId = event.id;
          // Volver a guardar para incluir el ID del evento de Google
          saveAppointmentsToDisk();
        }
      })
      .catch(err => {
        console.error('Error en proceso de sincronización con Google Calendar:', err.message);
      });
  }

  return appointment;
}

/**
 * Obtiene citas que necesitan recordatorio (24h antes).
 */
function getAppointmentsForReminder() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return appointments.filter(apt =>
    apt.fecha === tomorrowStr &&
    apt.status === 'confirmada' &&
    !apt.reminderSent
  );
}

/**
 * Marca un recordatorio como enviado.
 */
function markReminderSent(appointmentId) {
  const apt = appointments.find(a => a.id === appointmentId);
  if (apt) {
    apt.reminderSent = true;
    saveAppointmentsToDisk();
  }
}

/**
 * Obtiene recordatorios programados vencidos (fecha sendAt es hoy o en el pasado y no enviados)
 */
function getDueScheduledReminders() {
  const todayStr = new Date().toISOString().split('T')[0];
  return appointments.filter(apt => 
    apt.scheduledReminder && 
    !apt.scheduledReminder.sent && 
    apt.scheduledReminder.sendAt <= todayStr
  );
}

/**
 * Marca un recordatorio programado como enviado.
 */
function markScheduledReminderSent(appointmentId) {
  const apt = appointments.find(a => a.id === appointmentId);
  if (apt && apt.scheduledReminder) {
    apt.scheduledReminder.sent = true;
    apt.scheduledReminder.sentAt = new Date().toISOString();
    saveAppointmentsToDisk();
  }
}

/**
 * Obtiene todas las conversaciones activas para el dashboard.
 */
function getAllConversations() {
  const result = [];
  for (const [jid, conv] of activeConversations) {
    const phoneNumber = jid.replace('@s.whatsapp.net', '');
    result.push({
      jid,
      phoneNumber,
      clientName: conv.clientName || 'Sin nombre',
      messageCount: conv.messageCount,
      lastActivity: conv.lastActivity,
      startedAt: conv.startedAt,
      lastMessage: conv.messages.length > 0
        ? conv.messages[conv.messages.length - 1].content.substring(0, 80)
        : ''
    });
  }
  return result.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
}

/**
 * Obtiene los mensajes de una conversación específica.
 */
function getConversationMessages(jid) {
  const conv = activeConversations.get(jid);
  if (!conv) return [];
  return conv.messages;
}

/**
 * Obtiene estadísticas globales.
 */
function getStats() {
  return {
    ...stats,
    activeConversations: activeConversations.size,
    totalAppointments: appointments.length,
    uptime: Math.floor((new Date() - stats.startTime) / 1000)
  };
}

/**
 * Obtiene todas las citas.
 */
function getAppointments() {
  return appointments;
}

/**
 * Actualiza el estado de una cita (confirmada, asistida, cancelada).
 */
function updateAppointmentStatus(id, status) {
  const apt = appointments.find(a => a.id === id);
  if (!apt) return null;
  apt.status = status;
  apt.updatedAt = new Date().toISOString();
  saveAppointmentsToDisk();
  return apt;
}

/**
 * Agrega notas clínicas a una cita.
 */
function addAppointmentNotes(id, notes) {
  const apt = appointments.find(a => a.id === id);
  if (!apt) return null;
  apt.notes = notes;
  apt.notesUpdatedAt = new Date().toISOString();
  saveAppointmentsToDisk();
  return apt;
}

/**
 * Crea una cita manualmente desde el dashboard.
 */
function addManualAppointment(data) {
  let cleanPhone = data.telefono ? data.telefono.replace(/[^0-9]/g, '') : '';
  if (cleanPhone.length === 10) {
    cleanPhone = '1' + cleanPhone;
  }
  const apt = {
    id: `APT-${Date.now()}`,
    jid: cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null,
    nombre: data.nombre,
    servicio: data.servicio || '',
    fecha: data.fecha || '',
    hora: data.hora || '',
    telefono: cleanPhone,
    correo: data.correo || '',
    createdAt: new Date().toISOString(),
    status: 'confirmada',
    source: 'manual',
    reminderSent: false
  };
  appointments.push(apt);
  stats.appointmentsBooked++;

  // Auto-crear paciente
  checkAndCreatePatient(data.nombre, cleanPhone, apt.jid, data.correo);

  saveAppointmentsToDisk();
  saveStatsToDisk();
  return apt;
}

// ═══════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════

function getInventory() { return inventory; }

function addInventoryItem(data) {
  const item = { id: `INV-${Date.now()}`, ...data, createdAt: new Date().toISOString() };
  inventory.push(item);
  try { fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2)); } catch (e) {}
  return item;
}

function updateInventoryItem(id, data) {
  const idx = inventory.findIndex(i => i.id === id);
  if (idx === -1) return null;
  inventory[idx] = { ...inventory[idx], ...data, updatedAt: new Date().toISOString() };
  try { fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2)); } catch (e) {}
  return inventory[idx];
}

function deleteInventoryItem(id) {
  const idx = inventory.findIndex(i => i.id === id);
  if (idx === -1) return false;
  inventory.splice(idx, 1);
  try { fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2)); } catch (e) {}
  return true;
}

// ═══════════════════════════════════════════════
// PAGOS
// ═══════════════════════════════════════════════

function getPayments() { return payments; }

function addPayment(data) {
  const pay = { id: `PAY-${Date.now()}`, ...data, createdAt: new Date().toISOString() };
  payments.push(pay);
  try { fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2)); } catch (e) {}
  return pay;
}

function markPaymentPaid(id) {
  const pay = payments.find(p => p.id === id);
  if (!pay) return null;
  pay.estado = 'pagado';
  pay.paidAt = new Date().toISOString();
  try { fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2)); } catch (e) {}
  return pay;
}

// ═══════════════════════════════════════════════
// PACIENTES Y EXPEDIENTE CLÍNICO
// ═══════════════════════════════════════════════

function getPatients() {
  return patients;
}

function checkAndCreatePatient(nombre, telefono, jid, correo) {
  if (!nombre) return null;
  const phone = telefono ? String(telefono).replace(/[^0-9]/g, '') : '';
  
  let existing = patients.find(p => (phone && p.telefono === phone) || p.nombre === nombre);
  if (!existing) {
    existing = {
      id: `PAT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      nombre: nombre,
      telefono: phone,
      jid: jid || (phone ? `${phone}@s.whatsapp.net` : null),
      cedula: '',
      direccion: '',
      correo: correo || '',
      historialClinico: '',
      recetas: [],
      laboratorios: [],
      diagnosticos: [],
      prescripcionActiva: null,
      cumplimiento: {}
    };
    patients.push(existing);
    try {
      fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
    } catch (e) {
      console.error('Error guardando nuevo paciente:', e.message);
    }
  } else {
    let changed = false;
    if (correo && !existing.correo) {
      existing.correo = correo;
      changed = true;
    }
    if (jid && !existing.jid) {
      existing.jid = jid;
      changed = true;
    }
    if (phone && !existing.telefono) {
      existing.telefono = phone;
      changed = true;
    }
    if (changed) {
      try {
        fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
      } catch (e) {}
    }
  }
  return existing;
}

function addPatient(data) {
  const phone = data.telefono ? String(data.telefono).replace(/[^0-9]/g, '') : '';
  const newPat = {
    id: `PAT-${Date.now()}`,
    nombre: data.nombre,
    telefono: phone,
    jid: phone ? `${phone}@s.whatsapp.net` : null,
    cedula: data.cedula || '',
    direccion: data.direccion || '',
    correo: data.correo || '',
    historialClinico: data.historialClinico || '',
    recetas: data.recetas || [],
    laboratorios: data.laboratorios || [],
    diagnosticos: data.diagnosticos || [],
    prescripcionActiva: data.prescripcionActiva || null,
    cumplimiento: data.cumplimiento || {}
  };
  patients.push(newPat);
  try {
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
  } catch (e) {
    console.error('Error guardando paciente manual:', e.message);
  }
  return newPat;
}

function updatePatient(id, data) {
  const idx = patients.findIndex(p => p.id === id);
  if (idx === -1) return null;
  
  patients[idx] = {
    ...patients[idx],
    ...data,
    recetas: data.recetas || patients[idx].recetas || [],
    laboratorios: data.laboratorios || patients[idx].laboratorios || [],
    diagnosticos: data.diagnosticos || patients[idx].diagnosticos || [],
    prescripcionActiva: data.prescripcionActiva !== undefined ? data.prescripcionActiva : (patients[idx].prescripcionActiva || null),
    cumplimiento: data.cumplimiento !== undefined ? data.cumplimiento : (patients[idx].cumplimiento || {})
  };
  
  try {
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
  } catch (e) {
    console.error('Error actualizando paciente:', e.message);
  }
  return patients[idx];
}

function getTemplates() {
  return templates;
}

function saveTemplate(data) {
  const newTemplate = {
    id: data.id || `TMP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    nombre: data.nombre || 'Plantilla Sin Nombre',
    descripcion: data.descripcion || '',
    diagnostico: data.diagnostico || '',
    medicamentos: data.medicamentos || [],
    dieta: data.dieta || [],
    rutina: data.rutina || [],
    creadoEn: new Date().toISOString()
  };
  
  const idx = templates.findIndex(t => t.id === newTemplate.id);
  if (idx !== -1) {
    templates[idx] = newTemplate;
  } else {
    templates.push(newTemplate);
  }
  
  try {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
  } catch (e) {
    console.error('Error guardando plantilla:', e.message);
  }
  return newTemplate;
}

function deleteTemplate(id) {
  templates = templates.filter(t => t.id !== id);
  try {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
    return true;
  } catch (e) {
    console.error('Error eliminando plantilla:', e.message);
    return false;
  }
}

module.exports = {
  init,
  getHistory,
  addMessage,
  getClientName,
  setClientName,
  saveAppointment,
  getAppointmentsForReminder,
  markReminderSent,
  getAllConversations,
  getConversationMessages,
  getStats,
  getAppointments,
  updateAppointmentStatus,
  addAppointmentNotes,
  addManualAppointment,
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getPayments,
  addPayment,
  markPaymentPaid,
  saveAppointmentsToDisk,
  getDueScheduledReminders,
  markScheduledReminderSent,
  getPatients,
  checkAndCreatePatient,
  addPatient,
  updatePatient,
  getTemplates,
  saveTemplate,
  deleteTemplate
};
