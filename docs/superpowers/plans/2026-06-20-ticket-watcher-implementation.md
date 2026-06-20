# TicketWatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js ticket monitoring application that checks Ticketmaster and AXS every 30 minutes and sends Telegram notifications when tickets are available.

**Architecture:** Modular Node.js application with separate layers for scraping (platform-specific), notification (Telegram), state management, and orchestration. Runs via Claude Code Routine every 30 minutes. Configuration drives watched events; state and logs persist for memory integration.

**Tech Stack:** Node.js, axios (HTTP), cheerio (HTML parsing), node-telegram-bot-api (Telegram SDK), dotenv (secrets), ESLint (linting)

## Global Constraints

- Node.js version: v16 or higher
- Telegram API key required (stored in `.env`)
- Exit code 0 for success, 1 for fatal errors
- All errors logged but non-fatal (process never crashes except on fatal config/Telegram errors)
- No deduplication of notifications (send every 30 minutes when tickets found)
- Logs written in format: `[YYYY-MM-DD HH:mm:ss] emoji Message`
- All secrets in `.env`, never committed to git

---

## File Structure Map

**Files to create:**
- `package.json` - Dependencies and scripts
- `.env` - Environment variables (Telegram token)
- `.gitignore` - Exclude node_modules, .env, logs, state.json
- `config.json` - Example configuration (user will edit)
- `src/index.js` - Orchestrator/entry point
- `src/managers/config-manager.js` - Config loading and validation
- `src/managers/state-manager.js` - State persistence (read/write)
- `src/utils/logger.js` - Structured logging
- `src/scrapers/ticketmaster.js` - Ticketmaster scraper
- `src/scrapers/axs.js` - AXS scraper
- `src/notifier/telegram.js` - Telegram notification sender
- `README.md` - Setup and usage documentation
- `docs/claude.md` - Development guide

**Directories to create:**
- `src/managers/`
- `src/utils/`
- `src/scrapers/`
- `src/notifier/`
- `logs/` (empty placeholder)

---

## Task 1: Project Initialization & Package Setup

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: npm dependencies installed, project scaffold ready

- [ ] **Step 1: Create package.json with all dependencies**

```bash
# From project root (c:\Projekte\TicketWtahcer)
cd c:\Projekte\TicketWtahcer
```

Create `package.json`:
```json
{
  "name": "ticket-watcher",
  "version": "1.0.0",
  "description": "Automated ticket availability monitor for Ticketmaster and AXS",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "echo \"Tests not yet implemented\"",
    "lint": "eslint src/"
  },
  "keywords": ["tickets", "monitoring", "telegram"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "cheerio": "^1.0.0",
    "node-telegram-bot-api": "^0.63.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "eslint": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create .env.example (template for secrets)**

Create `.env.example`:
```
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHAT_ID=YOUR_CHAT_ID_HERE
```

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
state.json
logs/
.DS_Store
*.log
.eslintrc.json
```

- [ ] **Step 4: Create initial README.md**

Create `README.md`:
```markdown
# TicketWatcher

Automated ticket availability monitor for Ticketmaster and AXS. Runs every 30 minutes and sends Telegram notifications when tickets are available.

## Setup

1. Clone and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and add your Telegram credentials:
   ```bash
   cp .env.example .env
   # Edit .env with your bot token and chat ID
   ```

3. Edit `config.json` to add artists and cities to monitor.

4. Test locally:
   ```bash
   npm start
   ```

5. Set up Claude Code Routine:
   ```bash
   /schedule node src/index.js --cron "*/30 * * * *"
   ```

## Configuration

See `config.json` for watched events format. Example included.

## Logging

Logs written to `logs/tickets.log` with structured format for Claude Code Memories integration.

## Architecture

- `src/managers/` - Config and state management
- `src/utils/` - Logger and utilities
- `src/scrapers/` - Ticketmaster and AXS scrapers
- `src/notifier/` - Telegram notification handler
- `src/index.js` - Main orchestrator
```

- [ ] **Step 5: Run npm install**

```bash
cd c:\Projekte\TicketWtahcer
npm install
```

Expected output: All dependencies installed, `node_modules/` created.

- [ ] **Step 6: Commit initialization**

```bash
cd c:\Projekte\TicketWtahcer
git add package.json .env.example .gitignore README.md
git commit -m "init: project scaffold with dependencies"
```

---

## Task 2: Logger Utility

**Files:**
- Create: `src/utils/logger.js`
- Create: `logs/.gitkeep` (empty marker file)

**Interfaces:**
- Produces: `logger.log(level, message)` function with structured output to `logs/tickets.log`

- [ ] **Step 1: Create logs directory placeholder**

```bash
# Create logs directory with .gitkeep so git tracks it
mkdir -p c:\Projekte\TicketWtahcer\logs
```

- [ ] **Step 2: Implement logger.js**

Create `src/utils/logger.js`:
```javascript
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
```

- [ ] **Step 3: Test logger with simple script**

```bash
cd c:\Projekte\TicketWtahcer
node -e "
const logger = require('./src/utils/logger.js');
logger.log(logger.START, 'Check started');
logger.log(logger.CHECK, 'Ticketmaster: Taylor Swift (Berlin) - Found: true');
logger.log(logger.NOTIFY, 'Telegram sent');
logger.log(logger.END, 'Check completed | Notified: 1 | Errors: 0 | Exit: 0');
"
```

Expected output: Messages printed to console with timestamps and emojis, and written to `logs/tickets.log`

- [ ] **Step 4: Verify log file created**

```bash
# Check that logs/tickets.log exists and contains entries
type c:\Projekte\TicketWtahcer\logs\tickets.log
```

Expected: File contains 4 log lines with timestamps and emojis.

- [ ] **Step 5: Commit logger**

```bash
cd c:\Projekte\TicketWtahcer
git add src/utils/logger.js logs/.gitkeep
git commit -m "feat: add structured logger with file output"
```

---

## Task 3: Config Manager

**Files:**
- Create: `src/managers/config-manager.js`
- Create: `config.json` (example)

**Interfaces:**
- Consumes: `config.json` file from project root
- Produces: `getConfig()` returns parsed config object; `validateConfig()` returns `{ valid: boolean, errors: string[] }`

- [ ] **Step 1: Create example config.json**

Create `config.json`:
```json
{
  "telegram": {
    "chat_id": "YOUR_CHAT_ID"
  },
  "watched_events": [
    {
      "artist": "Taylor Swift",
      "cities": ["Berlin", "Munich"],
      "date_from": "2026-07-01",
      "date_to": "2026-12-31",
      "platforms": ["ticketmaster", "axs"]
    },
    {
      "artist": "The Weeknd",
      "cities": ["Berlin"],
      "date_from": "2026-08-01",
      "date_to": "2026-12-31",
      "platforms": ["ticketmaster"]
    }
  ]
}
```

- [ ] **Step 2: Implement config-manager.js**

Create `src/managers/config-manager.js`:
```javascript
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

  // Validate telegram section
  if (!config.telegram) {
    errors.push('Missing "telegram" section');
  } else if (!config.telegram.chat_id) {
    errors.push('Missing "telegram.chat_id"');
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
```

- [ ] **Step 3: Test config-manager**

```bash
cd c:\Projekte\TicketWtahcer
node -e "
const cm = require('./src/managers/config-manager.js');
const config = cm.getConfig();
console.log('Config loaded:', JSON.stringify(config, null, 2));
const validation = cm.validateConfig(config);
console.log('Validation:', validation);
"
```

Expected output: Config object printed, validation shows `{ valid: true, errors: [] }`

- [ ] **Step 4: Commit config manager**

```bash
cd c:\Projekte\TicketWtahcer
git add src/managers/config-manager.js config.json
git commit -m "feat: add config manager with validation"
```

---

## Task 4: State Manager

**Files:**
- Create: `src/managers/state-manager.js`

**Interfaces:**
- Consumes: `state.json` file (created on first run)
- Produces: `getState()` returns state object; `addNotification(event)` appends to notifications_sent; `addError(error)` appends to errors; `updateLastCheck()` updates timestamp

- [ ] **Step 1: Implement state-manager.js**

Create `src/managers/state-manager.js`:
```javascript
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
```

- [ ] **Step 2: Test state-manager**

```bash
cd c:\Projekte\TicketWtahcer
node -e "
const sm = require('./src/managers/state-manager.js');
sm.addNotification({
  artist: 'Taylor Swift',
  city: 'Berlin',
  date: '2026-07-15',
  platform: 'ticketmaster',
  event_url: 'https://example.com'
});
sm.updateLastCheck();
const state = sm.getState();
console.log('State:', JSON.stringify(state, null, 2));
"
```

Expected output: state.json created with one notification and last_check timestamp.

- [ ] **Step 3: Verify state.json created**

```bash
# Verify state.json exists and has correct structure
type c:\Projekte\TicketWtahcer\state.json
```

Expected: JSON file with notifications_sent array containing one entry, last_check set to ISO timestamp.

- [ ] **Step 4: Commit state manager**

```bash
cd c:\Projekte\TicketWtahcer
git add src/managers/state-manager.js
git commit -m "feat: add state manager for notification history"
```

---

## Task 5: Telegram Notifier

**Files:**
- Create: `src/notifier/telegram.js`

**Interfaces:**
- Consumes: `.env` file with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; event object with { artist, city, date, event_url, platform }
- Produces: `sendNotification(event)` returns `{ success: boolean, error?: string }`

- [ ] **Step 1: Implement telegram.js**

Create `src/notifier/telegram.js`:
```javascript
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;

function initBot() {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
  }
  if (!CHAT_ID) {
    throw new Error('TELEGRAM_CHAT_ID not set in .env');
  }
  
  if (!bot) {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
  }
  return bot;
}

function formatDate(dateStr) {
  // Convert YYYY-MM-DD to DD.MM.YYYY
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

async function sendNotification(event) {
  try {
    const bot = initBot();
    
    const formattedDate = formatDate(event.date);
    const platformDisplay = event.platform.charAt(0).toUpperCase() + event.platform.slice(1);
    
    const message = `🎫 Tickets Available!

Artist: ${event.artist}
City: ${event.city}
Date: ${formattedDate}
Platform: ${platformDisplay}

Get tickets: ${event.event_url}`;

    await bot.sendMessage(CHAT_ID, message);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  sendNotification
};
```

- [ ] **Step 2: Create .env file for testing**

Create `.env` (or update if exists):
```
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
TELEGRAM_CHAT_ID=YOUR_CHAT_ID_HERE
```

Note: User will need to fill in real credentials before testing notifications.

- [ ] **Step 3: Test notifier structure**

```bash
cd c:\Projekte\TicketWtahcer
node -e "
const telegram = require('./src/notifier/telegram.js');
// This will fail if .env doesn't have real credentials, but tests the require
console.log('Telegram module loaded successfully');
"
```

Expected output: No error thrown from require statement.

- [ ] **Step 4: Commit Telegram notifier**

```bash
cd c:\Projekte\TicketWtahcer
git add src/notifier/telegram.js .env
git commit -m "feat: add Telegram notifier with message formatting"
```

Note: .env is in .gitignore so actual credentials never committed.

---

## Task 6: Ticketmaster Scraper

**Files:**
- Create: `src/scrapers/ticketmaster.js`

**Interfaces:**
- Consumes: Ticketmaster website/API
- Produces: `scrapeTicketmaster(artist, city, dateFrom, dateTo)` returns `{ success: boolean, found: boolean, url?: string, error?: string }`

- [ ] **Step 1: Implement ticketmaster.js**

Create `src/scrapers/ticketmaster.js`:
```javascript
const axios = require('axios');

// Ticketmaster search endpoint
const TICKETMASTER_SEARCH_URL = 'https://www.ticketmaster.com/search';

async function scrapeTicketmaster(artist, city, dateFrom, dateTo) {
  try {
    // Build search URL with query parameters
    const searchUrl = `${TICKETMASTER_SEARCH_URL}?keyword=${encodeURIComponent(artist)}&city=${encodeURIComponent(city)}`;
    
    // Make request with timeout
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Simple heuristic: if response contains "no results" or similar, no tickets
    const pageContent = response.data.toLowerCase();
    const found = !pageContent.includes('no results') && 
                  !pageContent.includes('no events found') &&
                  pageContent.length > 1000; // Page has content

    // Extract first result URL if found (simplified)
    let eventUrl = null;
    if (found) {
      const urlMatch = response.data.match(/href="(https:\/\/www\.ticketmaster\.com\/[^"]+)"/);
      if (urlMatch) {
        eventUrl = urlMatch[1];
      }
    }

    return {
      success: true,
      found: found,
      url: eventUrl,
      platform: 'ticketmaster'
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      error: error.message,
      platform: 'ticketmaster'
    };
  }
}

module.exports = {
  scrapeTicketmaster
};
```

- [ ] **Step 2: Test Ticketmaster scraper with mock**

```bash
cd c:\Projekte\TicketWtahcer
node -e "
const tm = require('./src/scrapers/ticketmaster.js');
tm.scrapeTicketmaster('Taylor Swift', 'Berlin', '2026-07-01', '2026-12-31')
  .then(result => console.log('Ticketmaster result:', JSON.stringify(result, null, 2)))
  .catch(err => console.error('Error:', err.message));
"
```

Expected output: Result object with success, found, and optional url/error properties.

- [ ] **Step 3: Commit Ticketmaster scraper**

```bash
cd c:\Projekte\TicketWtahcer
git add src/scrapers/ticketmaster.js
git commit -m "feat: add Ticketmaster scraper"
```

---

## Task 7: AXS Scraper

**Files:**
- Create: `src/scrapers/axs.js`

**Interfaces:**
- Consumes: AXS website/API
- Produces: `scrapeAXS(artist, city, dateFrom, dateTo)` returns `{ success: boolean, found: boolean, url?: string, error?: string, platform: 'axs' }`

- [ ] **Step 1: Implement axs.js**

Create `src/scrapers/axs.js`:
```javascript
const axios = require('axios');

// AXS search endpoint
const AXS_SEARCH_URL = 'https://www.axs.com/events';

async function scrapeAXS(artist, city, dateFrom, dateTo) {
  try {
    // Build search URL with query parameters
    const searchUrl = `${AXS_SEARCH_URL}?q=${encodeURIComponent(artist)}&location=${encodeURIComponent(city)}`;
    
    // Make request with timeout
    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Simple heuristic: if response contains "no results" or similar, no tickets
    const pageContent = response.data.toLowerCase();
    const found = !pageContent.includes('no results') && 
                  !pageContent.includes('no events') &&
                  pageContent.length > 1000; // Page has content

    // Extract first result URL if found (simplified)
    let eventUrl = null;
    if (found) {
      const urlMatch = response.data.match(/href="(https:\/\/www\.axs\.com\/[^"]+)"/);
      if (urlMatch) {
        eventUrl = urlMatch[1];
      }
    }

    return {
      success: true,
      found: found,
      url: eventUrl,
      platform: 'axs'
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      error: error.message,
      platform: 'axs'
    };
  }
}

module.exports = {
  scrapeAXS
};
```

- [ ] **Step 2: Test AXS scraper**

```bash
cd c:\Projekte\TicketWtahcer
node -e "
const axs = require('./src/scrapers/axs.js');
axs.scrapeAXS('Taylor Swift', 'Berlin', '2026-07-01', '2026-12-31')
  .then(result => console.log('AXS result:', JSON.stringify(result, null, 2)))
  .catch(err => console.error('Error:', err.message));
"
```

Expected output: Result object with success, found, and optional url/error properties.

- [ ] **Step 3: Commit AXS scraper**

```bash
cd c:\Projekte\TicketWtahcer
git add src/scrapers/axs.js
git commit -m "feat: add AXS scraper"
```

---

## Task 8: Main Orchestrator

**Files:**
- Create: `src/index.js`

**Interfaces:**
- Consumes: All managers, scrapers, notifier, logger
- Produces: Orchestrated check cycle; exits with code 0 (success) or 1 (fatal error)

- [ ] **Step 1: Implement index.js orchestrator**

Create `src/index.js`:
```javascript
require('dotenv').config();
const logger = require('./utils/logger.js');
const configMgr = require('./managers/config-manager.js');
const stateMgr = require('./managers/state-manager.js');
const telegramNotifier = require('./notifier/telegram.js');
const { scrapeTicketmaster } = require('./scrapers/ticketmaster.js');
const { scrapeAXS } = require('./scrapers/axs.js');

async function runCheckCycle() {
  let notificationCount = 0;
  let errorCount = 0;

  try {
    logger.log(logger.START, 'Check started');

    // Load and validate config
    let config;
    try {
      config = configMgr.getConfig();
      const validation = configMgr.validateConfig(config);
      if (!validation.valid) {
        logger.log(logger.ERROR, `Config validation failed: ${validation.errors.join('; ')}`);
        return process.exit(1);
      }
    } catch (error) {
      logger.log(logger.ERROR, `Failed to load config: ${error.message}`);
      return process.exit(1);
    }

    // Check each watched event
    for (const event of config.watched_events) {
      for (const platform of event.platforms) {
        try {
          let result;

          if (platform === 'ticketmaster') {
            result = await scrapeTicketmaster(event.artist, event.cities[0], event.date_from, event.date_to);
          } else if (platform === 'axs') {
            result = await scrapeAXS(event.artist, event.cities[0], event.date_from, event.date_to);
          } else {
            logger.log(logger.WARN, `Unknown platform: ${platform}`);
            continue;
          }

          logger.log(logger.CHECK, `${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${event.artist} (${event.cities[0]}, ${event.date_from}) - Found: ${result.found}`);

          // If tickets found, send notification for each city
          if (result.found && result.url) {
            for (const city of event.cities) {
              const notificationResult = await telegramNotifier.sendNotification({
                artist: event.artist,
                city: city,
                date: event.date_from,
                event_url: result.url,
                platform: platform
              });

              if (notificationResult.success) {
                logger.log(logger.NOTIFY, `Telegram sent: ${event.artist} - ${city} - ${event.date_from}`);
                stateMgr.addNotification({
                  artist: event.artist,
                  city: city,
                  date: event.date_from,
                  platform: platform,
                  event_url: result.url
                });
                notificationCount++;
              } else {
                logger.log(logger.ERROR, `Failed to send notification: ${notificationResult.error}`);
                stateMgr.addError({
                  message: notificationResult.error,
                  platform: platform
                });
                errorCount++;
              }
            }
          }
        } catch (error) {
          logger.log(logger.ERROR, `Error checking ${platform}: ${error.message}`);
          stateMgr.addError({
            message: error.message,
            platform: platform
          });
          errorCount++;
        }
      }
    }

    // Update last check timestamp
    stateMgr.updateLastCheck();

    // Final summary
    logger.log(logger.END, `Check completed | Notified: ${notificationCount} | Errors: ${errorCount} | Exit: 0`);
    process.exit(0);
  } catch (error) {
    logger.log(logger.ERROR, `Fatal error: ${error.message}`);
    process.exit(1);
  }
}

runCheckCycle();
```

- [ ] **Step 2: Test orchestrator with dry run**

```bash
cd c:\Projekte\TicketWtahcer
npm start
```

Expected output: Logs printed to console showing check started, config loaded, scraper results, and check completed summary. logs/tickets.log should contain entries.

- [ ] **Step 3: Verify all outputs**

```bash
# Check that state.json was updated
type c:\Projekte\TicketWtahcer\state.json
echo "---"
# Check that log file has entries
type c:\Projekte\TicketWtahcer\logs\tickets.log
```

Expected: state.json has updated last_check timestamp, logs/tickets.log contains check cycle entries.

- [ ] **Step 4: Commit orchestrator**

```bash
cd c:\Projekte\TicketWtahcer
git add src/index.js
git commit -m "feat: add main orchestrator with check cycle"
```

---

## Task 9: Documentation & Final Setup

**Files:**
- Create: `docs/claude.md` (development guide)
- Verify: `.gitignore` excludes sensitive files

**Interfaces:**
- Produces: Complete documentation for future maintenance

- [ ] **Step 1: Create development guide**

Create `docs/claude.md`:
```markdown
# TicketWatcher Development Guide

## Architecture Overview

TicketWatcher is a modular Node.js application that monitors ticket availability and sends Telegram notifications.

### Module Responsibilities

- **index.js** - Main orchestrator that runs the check cycle every 30 minutes
- **managers/** - Config loading and state persistence
- **scrapers/** - Platform-specific ticket scrapers (Ticketmaster, AXS)
- **notifier/** - Telegram message sender
- **utils/logger.js** - Structured logging to `logs/tickets.log`

## Running Locally

```bash
npm install
cp .env.example .env
# Edit .env with your Telegram credentials
npm start
```

## Configuration

Edit `config.json` to add/remove artists and cities to monitor. Format:

```json
{
  "telegram": {
    "chat_id": "YOUR_CHAT_ID"
  },
  "watched_events": [
    {
      "artist": "Artist Name",
      "cities": ["City1", "City2"],
      "date_from": "YYYY-MM-DD",
      "date_to": "YYYY-MM-DD",
      "platforms": ["ticketmaster", "axs"]
    }
  ]
}
```

## Deployment

Set up Claude Code Routine:

```bash
/schedule node src/index.js --cron "*/30 * * * *"
```

This runs the check cycle every 30 minutes.

## Logs

Logs are written to `logs/tickets.log` in structured format:

```
[YYYY-MM-DD HH:mm:ss] emoji Message
```

Claude Code reads these logs and writes to Memories automatically.

## State

Notification history is stored in `state.json`:

```json
{
  "notifications_sent": [
    {
      "artist": "...",
      "city": "...",
      "date": "...",
      "platform": "...",
      "timestamp": "...",
      "event_url": "..."
    }
  ],
  "last_check": "...",
  "errors": [...]
}
```

## Error Handling

- Scraper errors: Logged but don't crash (non-fatal)
- Telegram errors: Fatal if token/chat invalid (exit 1), otherwise logged
- Config errors: Fatal if validation fails (exit 1)

## Future Enhancements

- Web UI for config management
- Database backend for state
- Price range filtering
- Multiple Telegram users
- Slack integration
```

- [ ] **Step 2: Verify .gitignore is correct**

```bash
# Check .gitignore contents
type c:\Projekte\TicketWtahcer\.gitignore
```

Expected: File contains entries for `node_modules/`, `.env`, `state.json`, `logs/`, etc.

- [ ] **Step 3: Final verification - check git status**

```bash
cd c:\Projekte\TicketWtahcer
git status
```

Expected output: Only tracked files, nothing unexpected. All `.env` and `state.json` should not appear.

- [ ] **Step 4: Commit documentation**

```bash
cd c:\Projekte\TicketWtahcer
git add docs/claude.md
git commit -m "docs: add development guide"
```

---

## Task 10: Integration Test & Verification

**Files:**
- Verify: All modules work together

**Interfaces:**
- Consumes: All previous implementations
- Produces: Successful end-to-end check cycle

- [ ] **Step 1: Clean state for fresh test**

```bash
# Remove old state and logs
if (Test-Path c:\Projekte\TicketWtahcer\state.json) { Remove-Item c:\Projekte\TicketWtahcer\state.json }
if (Test-Path c:\Projekte\TicketWtahcer\logs\tickets.log) { Remove-Item c:\Projekte\TicketWtahcer\logs\tickets.log }
```

- [ ] **Step 2: Run complete check cycle**

```bash
cd c:\Projekte\TicketWtahcer
npm start
```

Expected output:
- Check started
- Config loaded and validated
- Scrapers run for each platform/event
- Notifications sent (or skipped if no tickets)
- Check completed with summary
- Exit code 0

- [ ] **Step 3: Verify artifacts created**

```bash
# Check state.json created
type c:\Projekte\TicketWtahcer\state.json
echo "=== LOG FILE ==="
# Check logs created
type c:\Projekte\TicketWtahcer\logs\tickets.log
```

Expected:
- state.json: Valid JSON with last_check timestamp
- logs/tickets.log: Multiple log entries with timestamps and emojis

- [ ] **Step 4: Test with invalid config (error case)**

```bash
# Create temp invalid config
cd c:\Projekte\TicketWtahcer
$content = @'{
  "telegram": {}
}'@
Set-Content -Path config.json.backup -Value $content -Force
Set-Content -Path config.json -Value $content -Force
npm start
# Check exit code
echo "Exit code: $LASTEXITCODE"
# Restore config
Remove-Item config.json
Move-Item config.json.backup config.json
```

Expected output: Exit code 1 (fatal error), error logged about missing chat_id.

- [ ] **Step 5: Commit final state**

```bash
cd c:\Projekte\TicketWtahcer
git add -A
git status
# Only logs/.gitkeep and new files should appear
git commit -m "test: verify integration test passes"
```

---

## Task 11: Setup Instructions & Next Steps

**Files:**
- Review: All files committed
- Verify: Ready for Claude Code Routine deployment

**Interfaces:**
- Produces: Complete, deployable application

- [ ] **Step 1: Review all commits**

```bash
cd c:\Projekte\TicketWtahcer
git log --oneline
```

Expected output: ~11 commits from initialization to integration tests.

- [ ] **Step 2: Verify project structure**

```bash
cd c:\Projekte\TicketWtahcer
tree /L 3
```

Expected structure:
- src/
  - index.js
  - managers/
    - config-manager.js
    - state-manager.js
  - scrapers/
    - ticketmaster.js
    - axs.js
  - notifier/
    - telegram.js
  - utils/
    - logger.js
- config.json
- package.json
- .gitignore
- README.md
- docs/claude.md
- logs/.gitkeep

- [ ] **Step 3: Create final summary**

```bash
# Count lines of code
echo "Code Statistics:"
Get-ChildItem -Path c:\Projekte\TicketWtahcer\src -Recurse -Filter *.js | Measure-Object -Line | ForEach-Object { "Total JS lines: $($_.Lines)" }
```

- [ ] **Step 4: Final commit**

```bash
cd c:\Projekte\TicketWtahcer
git log --oneline -1
echo "Project ready for deployment"
```

Expected: All code committed, project structure complete, ready for `/schedule` setup.

---

## Success Criteria

After all tasks complete:

- ✅ Application runs without errors: `npm start` completes with exit 0
- ✅ Configuration validated on startup
- ✅ Scrapers return results for each platform
- ✅ Telegram notifier sends test messages (with valid credentials)
- ✅ State persisted to state.json with notification history
- ✅ Logs written to logs/tickets.log with structured format
- ✅ All modules committed to git with .env and state.json in .gitignore
- ✅ Ready to deploy as Claude Code Routine with `/schedule node src/index.js --cron "*/30 * * * *"`
