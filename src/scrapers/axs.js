const axios = require('axios');
const { normalizeCity, isUrl, checkStructuredData } = require('./scraper-utils');

const AXS_SEARCH_URL = 'https://www.axs.com/events';

async function scrapeAXS(artist, city, dateFrom, dateTo) {
  try {
    const fetchUrl = isUrl(artist)
      ? artist
      : `${AXS_SEARCH_URL}?q=${encodeURIComponent(artist)}&location=${encodeURIComponent(city)}`;

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

    console.log(`[AXS DEBUG] url=${fetchUrl} html_len=${html.length} challenge=${isChallengePage}`);

    if (isChallengePage) {
      return { success: true, found: false, platform: 'axs' };
    }

    const cities = normalizeCity(city);
    const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

    console.log(`[AXS DEBUG] cities=${JSON.stringify(cities)} structuredResult=${JSON.stringify(structuredResult)}`);

    if (structuredResult !== undefined) {
      const found = structuredResult !== null;
      return { success: true, found, url: structuredResult?.url || null, date: structuredResult?.date || null, platform: 'axs' };
    }

    const hasNegative = pageContent.includes('no results') || pageContent.includes('no events');
    const hasPositive = pageContent.includes('buy tickets') ||
                        pageContent.includes('tickets from') ||
                        pageContent.includes('get tickets');
    const found = !hasNegative && hasPositive;
    console.log(`[AXS DEBUG] heuristic: hasPositive=${hasPositive} hasNegative=${hasNegative} found=${found}`);

    let eventUrl = null;
    if (found) {
      const urlMatch = html.match(/href="(https:\/\/www\.axs\.com\/[^"]+)"/);
      if (urlMatch) eventUrl = urlMatch[1];
    }

    return { success: true, found, url: eventUrl, platform: 'axs' };
  } catch (error) {
    return { success: false, found: false, error: error.message, platform: 'axs' };
  }
}

module.exports = { scrapeAXS };
