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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const pageContent = html.toLowerCase();

    const isChallengePage = html.length < 50000 &&
      (pageContent.includes('cf-challenge') ||
       pageContent.includes('access denied') ||
       (pageContent.includes('captcha') && pageContent.includes('robot')));

    console.log(`[TM DEBUG] url=${fetchUrl} html_len=${html.length} challenge=${isChallengePage}`);

    if (isChallengePage) {
      return { success: true, found: false, platform: 'ticketmaster' };
    }

    const cities = normalizeCity(city);
    const structuredResult = checkStructuredData(html, cities);

    console.log(`[TM DEBUG] cities=${JSON.stringify(cities)} structuredResult=${JSON.stringify(structuredResult)}`);

    if (structuredResult !== undefined) {
      const found = typeof structuredResult === 'string';
      return { success: true, found, url: found ? structuredResult : null, platform: 'ticketmaster' };
    }

    // Fall back to text heuristics.
    // Positive signals win — "no results" often appears in JS i18n bundles even on pages that have tickets.
    const hasPositive = pageContent.includes('buy tickets') ||
                        pageContent.includes('tickets from') ||
                        pageContent.includes('get tickets');
    const hasNegative = !hasPositive &&
      (pageContent.includes('no events found') || pageContent.includes('no results found'));
    const found = hasPositive && !hasNegative;
    console.log(`[TM DEBUG] heuristic: hasPositive=${hasPositive} hasNegative=${hasNegative} found=${found}`);

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
