const axios = require('axios');

const TICKETMASTER_SEARCH_URL = 'https://www.ticketmaster.com/search';

const CITY_ALIASES = {
  'vienna': 'wien',
  'wien': 'vienna',
};

function normalizeCity(city) {
  const lower = city.toLowerCase();
  return [lower, CITY_ALIASES[lower]].filter(Boolean);
}

function isUrl(str) {
  return str.startsWith('http://') || str.startsWith('https://');
}

function checkStructuredData(html, cities) {
  const ldMatches = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldMatches) {
    const json = block.replace(/<script[^>]*>|<\/script>/gi, '').trim();
    try {
      const data = JSON.parse(json);
      const events = Array.isArray(data) ? data : [data];
      for (const event of events) {
        if (event['@type'] !== 'MusicEvent' && event['@type'] !== 'Event') continue;
        const location = (event.location?.address?.addressLocality || '').toLowerCase();
        const cityMatch = cities.some(c => location.includes(c));
        if (!cityMatch) continue;
        const offers = Array.isArray(event.offers) ? event.offers : (event.offers ? [event.offers] : []);
        const available = offers.some(o =>
          o.availability && o.availability.toLowerCase().includes('instock')
        );
        if (available) {
          return event.url || null;
        }
      }
    } catch (_) {}
  }
  return undefined; // undefined = no structured data found; null = found but unavailable
}

async function scrapeTicketmaster(artist, city, dateFrom, dateTo) {
  try {
    const fetchUrl = isUrl(artist)
      ? artist
      : `${TICKETMASTER_SEARCH_URL}?keyword=${encodeURIComponent(artist)}&city=${encodeURIComponent(city)}`;

    const response = await axios.get(fetchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const pageContent = html.toLowerCase();

    const isBlocked = pageContent.includes('captcha') ||
                      pageContent.includes('robot') ||
                      pageContent.includes('cf-challenge') ||
                      pageContent.includes('access denied');

    if (isBlocked) {
      return { success: true, found: false, platform: 'ticketmaster' };
    }

    const cities = normalizeCity(city);

    // Try structured ld+json first
    const structuredResult = checkStructuredData(html, cities);
    if (structuredResult !== undefined) {
      const found = structuredResult !== null;
      return { success: true, found, url: found ? structuredResult : null, platform: 'ticketmaster' };
    }

    // Fall back to text heuristics
    const hasNegative = pageContent.includes('no results') || pageContent.includes('no events found');
    const hasPositive = pageContent.includes('buy tickets') ||
                        pageContent.includes('tickets from') ||
                        pageContent.includes('get tickets');
    const found = !hasNegative && hasPositive;

    let eventUrl = null;
    if (found) {
      const urlMatch = html.match(/href="(https:\/\/www\.ticketmaster\.com\/[^"]+)"/);
      eventUrl = urlMatch ? urlMatch[1] : fetchUrl;
    }

    return { success: true, found, url: eventUrl, platform: 'ticketmaster' };
  } catch (error) {
    return { success: false, found: false, error: error.message, platform: 'ticketmaster' };
  }
}

module.exports = { scrapeTicketmaster };
