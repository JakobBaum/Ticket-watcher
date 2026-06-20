# TicketWatcher Design Specification

**Date:** 2026-06-20  
**Project:** TicketWatcher - Automated Ticket Availability Monitor  
**Scope:** Initial MVP for Ticketmaster & AXS ticket monitoring with Telegram notifications

---

## 1. Overview

**TicketWatcher** is a Node.js application that monitors ticket availability for specified artists on Ticketmaster and AXS platforms. It runs as a Claude Code Routine (every 30 minutes) and sends Telegram notifications when tickets become available.

**Key Features:**
- Monitor multiple artists across multiple cities and date ranges
- Support for Ticketmaster and AXS platforms
- Minimal Telegram notifications (artist, city, date, event link)
- Sends notification every 30 minutes when tickets are available
- Modular architecture for maintainability
- Comprehensive logging for Claude Code Memories

---

## 2. Architecture

### 2.1 High-Level Flow

```
Claude Code Routine (every 30 min)
    ↓
config.json (Watched Events)
    ↓
index.js (Orchestrator)
    ↓
Scraper Layer (Ticketmaster, AXS)
    ↓
Telegram Notifier
    ↓
state.json (Notification History) + logs/ (Audit Trail)
```

### 2.2 Project Structure

```
TicketWatcher/
├── config.json                 # Configuration: watched events
├── state.json                  # State: notification history (gitignore)
├── .env                        # Environment: Telegram token (gitignore)
├── .gitignore
├── package.json
├── README.md
├── src/
│   ├── index.js               # Entry point & orchestrator
│   ├── scrapers/
│   │   ├── ticketmaster.js     # Ticketmaster scraper
│   │   └── axs.js              # AXS scraper
│   ├── notifier/
│   │   └── telegram.js         # Telegram notification sender
│   ├── managers/
│   │   ├── config-manager.js   # Load & validate config.json
│   │   └── state-manager.js    # Read/write state.json
│   └── utils/
│       └── logger.js           # Logging for audit trail
├── logs/
│   └── tickets.log            # Audit log
└── docs/
    └── claude.md              # Development guide
```

### 2.3 Module Responsibilities

| Module | Responsibility |
|--------|---|
| **index.js** | Orchestrates check cycle: load config → run scrapers → send notifications → update state |
| **scrapers/ticketmaster.js** | Query Ticketmaster API/website for tickets; return `{ artist, city, date, url, found: boolean }` |
| **scrapers/axs.js** | Query AXS API/website for tickets; same return format as Ticketmaster |
| **notifier/telegram.js** | Send formatted Telegram message to configured chat |
| **config-manager.js** | Load, validate, and expose `config.json` |
| **state-manager.js** | Read/write `state.json` (append-only audit log of notifications) |
| **logger.js** | Write structured logs to `logs/tickets.log` for Claude Code Memories |

---

## 3. Configuration

### 3.1 config.json Structure

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

**Fields:**
- `artist`: Artist name (used for searching)
- `cities`: List of cities to monitor
- `date_from`, `date_to`: Date range (ISO format)
- `platforms`: Array of `["ticketmaster", "axs"]` or either

---

## 4. State Management

### 4.1 state.json Structure

```json
{
  "notifications_sent": [
    {
      "artist": "Taylor Swift",
      "city": "Berlin",
      "date": "2026-07-15",
      "platform": "ticketmaster",
      "timestamp": "2026-06-20T14:30:00Z",
      "event_url": "https://www.ticketmaster.com/..."
    }
  ],
  "last_check": "2026-06-20T14:30:00Z",
  "errors": [
    {
      "timestamp": "2026-06-20T14:20:00Z",
      "error": "Ticketmaster API timeout",
      "platform": "ticketmaster"
    }
  ]
}
```

**Behavior:** 
- Every check, append new notifications to `notifications_sent`
- Send notification if tickets found, **regardless of whether they were found in previous check** (no deduplication)
- Track errors for Memories visibility

---

## 5. Notification Format

### 5.1 Telegram Message (Minimal)

```
🎫 Tickets Available!

Artist: Taylor Swift
City: Berlin
Date: 15.07.2026
Platform: Ticketmaster

Get tickets: https://www.ticketmaster.com/...
```

**Content:**
- Artist name
- City
- Event date
- Direct link to tickets

---

## 6. Execution Model

### 6.1 Claude Code Routine

The app runs as a Claude Code routine every 30 minutes:

```bash
node src/index.js
```

**Exit Codes:**
- `0`: Success (even if no tickets found)
- `1`: Fatal error (config invalid, telegram unreachable, etc.)

### 6.2 Each Check Cycle

1. Load `config.json`
2. For each `watched_event`:
   - For each platform in `platforms`:
     - Call scraper (ticketmaster.js or axs.js)
     - If tickets found: send Telegram notification
3. Update `state.json` with results
4. Write log entry to `logs/tickets.log`
5. Exit with appropriate code

---

## 7. Error Handling

### 7.1 Scraper Errors

- **API timeout**: Log error, continue to next event
- **Invalid artist name**: Log warning, skip
- **Network error**: Log and retry once, then skip event

**Never crash the process.** All errors are logged but non-fatal.

### 7.2 Telegram Errors

- **Token invalid**: Log and exit with code 1 (fatal)
- **Chat not found**: Log and exit with code 1 (fatal)
- **Rate limit**: Log, wait 60s, retry once

### 7.3 Config Errors

- **Missing required fields**: Exit with code 1 (fatal)
- **Invalid date format**: Log warning, skip event

---

## 8. Logging & Memories

### 8.1 Log Format

```
[2026-06-20 14:30:00] ✅ Check started
[2026-06-20 14:30:05] 🔍 Ticketmaster: Taylor Swift (Berlin, 2026-07-15) - Found: true
[2026-06-20 14:30:08] 🔍 AXS: Taylor Swift (Berlin, 2026-07-15) - Found: false
[2026-06-20 14:30:10] 📤 Telegram sent: Taylor Swift - Berlin - 2026-07-15
[2026-06-20 14:30:12] ✅ Check completed | Notified: 1 | Errors: 0 | Exit: 0
```

### 8.2 Memory Integration

Claude Code reads `logs/tickets.log` and writes to Memories:
- Last check timestamp
- Notifications sent (count and artists)
- Any errors encountered
- Platform availability status

This allows subsequent Claude Code sessions to understand current state at a glance.

---

## 9. Dependencies

```json
{
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

**Rationale:**
- `axios`: Reliable HTTP client for API calls
- `cheerio`: HTML parsing (if DOM scraping required)
- `node-telegram-bot-api`: Official Telegram SDK
- `dotenv`: Secure credential management

---

## 10. Git & Deployment

### 10.1 .gitignore

```
node_modules/
.env
state.json
logs/
.DS_Store
*.log
```

### 10.2 Setup for Claude Code Routine

Once app is ready:
1. Commit to git
2. Create Claude Code Routine with `/schedule` or `/loop`
3. Configure: `node src/index.js` every 30 minutes
4. Routine reads state and logs for Memories context

---

## 11. Success Criteria

- ✅ App runs every 30 minutes without manual intervention
- ✅ Tickets found → Telegram notification sent within 30s
- ✅ Notifications sent on every check (not deduplicated)
- ✅ Errors logged but don't crash the process
- ✅ Claude Code Memories updated with status after each run
- ✅ Config easily editable for adding/removing artists
- ✅ All secrets in `.env`, code committed to git

---

## 12. Future Extensions (Out of Scope)

- Web UI for managing config
- Database backend for state
- Price range filtering
- Ticket type filtering (VIP/standing)
- Multiple Telegram users
- SMS fallback
- Slack integration

These are post-MVP enhancements.
