const conversations = require('../src/conversations');
const path = require('path');
const fs = require('fs');

// Initialize conversations from disk
conversations.init();

const pts = conversations.getPatients();
const pat = pts.find(p => p.id === 'PAT-1780783441800-410'); // Carlos Luis Rivera

if (!pat) {
  console.log('Patient not found!');
  process.exit(1);
}

console.log('PATIENT:', pat.nombre);

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
  const matchName = patWords.length > 0 && patWords.some(w => cName.includes(w)) || 
                    cWords.length > 0 && cWords.some(w => patName.includes(w));
  if (matchName) {
    score += 50;
  }
  
  if (score > 0) {
    const fullConvMsgs = conversations.getConversationMessages(c.jid) || [];
    matchingConvs.push({
      jid: c.jid,
      clientName: c.clientName,
      score: score,
      messages: fullConvMsgs,
      msgCount: fullConvMsgs.length,
      lastActivity: new Date(c.lastActivity || 0)
    });
  }
});

// Sort
matchingConvs.sort((a, b) => {
  const hasMsgsA = a.msgCount > 0 ? 1 : 0;
  const hasMsgsB = b.msgCount > 0 ? 1 : 0;
  if (hasMsgsA !== hasMsgsB) {
    return hasMsgsB - hasMsgsA; // Keep those with messages first
  }
  if (a.score !== b.score) {
    return b.score - a.score; // Higher match score first
  }
  return b.lastActivity - a.lastActivity; // More recent first
});

console.log('MATCHING CONVERSATIONS:');
matchingConvs.forEach(m => {
  console.log(`- JID: ${m.jid} | name: "${m.clientName}" | score: ${m.score} | msgs: ${m.msgCount} | lastActivity: ${m.lastActivity.toISOString()}`);
});

if (matchingConvs.length > 0) {
  console.log('SELECTED JID:', matchingConvs[0].jid, 'with', matchingConvs[0].msgCount, 'messages.');
} else {
  console.log('NO MATCH FOUND');
}
