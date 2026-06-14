-- ═══════════════════════════════════════════════
-- CLINIC FULL — SUPABASE SCHEMA
-- Ejecuta este SQL en Supabase SQL Editor
-- Dashboard > SQL Editor > New Query
-- ═══════════════════════════════════════════════

-- 1. CITAS / APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  telefono TEXT,
  jid TEXT,
  fecha TEXT,
  hora TEXT,
  servicio TEXT,
  status TEXT DEFAULT 'confirmada',
  notas TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  scheduled_reminder JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CONVERSACIONES / CONVERSATIONS
CREATE TABLE IF NOT EXISTS conversations (
  jid TEXT PRIMARY KEY,
  client_name TEXT,
  messages JSONB DEFAULT '[]',
  appointment_data JSONB DEFAULT '{}',
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INVENTARIO / INVENTORY
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT DEFAULT 'general',
  stock_actual INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 0,
  unidad TEXT DEFAULT 'unidades',
  precio NUMERIC DEFAULT 0,
  proveedor TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PAGOS / PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  patient_name TEXT,
  patient_jid TEXT,
  amount NUMERIC DEFAULT 0,
  concept TEXT,
  method TEXT DEFAULT 'efectivo',
  status TEXT DEFAULT 'pagado',
  date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PACIENTES / PATIENTS
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  telefono TEXT,
  jid TEXT,
  email TEXT,
  fecha_nacimiento TEXT,
  genero TEXT,
  direccion TEXT,
  alergias TEXT,
  condiciones TEXT,
  notas TEXT,
  treatment_plan JSONB DEFAULT '{}',
  compliance JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PLANTILLAS / TEMPLATES
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_fecha ON appointments(fecha);
CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_activity);
CREATE INDEX IF NOT EXISTS idx_patients_jid ON patients(jid);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);

-- Row Level Security (RLS) - permitir acceso al service_role
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para el service_role (backend)
CREATE POLICY "Allow all for service role" ON appointments FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON conversations FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON inventory FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON payments FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON patients FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON templates FOR ALL USING (true);
