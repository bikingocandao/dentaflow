require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dentaflow-default-secret-9911';

function generateToken(username) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const token = generateToken('admin');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/patients/PAT-1780783441800-410/chat',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('MESSAGES COUNT:', parsed.length);
      console.log('FIRST FEW MESSAGES:', parsed.slice(0, 3));
    } catch (e) {
      console.log('RAW DATA:', data);
    }
  });
});

req.on('error', err => {
  console.error('Error fetching chat:', err.message);
});

req.end();
