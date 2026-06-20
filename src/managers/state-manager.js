const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../state.json');

const DEFAULT_STATE = {
  notifications_sent: [],
  last_check: null,
  errors: []
};

function getState() {
  if (!fs.existsSync(STATE_FILE)) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  const rawData = fs.readFileSync(STATE_FILE, 'utf8');
  return JSON.parse(rawData);
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
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
  saveState(state);
}

function updateLastCheck() {
  const state = getState();
  state.last_check = new Date().toISOString();
  saveState(state);
}

module.exports = {
  getState,
  addNotification,
  addError,
  updateLastCheck
};
