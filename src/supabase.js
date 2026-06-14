// ═══════════════════════════════════════════════
// SUPABASE CLIENT — DENTAFLOW
// Persistencia en la nube para todos los datos
// ═══════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

function getSupabase() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn('⚠️  [Supabase] Variables de entorno no configuradas. Usando almacenamiento local.');
      return null;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ [Supabase] Cliente inicializado →', SUPABASE_URL);
  }
  return supabase;
}

// ─── TEST DE CONEXIÓN ───
async function testConnection() {
  const sb = getSupabase();
  if (!sb) return { connected: false, error: 'No configurado' };
  try {
    const { error } = await sb.from('appointments').select('id').limit(1);
    if (error) return { connected: false, error: error.message };
    return { connected: true };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

// ─── APPOINTMENTS ───
async function saveAppointment(apt) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('appointments').upsert({
      id: apt.id,
      nombre: apt.nombre,
      telefono: apt.telefono,
      jid: apt.jid,
      fecha: apt.fecha,
      hora: apt.hora,
      servicio: apt.servicio,
      status: apt.status || 'confirmada',
      notas: apt.notas,
      reminder_sent: apt.reminderSent || false,
      scheduled_reminder: apt.scheduledReminder || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) { console.error('[Supabase] saveAppointment error:', error.message); return null; }
    return true; // upsert success (Supabase v2 returns null data without .select())
  } catch (e) {
    console.error('[Supabase] saveAppointment exception:', e.message);
    return null;
  }
}

async function getAllAppointments() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('appointments').select('*').order('fecha', { ascending: false });
    if (error) { console.error('[Supabase] getAllAppointments error:', error.message); return null; }
    return data.map(r => ({
      id: r.id,
      nombre: r.nombre,
      telefono: r.telefono,
      jid: r.jid,
      fecha: r.fecha,
      hora: r.hora,
      servicio: r.servicio,
      status: r.status,
      notas: r.notas,
      reminderSent: r.reminder_sent,
      scheduledReminder: r.scheduled_reminder
    }));
  } catch (e) {
    console.error('[Supabase] getAllAppointments exception:', e.message);
    return null;
  }
}

async function deleteAppointment(id) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('appointments').delete().eq('id', id);
    if (error) console.error('[Supabase] deleteAppointment error:', error.message);
  } catch (e) {
    console.error('[Supabase] deleteAppointment exception:', e.message);
  }
}

// ─── INVENTORY ───
async function saveInventoryItem(item) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('inventory').upsert({
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria,
      stock_actual: item.stockActual,
      stock_minimo: item.stockMinimo,
      unidad: item.unidad,
      precio: item.precio,
      proveedor: item.proveedor,
      notas: item.notas,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) { console.error('[Supabase] saveInventoryItem error:', error.message); return null; }
    return true;
  } catch (e) {
    console.error('[Supabase] saveInventoryItem exception:', e.message);
    return null;
  }
}

async function getAllInventory() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('inventory').select('*').order('nombre');
    if (error) { console.error('[Supabase] getAllInventory error:', error.message); return null; }
    return data.map(r => ({
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria,
      stockActual: r.stock_actual,
      stockMinimo: r.stock_minimo,
      unidad: r.unidad,
      precio: r.precio,
      proveedor: r.proveedor,
      notas: r.notas
    }));
  } catch (e) {
    console.error('[Supabase] getAllInventory exception:', e.message);
    return null;
  }
}

async function deleteInventoryItem(id) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('inventory').delete().eq('id', id);
    if (error) console.error('[Supabase] deleteInventoryItem error:', error.message);
  } catch (e) {
    console.error('[Supabase] deleteInventoryItem exception:', e.message);
  }
}

// ─── PAYMENTS ───
async function savePayment(payment) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('payments').upsert({
      id: payment.id,
      patient_name: payment.nombrePaciente || payment.patientName || '',
      patient_jid: payment.patientJid || null,
      amount: payment.monto || payment.amount || 0,
      concept: payment.servicio || payment.concept || '',
      method: payment.formaPago || payment.method || 'efectivo',
      status: payment.estado || payment.status || 'pagado',
      date: payment.fecha || payment.date || '',
      notes: payment.notes || ''
    }, { onConflict: 'id' });
    if (error) { console.error('[Supabase] savePayment error:', error.message); return null; }
    return true;
  } catch (e) {
    console.error('[Supabase] savePayment exception:', e.message);
    return null;
  }
}

async function getAllPayments() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('payments').select('*').order('date', { ascending: false });
    if (error) { console.error('[Supabase] getAllPayments error:', error.message); return null; }
    return data.map(r => ({
      id: r.id,
      nombrePaciente: r.patient_name,
      patientJid: r.patient_jid,
      monto: r.amount ? Number(r.amount) : 0,
      servicio: r.concept,
      formaPago: r.method,
      estado: r.status,
      fecha: r.date,
      notes: r.notes
    }));
  } catch (e) {
    console.error('[Supabase] getAllPayments exception:', e.message);
    return null;
  }
}

async function deletePayment(id) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('payments').delete().eq('id', id);
    if (error) console.error('[Supabase] deletePayment error:', error.message);
  } catch (e) {
    console.error('[Supabase] deletePayment exception:', e.message);
  }
}

// ─── PATIENTS ───
async function savePatient(patient) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const treatmentPlan = patient.treatmentPlan || {};
    const plan = {
      ...treatmentPlan,
      cedula: patient.cedula !== undefined ? patient.cedula : treatmentPlan.cedula || '',
      historialClinico: patient.historialClinico !== undefined ? patient.historialClinico : treatmentPlan.historialClinico || '',
      recetas: patient.recetas !== undefined ? patient.recetas : treatmentPlan.recetas || [],
      laboratorios: patient.laboratorios !== undefined ? patient.laboratorios : treatmentPlan.laboratorios || [],
      diagnosticos: patient.diagnosticos !== undefined ? patient.diagnosticos : treatmentPlan.diagnosticos || [],
      prescripcionActiva: patient.prescripcionActiva !== undefined ? patient.prescripcionActiva : treatmentPlan.prescripcionActiva || null
    };

    const { error } = await sb.from('patients').upsert({
      id: patient.id,
      nombre: patient.nombre,
      telefono: patient.telefono,
      jid: patient.jid,
      email: patient.correo || patient.email || '',
      fecha_nacimiento: patient.fechaNacimiento || null,
      genero: patient.genero || null,
      direccion: patient.direccion || '',
      alergias: patient.alergias || '',
      condiciones: patient.condiciones || '',
      notas: patient.historialClinico || patient.notas || '',
      treatment_plan: plan,
      compliance: patient.compliance || {},
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) { console.error('[Supabase] savePatient error:', error.message); return null; }
    return true;
  } catch (e) {
    console.error('[Supabase] savePatient exception:', e.message);
    return null;
  }
}

async function getAllPatients() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('patients').select('*').order('nombre');
    if (error) { console.error('[Supabase] getAllPatients error:', error.message); return null; }
    return data.map(r => {
      const plan = r.treatment_plan || {};
      return {
        id: r.id,
        nombre: r.nombre,
        telefono: r.telefono,
        jid: r.jid,
        correo: r.email || '',
        email: r.email || '',
        fechaNacimiento: r.fecha_nacimiento,
        genero: r.genero,
        direccion: r.direccion,
        alergias: r.alergias,
        condiciones: r.condiciones,
        notas: r.notas,
        historialClinico: plan.historialClinico || r.notas || '',
        cedula: plan.cedula || '',
        recetas: plan.recetas || [],
        laboratorios: plan.laboratorios || [],
        diagnosticos: plan.diagnosticos || [],
        prescripcionActiva: plan.prescripcionActiva || null,
        treatmentPlan: plan,
        compliance: r.compliance || {}
      };
    });
  } catch (e) {
    console.error('[Supabase] getAllPatients exception:', e.message);
    return null;
  }
}

async function deletePatient(id) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('patients').delete().eq('id', id);
    if (error) console.error('[Supabase] deletePatient error:', error.message);
  } catch (e) {
    console.error('[Supabase] deletePatient exception:', e.message);
  }
}

// ─── TEMPLATES ───
async function saveTemplate(template) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const contentObj = {
      descripcion: template.descripcion || '',
      diagnostico: template.diagnostico || '',
      medicamentos: template.medicamentos || [],
      dieta: template.dieta || [],
      rutina: template.rutina || [],
      creadoEn: template.creadoEn || new Date().toISOString()
    };
    const { error } = await sb.from('templates').upsert({
      id: template.id,
      name: template.nombre || 'Plantilla Sin Nombre',
      content: JSON.stringify(contentObj),
      category: template.categoria || 'general'
    }, { onConflict: 'id' });
    if (error) { console.error('[Supabase] saveTemplate error:', error.message); return null; }
    return true;
  } catch (e) {
    console.error('[Supabase] saveTemplate exception:', e.message);
    return null;
  }
}

async function getAllTemplates() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('templates').select('*').order('name');
    if (error) { console.error('[Supabase] getAllTemplates error:', error.message); return null; }
    return data.map(r => {
      let contentObj = {};
      try {
        contentObj = JSON.parse(r.content || '{}');
      } catch (e) {
        console.error('[Supabase] Error parsing template content JSON:', e.message);
      }
      return {
        id: r.id,
        nombre: r.name,
        descripcion: contentObj.descripcion || '',
        diagnostico: contentObj.diagnostico || '',
        medicamentos: contentObj.medicamentos || [],
        dieta: contentObj.dieta || [],
        rutina: contentObj.rutina || [],
        creadoEn: contentObj.creadoEn || r.created_at || new Date().toISOString(),
        categoria: r.category
      };
    });
  } catch (e) {
    console.error('[Supabase] getAllTemplates exception:', e.message);
    return null;
  }
}

async function deleteTemplate(id) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('templates').delete().eq('id', id);
    if (error) console.error('[Supabase] deleteTemplate error:', error.message);
  } catch (e) {
    console.error('[Supabase] deleteTemplate exception:', e.message);
  }
}

async function saveConversation(jid, conv) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { error } = await sb.from('conversations').upsert({
      jid: jid,
      client_name: conv.clientName,
      messages: conv.messages || [],
      appointment_data: {
        startedAt: conv.startedAt,
        messageCount: conv.messageCount
      },
      last_activity: conv.lastActivity ? new Date(conv.lastActivity).toISOString() : new Date().toISOString()
    }, { onConflict: 'jid' });
    if (error) { console.error('[Supabase] saveConversation error:', error.message); return null; }
    return true;
  } catch (e) {
    console.error('[Supabase] saveConversation exception:', e.message);
    return null;
  }
}

async function getAllConversations() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('conversations').select('*').order('last_activity', { ascending: false });
    if (error) { console.error('[Supabase] getAllConversations error:', error.message); return null; }
    return data.map(r => ({
      jid: r.jid,
      clientName: r.client_name,
      messages: r.messages || [],
      lastActivity: r.last_activity ? new Date(r.last_activity) : new Date(),
      startedAt: (r.appointment_data && r.appointment_data.startedAt) ? new Date(r.appointment_data.startedAt) : new Date(),
      messageCount: (r.appointment_data && r.appointment_data.messageCount) ? Number(r.appointment_data.messageCount) : (r.messages ? r.messages.length : 0)
    }));
  } catch (e) {
    console.error('[Supabase] getAllConversations exception:', e.message);
    return null;
  }
}

module.exports = {
  getSupabase,
  testConnection,
  // Appointments
  saveAppointment,
  getAllAppointments,
  deleteAppointment,
  // Inventory
  saveInventoryItem,
  getAllInventory,
  deleteInventoryItem,
  // Payments
  savePayment,
  getAllPayments,
  deletePayment,
  // Patients
  savePatient,
  getAllPatients,
  deletePatient,
  // Templates
  saveTemplate,
  getAllTemplates,
  deleteTemplate,
  // Conversations
  saveConversation,
  getAllConversations
};

