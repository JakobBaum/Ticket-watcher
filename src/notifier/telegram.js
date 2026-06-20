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
