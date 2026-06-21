const axios = require('axios');
const { normalizeCity, isUrl, checkStructuredData } = require('./scraper-utils');

const TICKETMASTER_SEARCH_URL = 'https://www.ticketmaster.com/search';

async function scrapeTicketmaster(artist, city, dateFrom, dateTo) {
  try {
    const fetchUrl = isUrl(artist)
      ? artist
      : `${TICKETMASTER_SEARCH_URL}?keyword=${encodeURIComponent(artist)}&city=${encodeURIComponent(city)}`;

    const response = await axios.get(fetchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = response.data;
    const pageContent = html.toLowerCase();

    const isChallengePage = html.length < 50000 &&
      (pageContent.includes('cf-challenge') ||
       pageContent.includes('access denied') ||
       (pageContent.includes('captcha') && pageContent.includes('robot')));

    if (isChallengePage) {
      return { success: true, found: false, platform: 'ticketmaster' };
    }

    const cities = normalizeCity(city);
    const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

    if (structuredResult !== undefined) {
      const found = structuredResult !== null;
      // Fall back to fetchUrl when ld+json event omits its own URL field
      const url = structuredResult?.url || (found ? fetchUrl : null);
      return { success: true, found, url, date: structuredResult?.date || null, platform: 'ticketmaster' };
    }

    // Heuristic fallback — only used when scraping the generic search page (no direct artist URL).
    // When a direct artist URL was given but yielded no city-matched structured data, the artist
    // has no events in that city — return false rather than firing on nav text.
    if (isUrl(artist)) {
      return { success: true, found: false, platform: 'ticketmaster' };
    }

    // On the generic search page, "buy tickets" appears in the site nav regardless of results,
    // so we require its presence alongside the absence of an explicit no-results signal.
    const hasPositive = pageContent.includes('buy tickets') ||
                        pageContent.includes('tickets from') ||
                        pageContent.includes('get tickets');
    const hasNegative = pageContent.includes('no events found') || pageContent.includes('no results found');
    const found = hasPositive && !hasNegative;

    let eventUrl = null;
    if (found) {
      const urlMatch = html.match(/href="(https:\/\/www\.ticketmaster\.com\/event\/[^"]+)"/);
      eventUrl = urlMatch ? urlMatch[1] : null;
    }

    return { success: true, found, url: eventUrl, platform: 'ticketmaster' };
  } catch (error) {
    return { success: false, found: false, error: error.message, platform: 'ticketmaster' };
  }
}

module.exports = { scrapeTicketmaster };
