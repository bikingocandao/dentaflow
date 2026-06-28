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
const supabase = require('./supabase');

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
async function init() {
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
        categoria: 'odontologia',
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
        categoria: 'odontologia',
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
        categoria: 'odontologia',
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
        categoria: 'odontologia',
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
        id: 'TPL-ACNE-01',
        nombre: '✨ Dermatología — Control de Acné Vulgar',
        descripcion: 'Tratamiento completo para acné moderado a severo. Incluye rutina de skin care, dieta baja en azúcares y medicamentos específicos.',
        diagnostico: 'Acné Vulgar / Acné quístico inflamatorio',
        categoria: 'dermatologia',
        medicamentos: [
          { nombre: 'Doxiciclina 100mg', dosis: '1 cápsula', frecuencia: 'Cada 24 horas con el almuerzo', duracion: '30 días', notas: 'No tomar acostado. Evitar exposición solar fuerte' },
          { nombre: 'Gel de Adapaleno 0.1% + Peróxido de Benzilo', dosis: 'Capa delgada', frecuencia: '1 vez al día por las noches', duracion: '90 días', notas: 'Aplicar solo en zonas afectadas después de limpiar la piel' }
        ],
        dieta: [
          { nombre: 'Reducir lácteos y azúcares', alimentos: 'Evitar leche entera, quesos grasos, chocolates y dulces procesados' },
          { nombre: 'Alimentos recomendados', alimentos: 'Vegetales verdes, pescado (rico en Omega 3), té verde, frutos secos y semillas' },
          { nombre: 'Hidratación óptima', alimentos: 'Tomar al menos 2 a 2.5 litros de agua al día' }
        ],
        rutina: [
          { ejercicio: 'Limpieza con dermolimpiador espumoso', series: '2', reps: '1 min', frecuencia: 'Mañana y noche antes de otros productos' },
          { ejercicio: 'Hidratante no comedogénico (toque seco)', series: '2', reps: '—', frecuencia: 'Mañana y noche después de limpiar' },
          { ejercicio: 'Protector solar SPF 50+ toque seco', series: '3', reps: '—', frecuencia: 'Cada 4 horas durante el día' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-DERMATITIS-01',
        nombre: '🧴 Dermatología — Dermatitis Atópica / Piel Seca',
        descripcion: 'Protocolo de cuidado intensivo para restaurar la barrera cutánea y calmar la picazón.',
        diagnostico: 'Dermatitis atópica / Xerosis cutánea severa',
        categoria: 'dermatologia',
        medicamentos: [
          { nombre: 'Crema con hidrocortisona 1% (u otro corticoide suave)', dosis: 'Capa muy delgada en brote', frecuencia: 'Cada 12 horas', duracion: '5-7 días', notas: 'Solo aplicar en áreas con enrojecimiento y picazón extrema' },
          { nombre: 'Cetirizina 10mg (antihistamínico)', dosis: '1 tableta', frecuencia: 'Cada 24h por las noches', duracion: '10 días', notas: 'Ayuda a reducir la picazón nocturna' }
        ],
        dieta: [
          { nombre: 'Anti-inflamatoria y Omega 3', alimentos: 'Salmón, linaza, chía, aguacate, frutos rojos' },
          { nombre: 'Evitar alérgenos comunes', alimentos: 'Monitorear si hay brotes con huevo, maní o mariscos' }
        ],
        rutina: [
          { ejercicio: 'Baños cortos con agua templada (no caliente)', series: '1', reps: '5-10 min', frecuencia: 'Diario — secar a toques suaves' },
          { ejercicio: 'Crema emoliente reparadora (Cerave/Mustela)', series: '3', reps: '—', frecuencia: 'Aplicar inmediatamente después del baño y cada 8 horas' },
          { ejercicio: 'Ropa de algodón holgada', series: '—', reps: '—', frecuencia: 'Permanente — evitar tejidos sintéticos o lana' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-ANSIEDAD-01',
        nombre: '🧠 Psicología — Terapia de Control de Ansiedad',
        descripcion: 'Plan terapéutico semanal para control del estrés, ansiedad generalizada y regulación emocional.',
        diagnostico: 'Trastorno de ansiedad generalizada / Estrés agudo',
        categoria: 'psicologia',
        medicamentos: [
          { nombre: 'Suplemento de Ashwagandha 500mg (opcional)', dosis: '1 cápsula', frecuencia: 'Cada 24h con la cena', duracion: '60 días', notas: 'Ayuda a reducir el cortisol de forma natural' },
          { nombre: 'Infusión relajante (Manzanilla/Tila)', dosis: '1 taza caliente', frecuencia: 'Antes de dormir', duracion: 'Permanente', notas: 'Fomentar la higiene de sueño' }
        ],
        dieta: [
          { nombre: 'Cero estimulantes', alimentos: 'Evitar café, té negro, bebidas energizantes, refrescos de cola y alcohol' },
          { nombre: 'Alimentos con triptófano', alimentos: 'Incorporar plátano, avena, nueces, huevo, cacao puro (+70%)' },
          { nombre: 'Evitar ayunos', alimentos: 'Comer a horas regulares para evitar bajas de azúcar que imiten ansiedad' }
        ],
        rutina: [
          { ejercicio: 'Respiración diafragmática (técnica 4-7-8)', series: '3', reps: '5 ciclos', frecuencia: 'Al levantarse, a media tarde o en crisis' },
          { ejercicio: 'Meditación Mindfulness (atención guiada)', series: '1', reps: '10 min', frecuencia: 'Cada mañana al despertar' },
          { ejercicio: 'Ejercicio físico moderado (Caminar / Yoga)', series: '1', reps: '30 min', frecuencia: 'Mínimo 4 veces por semana' }
        ],
        creadoEn: new Date().toISOString()
      },
      {
        id: 'TPL-DEPRESION-01',
        nombre: '🛋️ Psicología — Activación Conductual y Ánimo',
        descripcion: 'Protocolo de reactivación física, social y mental para pacientes con desánimo o depresión leve.',
        diagnostico: 'Episodio depresivo leve / Distimia / Apatía',
        categoria: 'psicologia',
        medicamentos: [
          { nombre: 'Complejo B (B6, B12)', dosis: '1 tableta', frecuencia: 'Cada mañana con el desayuno', duracion: '30 días', notas: 'Soporte al sistema nervioso y producción de energía' }
        ],
        dieta: [
          { nombre: 'Nutrición cerebral', alimentos: 'Frutos secos, pescado, vegetales de hojas verdes, arándanos, semillas de calabaza' },
          { nombre: 'Limitar azúcares rápidos', alimentos: 'Evitar postres y refrescos que causan caídas bruscas de energía' }
        ],
        rutina: [
          { ejercicio: 'Caminata al aire libre bajo el sol', series: '1', reps: '20 min', frecuencia: 'Diario por la mañana (vitamina D y serotonina)' },
          { ejercicio: 'Contacto social programado (llamada/café)', series: '1', reps: '—', frecuencia: 'Mínimo 2 veces por semana con amigos o familia' },
          { ejercicio: 'Diario de gratitud (escribir 3 cosas buenas)', series: '1', reps: '5 min', frecuencia: 'Cada noche antes de dormir' }
        ],
        creadoEn: new Date().toISOString()
      }
    ];
    try {
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
      console.log('✅ Plantillas de ejemplo creadas exitosamente');
      
      // Upload to Supabase in background
      for (const t of templates) {
        supabase.saveTemplate(t).catch(e => console.error('[Supabase] Error seeding template:', e.message));
      }
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

  // Cargar datos desde Supabase si está disponible
  try {
    const conn = await supabase.testConnection();
    if (conn && conn.connected) {
      console.log('🔗 [Supabase] Cargando datos iniciales desde la nube...');
      
      const sbAppts = await supabase.getAllAppointments();
      if (sbAppts !== null) {
        appointments = sbAppts;
        console.log(`   [Supabase] ${appointments.length} citas cargadas.`);
      }

      const sbPatients = await supabase.getAllPatients();
      if (sbPatients !== null) {
        patients = sbPatients;
        console.log(`   [Supabase] ${patients.length} pacientes cargados.`);
      }

      const sbInv = await supabase.getAllInventory();
      if (sbInv !== null) {
        inventory = sbInv;
        console.log(`   [Supabase] ${inventory.length} artículos de inventario cargados.`);
      }

      const sbPayments = await supabase.getAllPayments();
      if (sbPayments !== null) {
        payments = sbPayments;
        console.log(`   [Supabase] ${payments.length} pagos cargados.`);
      }

      const sbTemplates = await supabase.getAllTemplates();
      if (sbTemplates !== null) {
        templates = sbTemplates;
        console.log(`   [Supabase] ${templates.length} plantillas cargadas.`);
      }

      const sbConvs = await supabase.getAllConversations();
      if (sbConvs !== null) {
        for (const c of sbConvs) {
          activeConversations.set(c.jid, {
            messages: c.messages || [],
            clientName: c.clientName || null,
            lastActivity: c.lastActivity || new Date(),
            startedAt: c.startedAt || new Date(),
            messageCount: c.messageCount || 0
          });
        }
        console.log(`   [Supabase] ${sbConvs.length} conversaciones cargadas.`);
      }
    } else {
      console.log('⚠️ [Supabase] Sin conexión a la nube, usando almacenamiento local únicamente. Razón:', (conn && conn.error) || 'No configurado');
    }
  } catch (sbErr) {
    console.error('⚠️ [Supabase] Excepción al inicializar conexión:', sbErr.message);
  }

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
    console.error('Error guardando conversación local:', e.message);
  }

  // Persistir en Supabase
  supabase.saveConversation(jid, conv).catch(err => {
    console.error('[Supabase] Error al guardar conversación:', err.message);
  });
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

  // Persistir en Supabase
  supabase.saveAppointment(appointment).catch(err => {
    console.error('[Supabase] Error al guardar cita:', err.message);
  });

  // 📅 Sincronización en segundo plano con Google Calendar (si está configurado)
  if (calendarService.isConfigured()) {
    calendarService.syncAppointmentToGoogleCalendar(appointment)
      .then(event => {
        if (event && event.id) {
          appointment.googleEventId = event.id;
          // Volver a guardar para incluir el ID del evento de Google
          saveAppointmentsToDisk();
          supabase.saveAppointment(appointment).catch(err => {
            console.error('[Supabase] Error al actualizar cita con Google Event:', err.message);
          });
        }
      })
      .catch(err => {
        console.error('Error en proceso de sincronización con Google Calendar:', err.message);
      });
  }

  // 🔔 Aviso al dueño EN EL MOMENTO (best-effort; nunca rompe el guardado)
  try {
    const owner = (process.env.OWNER_PHONE || '').replace(/\D/g, '');
    if (owner && owner.length >= 8) {
      const wa = require('./whatsapp');
      const msg = [
        '🔔 *NUEVA CITA — Clinic Full*',
        '',
        `👤 ${appointment.nombre || 'Paciente'}`,
        (appointment.telefono || phone) ? `📱 ${appointment.telefono || phone}` : null,
        appointment.fecha ? `📅 ${appointment.fecha}` : null,
        appointment.hora ? `🕐 ${appointment.hora}` : null,
        appointment.servicio ? `🦷 ${appointment.servicio}` : null,
        '',
        '_Aviso automático de Clinic Full_'
      ].filter(Boolean).join('\n');
      wa.sendMessage(owner + '@s.whatsapp.net', msg).catch(() => {});
      console.log(`🔔 [Nueva cita] Aviso enviado al dueño (${owner}).`);
    }
  } catch (e) {
    console.error('🔔 [Nueva cita] No se pudo avisar al dueño:', e.message);
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
    supabase.saveAppointment(apt).catch(err => {
      console.error('[Supabase] Error al actualizar recordatorio de cita:', err.message);
    });
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
    supabase.saveAppointment(apt).catch(err => {
      console.error('[Supabase] Error al actualizar recordatorio programado de cita:', err.message);
    });
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
  
  supabase.saveAppointment(apt).catch(err => {
    console.error('[Supabase] Error updating appointment status:', err.message);
  });
  
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
  
  supabase.saveAppointment(apt).catch(err => {
    console.error('[Supabase] Error adding appointment notes:', err.message);
  });
  
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

  supabase.saveAppointment(apt).catch(err => {
    console.error('[Supabase] Error saving manual appointment:', err.message);
  });

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
  
  supabase.saveInventoryItem(item).catch(err => {
    console.error('[Supabase] Error saving inventory item:', err.message);
  });
  
  return item;
}

function updateInventoryItem(id, data) {
  const idx = inventory.findIndex(i => i.id === id);
  if (idx === -1) return null;
  inventory[idx] = { ...inventory[idx], ...data, updatedAt: new Date().toISOString() };
  try { fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2)); } catch (e) {}
  
  supabase.saveInventoryItem(inventory[idx]).catch(err => {
    console.error('[Supabase] Error updating inventory item:', err.message);
  });
  
  return inventory[idx];
}

function deleteInventoryItem(id) {
  const idx = inventory.findIndex(i => i.id === id);
  if (idx === -1) return false;
  inventory.splice(idx, 1);
  try { fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2)); } catch (e) {}
  
  supabase.deleteInventoryItem(id).catch(err => {
    console.error('[Supabase] Error deleting inventory item:', err.message);
  });
  
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
  
  supabase.savePayment(pay).catch(err => {
    console.error('[Supabase] Error saving payment:', err.message);
  });
  
  return pay;
}

function markPaymentPaid(id) {
  const pay = payments.find(p => p.id === id);
  if (!pay) return null;
  pay.estado = 'pagado';
  pay.paidAt = new Date().toISOString();
  try { fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2)); } catch (e) {}
  
  supabase.savePayment(pay).catch(err => {
    console.error('[Supabase] Error marking payment as paid:', err.message);
  });
  
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
    
    supabase.savePatient(existing).catch(err => {
      console.error('[Supabase] Error saving auto-created patient:', err.message);
    });
  } else {
    let changed = false;
    // Si antes se guardó como "Contacto ..." y ahora llega un nombre real, actualizarlo
    if (nombre && !String(nombre).startsWith('Contacto ') && (!existing.nombre || String(existing.nombre).startsWith('Contacto '))) {
      existing.nombre = nombre;
      changed = true;
    }
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
      
      supabase.savePatient(existing).catch(err => {
        console.error('[Supabase] Error updating auto-created patient:', err.message);
      });
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
  
  supabase.savePatient(newPat).catch(err => {
    console.error('[Supabase] Error saving manual patient:', err.message);
  });
  
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
  
  supabase.savePatient(patients[idx]).catch(err => {
    console.error('[Supabase] Error updating patient:', err.message);
  });
  
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
    categoria: data.categoria || data.category || 'general',
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
  
  supabase.saveTemplate(newTemplate).catch(err => {
    console.error('[Supabase] Error saving template:', err.message);
  });
  
  return newTemplate;
}

function deleteTemplate(id) {
  templates = templates.filter(t => t.id !== id);
  try {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
    
    supabase.deleteTemplate(id).catch(err => {
      console.error('[Supabase] Error deleting template:', err.message);
    });
    
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
