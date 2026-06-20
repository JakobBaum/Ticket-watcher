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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function log(level, message) {
  const emoji = EMOJI_MAP[level] || '📝';
  const timestamp = formatTimestamp();
  const logLine = `[${timestamp}] ${emoji} ${message}\n`;

  // Write to file
  fs.appendFileSync(LOG_FILE, logLine, 'utf8');

  // Also log to console for debugging
  console.log(logLine.trim());
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
