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
