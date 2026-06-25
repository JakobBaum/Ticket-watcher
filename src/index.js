require('dotenv').config();
const logger = require('./utils/logger.js');
const configMgr = require('./managers/config-manager.js');
const stateMgr = require('./managers/state-manager.js');
const telegramNotifier = require('./notifier/telegram.js');
const { scrapeTicketmaster } = require('./scrapers/ticketmaster.js');
const { scrapeAXS, closeBrowser } = require('./scrapers/axs.js');

async function scrapeOne(event, platformEntry, city) {
  const platformName = typeof platformEntry === 'object' ? platformEntry.name : platformEntry;
  const platformUrl = typeof platformEntry === 'object' ? platformEntry.url : null;
  const scrapeTarget = platformUrl || event.artist;

  let result;
  if (platformName === 'ticketmaster') {
    // Discovery API searches by artist keyword, not by page URL.
    result = await scrapeTicketmaster(event.artist, city, event.date_from, event.date_to);
  } else if (platformName === 'axs') {
    result = await scrapeAXS(scrapeTarget, city, event.date_from, event.date_to);
  } else {
    logger.log(logger.WARN, `Unknown platform: ${platformName}`);
    return null;
  }

  return { event, platformName, city, result };
}

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

    // Build all scrape tasks and run them in parallel
    const tasks = [];
    for (const event of config.watched_events) {
      for (const platformEntry of event.platforms) {
        for (const city of event.cities) {
          tasks.push({ event, platformEntry, city });
        }
      }
    }

    const settled = await Promise.allSettled(
      tasks.map(({ event, platformEntry, city }) => scrapeOne(event, platformEntry, city))
    );

    // Process results sequentially so state writes don't race
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        logger.log(logger.ERROR, `Scrape task threw unexpectedly: ${outcome.reason?.message}`);
        errorCount++;
        continue;
      }

      const data = outcome.value;
      if (!data) continue;

      const { event, platformName, city, result } = data;

      if (!result.success) {
        logger.log(logger.ERROR, `Scraper failed for ${platformName} / ${city}: ${result.error}`);
        stateMgr.addError({ message: result.error, platform: platformName });
        errorCount++;
        continue;
      }

      const eventDate = result.date || event.date_from;
      logger.log(logger.CHECK, `${platformName.charAt(0).toUpperCase() + platformName.slice(1)}: ${event.artist} (${city}, ${eventDate}) - Found: ${result.found}`);

      if (result.found && result.url) {
        const notificationResult = await telegramNotifier.sendNotification({
          artist: event.artist,
          city,
          date: eventDate,
          event_url: result.url,
          platform: platformName
        });

        if (notificationResult.success) {
          logger.log(logger.NOTIFY, `Telegram sent: ${event.artist} - ${city} - ${eventDate}`);
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
            logger.log(logger.ERROR, 'Fatal Telegram error - exiting with code 1');
            return process.exit(1);
          }

          errorCount++;
        }
      }
    }

    stateMgr.updateLastCheck();
    logger.log(logger.END, `Check completed | Notified: ${notificationCount} | Errors: ${errorCount} | Exit: 0`);
    process.exit(0);
  } catch (error) {
    logger.log(logger.ERROR, `Fatal error: ${error.message}\n${error.stack}`);
    process.exit(1);
  } finally {
    await closeBrowser().catch(() => {});
  }
}

runCheckCycle();
