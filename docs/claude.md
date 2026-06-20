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
