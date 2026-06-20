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

    const pageContent = response.data.toLowerCase();
    const isBlocked = pageContent.includes('captcha') ||
                      pageContent.includes('robot') ||
                      pageContent.includes('cf-challenge') ||
                      pageContent.includes('access denied');
    const hasNegative = pageContent.includes('no results') ||
                        pageContent.includes('no events found');
    const hasPositive = pageContent.includes('buy tickets') ||
                        pageContent.includes('tickets from') ||
                        pageContent.includes('get tickets');
    const found = !isBlocked && !hasNegative && hasPositive;

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
