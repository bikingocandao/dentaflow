const fs = require('fs');
const vm = require('vm');

const jsCode = fs.readFileSync('../chatbotIA-barberia-los-reyes/public/app.js', 'utf8');

// Build a lightweight browser mock
const makeElement = (id = '') => {
  const el = {
    id,
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false
  };
  return el;
};

const mockWindow = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  location: {
    origin: 'http://localhost:3001',
    pathname: '/',
    search: '',
    href: 'http://localhost:3001/'
  },
  navigator: {
    userAgent: 'node'
  },
  document: {
    getElementById: (id) => makeElement(id),
    querySelector: (sel) => makeElement(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => makeElement(),
    body: makeElement('body')
  },
  fetch: () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, qr: '', status: 'connected', list: [] })
  }),
  io: () => ({
    on: () => {},
    emit: () => {},
    disconnect: () => {}
  })
};

mockWindow.window = mockWindow;
mockWindow.document.window = mockWindow;

const context = vm.createContext(mockWindow);
try {
  vm.runInContext(jsCode, context, { filename: 'public/app.js' });
  console.log('✅ Other bot app.js executed successfully without errors!');
} catch (e) {
  console.error('❌ Other bot app.js threw runtime error:');
  console.error(e.stack || e.message);
}
