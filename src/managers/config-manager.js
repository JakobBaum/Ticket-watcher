const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../config.json');

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Config file not found: ${CONFIG_FILE}`);
  }

  const rawData = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(rawData);
}

function validateConfig(config) {
  const errors = [];

  // Telegram credentials must be set via environment variables
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    errors.push('TELEGRAM_BOT_TOKEN not set in environment');
  }
  if (!process.env.TELEGRAM_CHAT_ID) {
    errors.push('TELEGRAM_CHAT_ID not set in environment');
  }

  // Validate watched_events array
  if (!Array.isArray(config.watched_events)) {
    errors.push('"watched_events" must be an array');
  } else {
    config.watched_events.forEach((event, idx) => {
      if (!event.artist) {
        errors.push(`Event ${idx}: missing "artist"`);
      }
      if (!Array.isArray(event.cities) || event.cities.length === 0) {
        errors.push(`Event ${idx}: "cities" must be non-empty array`);
      }
      if (!event.date_from || !isValidDate(event.date_from)) {
        errors.push(`Event ${idx}: invalid "date_from" (must be YYYY-MM-DD)`);
      }
      if (!event.date_to || !isValidDate(event.date_to)) {
        errors.push(`Event ${idx}: invalid "date_to" (must be YYYY-MM-DD)`);
      }
      if (!Array.isArray(event.platforms) || event.platforms.length === 0) {
        errors.push(`Event ${idx}: "platforms" must be non-empty array`);
      }
      event.platforms.forEach(platform => {
        if (!['ticketmaster', 'axs'].includes(platform)) {
          errors.push(`Event ${idx}: invalid platform "${platform}" (must be ticketmaster or axs)`);
        }
      });
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function isValidDate(dateStr) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

module.exports = {
  getConfig,
  validateConfig
};
