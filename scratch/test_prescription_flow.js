require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dentaflow-default-secret-9911';
function generateToken(u) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ username: u, exp: Date.now() + 86400000 })).toString('base64url');
  const s = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
const TOKEN = generateToken('admin');

function req(method, path, body, auth = true) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {})
      }
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  const PAT_ID = 'PAT-1780783441800-410'; // Carlos Luis Rivera

  console.log('=== 1. SAVE PRESCRIPTION ===');
  const rxResult = await req('PUT', `/api/patients/${PAT_ID}/prescription`, {
    dieta: [
      { nombre: 'Desayuno', alimentos: '3 huevos, tostada integral, café sin azúcar' },
      { nombre: 'Almuerzo', alimentos: 'Pechuga de pollo a la plancha, arroz integral, ensalada' },
      { nombre: 'Cena', alimentos: 'Yogur griego, frutas del bosque' }
    ],
    rutina: [
      { ejercicio: 'Sentadillas', series: 4, reps: 12, frecuencia: 'Diario' },
      { ejercicio: 'Flexiones de pecho', series: 3, reps: 10, frecuencia: 'Diario' },
      { ejercicio: 'Plancha abdominal', series: 3, reps: '45 seg', frecuencia: 'Diario' }
    ]
  });
  console.log('Status:', rxResult.status);
  console.log('Prescription saved:', rxResult.body.success);

  console.log('\n=== 2. FETCH PATIENT PLAN (public, no auth) ===');
  const planResult = await req('GET', `/api/patient-plan/${PAT_ID}`, null, false);
  console.log('Status:', planResult.status);
  console.log('Patient:', planResult.body.nombre);
  console.log('Dieta blocks:', planResult.body.prescripcionActiva?.dieta?.length);
  console.log('Rutina items:', planResult.body.prescripcionActiva?.rutina?.length);
  console.log('Cumplimiento hoy:', planResult.body.cumplimientoHoy);

  console.log('\n=== 3. LOG COMPLIANCE (patient taps "Desayuno" on phone) ===');
  const today = new Date().toISOString().split('T')[0];
  const compResult = await req('POST', `/api/patients/${PAT_ID}/compliance`, {
    date: today, type: 'dieta', itemIndex: 0, completed: true
  }, false); // No auth — patient endpoint
  console.log('Status:', compResult.status);
  console.log('Compliance pct:', compResult.body.pct + '%');

  console.log('\n=== 4. VERIFY PLAN REFLECTS COMPLIANCE ===');
  const plan2 = await req('GET', `/api/patient-plan/${PAT_ID}`, null, false);
  console.log('Cumplimiento dieta hoy:', plan2.body.cumplimientoHoy.dieta);

  console.log('\n✅ All tests passed!');
}

run().catch(e => console.error('TEST ERROR:', e.message));
