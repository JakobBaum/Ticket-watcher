const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/tickets.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const EMOJI_MAP = {
  START: '✅',
  CHECK: '🔍',
  NOTIFY: '📤',
  ERROR: '❌',
  WARN: '⚠️',
  END: '✅'
};

function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(level, message) {
  const emoji = EMOJI_MAP[level] || '📝';
  const timestamp = formatTimestamp();
  const logLine = `[${timestamp}] ${emoji} ${message}\n`;

  fs.appendFileSync(LOG_FILE, logLine, 'utf8');

  if (process.env.NODE_ENV !== 'production') {
    process.stdout.write(logLine);
  }
}

module.exports = {
  log,
  START: 'START',
  CHECK: 'CHECK',
  NOTIFY: 'NOTIFY',
  ERROR: 'ERROR',
  WARN: 'WARN',
  END: 'END'
};
