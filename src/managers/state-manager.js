const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STATE_FILE = path.join(__dirname, '../../state.json');
const MAX_ERRORS = 100;
const MAX_NOTIFICATIONS = 1000;

const DEFAULT_STATE = {
  notifications_sent: [],
  last_check: null,
  errors: []
};

let _state = null;

function loadStateFromDisk() {
  if (!fs.existsSync(STATE_FILE)) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
  try {
    const rawData = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    logger.log(logger.ERROR, `state.json corrupt or unreadable, resetting to default: ${err.message}`);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function getState() {
  if (!_state) {
    _state = loadStateFromDisk();
  }
  return _state;
}

function saveState(state) {
  const tmp = STATE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
    _state = state;
  } catch (err) {
    logger.log(logger.ERROR, `Failed to persist state to ${STATE_FILE}: ${err.message}`);
    throw err;
  }
}

function hasNotification({ artist, city, date, platform }) {
  const state = getState();
  return state.notifications_sent.some(
    n => n.artist === artist && n.city === city && n.date === date && n.platform === platform
  );
}

function addNotification(notification) {
  const state = getState();
  const notifications = [
    ...state.notifications_sent,
    { ...notification, timestamp: new Date().toISOString() }
  ];
  const trimmed = notifications.length > MAX_NOTIFICATIONS
    ? notifications.slice(-MAX_NOTIFICATIONS)
    : notifications;
  saveState({ ...state, notifications_sent: trimmed });
}

function addError(error) {
  const state = getState();
  const newErrors = [
    ...state.errors,
    {
      timestamp: new Date().toISOString(),
      error: error.message || String(error),
      platform: error.platform || 'unknown'
    }
  ];
  const trimmed = newErrors.length > MAX_ERRORS ? newErrors.slice(-MAX_ERRORS) : newErrors;
  saveState({ ...state, errors: trimmed });
}

function updateLastCheck() {
  const state = getState();
  saveState({ ...state, last_check: new Date().toISOString() });
}

module.exports = {
  getState,
  hasNotification,
  addNotification,
  addError,
  updateLastCheck
};
