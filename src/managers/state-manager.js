const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../state.json');
const MAX_ERRORS = 100;

const DEFAULT_STATE = {
  notifications_sent: [],
  last_check: null,
  errors: []
};

function getState() {
  if (!fs.existsSync(STATE_FILE)) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  try {
    const rawData = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(rawData);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(state) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function hasNotification({ artist, city, date, platform }) {
  const state = getState();
  return state.notifications_sent.some(
    n => n.artist === artist && n.city === city && n.date === date && n.platform === platform
  );
}

function addNotification(notification) {
  const state = getState();
  state.notifications_sent.push({
    ...notification,
    timestamp: new Date().toISOString()
  });
  saveState(state);
}

function addError(error) {
  const state = getState();
  state.errors.push({
    timestamp: new Date().toISOString(),
    error: error.message || String(error),
    platform: error.platform || 'unknown'
  });
  if (state.errors.length > MAX_ERRORS) {
    state.errors = state.errors.slice(-MAX_ERRORS);
  }
  saveState(state);
}

function updateLastCheck() {
  const state = getState();
  state.last_check = new Date().toISOString();
  saveState(state);
}

module.exports = {
  getState,
  hasNotification,
  addNotification,
  addError,
  updateLastCheck
};
