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

    // Load and validate config (includes env var checks)
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

    // Check each watched event — scrape each city independently
    for (const event of config.watched_events) {
      for (const platform of event.platforms) {
        for (const city of event.cities) {
          try {
            let result;

            if (platform === 'ticketmaster') {
              result = await scrapeTicketmaster(event.url || event.artist, city, event.date_from, event.date_to);
            } else if (platform === 'axs') {
              result = await scrapeAXS(event.url || event.artist, city, event.date_from, event.date_to);
            } else {
              logger.log(logger.WARN, `Unknown platform: ${platform}`);
              continue;
            }

            logger.log(logger.CHECK, `${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${event.artist} (${city}, ${event.date_from}) - Found: ${result.found}`);

            if (result.found && result.url) {
              // Skip if already notified for this artist/city/date/platform
              if (stateMgr.hasNotification({ artist: event.artist, city, date: event.date_from, platform })) {
                logger.log(logger.CHECK, `Already notified: ${event.artist} - ${city} - ${platform}`);
                continue;
              }

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
                const isFatalTelegramError = notificationResult.error &&
                  (notificationResult.error.includes('401') ||
                   notificationResult.error.includes('404') ||
                   notificationResult.error.includes('not found') ||
                   notificationResult.error.includes('Unauthorized') ||
                   notificationResult.error.includes('TELEGRAM_BOT_TOKEN') ||
                   notificationResult.error.includes('TELEGRAM_CHAT_ID'));

                logger.log(logger.ERROR, `Failed to send notification: ${notificationResult.error}`);
                stateMgr.addError({
                  message: notificationResult.error,
                  platform: platform
                });

                if (isFatalTelegramError) {
                  logger.log(logger.ERROR, `Fatal Telegram error - exiting with code 1`);
                  return process.exit(1);
                }

                errorCount++;
              }
            }
          } catch (error) {
            logger.log(logger.ERROR, `Error checking ${platform} / ${city}: ${error.message}`);
            stateMgr.addError({
              message: error.message,
              platform: platform
            });
            errorCount++;
          }
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
