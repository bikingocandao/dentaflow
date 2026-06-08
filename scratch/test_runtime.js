const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('public/index.html', 'utf8');

// Find the main script tag
const startMarker = '<script src="/socket.io/socket.io.js"></script>\n<script>';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) {
  console.error('Could not find start marker!');
  process.exit(1);
}

const scriptContentStart = startIdx + startMarker.length;
const endIdx = html.indexOf('</script>', scriptContentStart);
if (endIdx === -1) {
  console.error('Could not find end marker!');
  process.exit(1);
}

const jsCode = html.substring(scriptContentStart, endIdx);

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
    getContext: () => ({
      measureText: () => ({ width: 10 }),
      fillText: () => {},
      strokeText: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      clearRect: () => {},
    }),
    innerHTML: '',
    textContent: '',
    value: '',
    href: '',
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
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    href: 'http://localhost:3000/'
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
  }),
  ExcelJS: {
    Workbook: class {
      addWorksheet() {
        return {
          views: [],
          addRow: () => ({
            height: 0,
            eachCell: () => {}
          }),
          mergeCells: () => {},
          getCell: () => ({
            font: {}, fill: {}, alignment: {}, border: {}
          })
        };
      }
    }
  },
  // We need to capture the functions/vars declared in the script
  // so we bind the global variables to mockWindow
};

mockWindow.window = mockWindow;
mockWindow.document.window = mockWindow;

// Run script in vm context
const context = vm.createContext(mockWindow);
try {
  vm.runInContext(jsCode, context, { filename: 'public/index.html' });
  console.log('✅ Script executed successfully without errors in mock context!');
} catch (e) {
  console.error('❌ Script threw runtime error:');
  console.error(e.stack || e.message);
}
