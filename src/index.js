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

    for (const event of config.watched_events) {
      for (const platformEntry of event.platforms) {
        // Support both string ("ticketmaster") and object ({ name, url }) formats
        const platformName = typeof platformEntry === 'object' ? platformEntry.name : platformEntry;
        const platformUrl = typeof platformEntry === 'object' ? platformEntry.url : null;
        const scrapeTarget = platformUrl || event.artist;

        for (const city of event.cities) {
          try {
            let result;

            if (platformName === 'ticketmaster') {
              result = await scrapeTicketmaster(scrapeTarget, city, event.date_from, event.date_to);
            } else if (platformName === 'axs') {
              result = await scrapeAXS(scrapeTarget, city, event.date_from, event.date_to);
            } else {
              logger.log(logger.WARN, `Unknown platform: ${platformName}`);
              continue;
            }

            logger.log(logger.CHECK, `${platformName.charAt(0).toUpperCase() + platformName.slice(1)}: ${event.artist} (${city}, ${event.date_from}) - Found: ${result.found}`);

            if (result.found && result.url) {
              if (stateMgr.hasNotification({ artist: event.artist, city, date: event.date_from, platform: platformName })) {
                logger.log(logger.CHECK, `Already notified: ${event.artist} - ${city} - ${platformName}`);
                continue;
              }

              const notificationResult = await telegramNotifier.sendNotification({
                artist: event.artist,
                city: city,
                date: event.date_from,
                event_url: result.url,
                platform: platformName
              });

              if (notificationResult.success) {
                logger.log(logger.NOTIFY, `Telegram sent: ${event.artist} - ${city} - ${event.date_from}`);
                stateMgr.addNotification({
                  artist: event.artist,
                  city: city,
                  date: event.date_from,
                  platform: platformName,
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
                stateMgr.addError({ message: notificationResult.error, platform: platformName });

                if (isFatalTelegramError) {
                  logger.log(logger.ERROR, `Fatal Telegram error - exiting with code 1`);
                  return process.exit(1);
                }

                errorCount++;
              }
            }
          } catch (error) {
            logger.log(logger.ERROR, `Error checking ${platformName} / ${city}: ${error.message}`);
            stateMgr.addError({ message: error.message, platform: platformName });
            errorCount++;
          }
        }
      }
    }

    stateMgr.updateLastCheck();
    logger.log(logger.END, `Check completed | Notified: ${notificationCount} | Errors: ${errorCount} | Exit: 0`);
    process.exit(0);
  } catch (error) {
    logger.log(logger.ERROR, `Fatal error: ${error.message}`);
    process.exit(1);
  }
}

runCheckCycle();
