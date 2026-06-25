const axios = require('axios');
const { normalizeCity, isUrl, isSafeUrl, checkStructuredData } = require('./scraper-utils');
const logger = require('../utils/logger');

const AXS_SEARCH_URL = 'https://www.axs.com/events';
const REQUEST_TIMEOUT_MS = 15000;

async function closeBrowser() {}

async function fetchWithHttp(url) {
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
    },
    validateStatus: () => true,
  });
  return { html: response.data || '', status: response.status };
}

/**
 * Pure interpretation of a fetched AXS page. Separated from the browser fetch so
 * the block-detection and availability logic can be unit-tested with fixtures.
 * Returns the standard scraper result object.
 */
function interpretAxsResponse({ html, status, fetchUrl, city, dateFrom, dateTo }) {
  // AXS aggressively bot-blocks headless browsers (typically HTTP 403). Treat any
  // non-OK status as a loud error rather than silently reporting "no tickets found".
  if (status !== null && status >= 400) {
    return { success: false, found: false, error: `AXS blocked the request (HTTP ${status}) — bot detection`, platform: 'axs' };
  }

  const pageContent = html.toLowerCase();

  // Challenge/captcha interstitials can be served with a 200 status, so check
  // content regardless of page size.
  const isChallengePage =
    pageContent.includes('cf-challenge') ||
    pageContent.includes('access denied') ||
    (pageContent.includes('captcha') && pageContent.includes('robot'));

  if (isChallengePage) {
    return { success: false, found: false, error: `AXS challenge/captcha page detected for ${fetchUrl} — scraper blocked`, platform: 'axs' };
  }

  const cities = normalizeCity(city);
  const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

  if (structuredResult !== undefined) {
    const found = structuredResult !== null;
    const url = structuredResult?.url || (found ? fetchUrl : null);
    return { success: true, found, url, date: structuredResult?.date || null, platform: 'axs' };
  }

  // A "buy/get tickets" CTA is the only reliable positive signal in the raw HTML;
  // negative phrases like "no results" appear in JS bundles even on pages with
  // tickets, so they can't veto a positive and aren't worth checking.
  const found = pageContent.includes('buy tickets') ||
                pageContent.includes('tickets from') ||
                pageContent.includes('get tickets');

  let eventUrl = null;
  if (found) {
    const urlMatch = html.match(/href="(https:\/\/www\.axs\.com\/[^"]+)"/);
    eventUrl = urlMatch ? urlMatch[1] : fetchUrl;
  }

  return { success: true, found, url: eventUrl, platform: 'axs' };
}

async function scrapeAXS(artist, city, dateFrom, dateTo) {
  try {
    const fetchUrl = isUrl(artist)
      ? artist
      : `${AXS_SEARCH_URL}?q=${encodeURIComponent(artist)}&location=${encodeURIComponent(city)}`;

    if (isUrl(artist) && !isSafeUrl(artist)) {
      return { success: false, found: false, error: `Unsafe or non-HTTPS URL rejected: ${artist}`, platform: 'axs' };
    }

    let html, status;
    try {
      ({ html, status } = await fetchWithHttp(fetchUrl));
    } catch (error) {
      return { success: false, found: false, error: `HTTP fetch error: ${error.message}`, platform: 'axs' };
    }

    return interpretAxsResponse({ html, status, fetchUrl, city, dateFrom, dateTo });
  } catch (error) {
    return { success: false, found: false, error: error.message, platform: 'axs' };
  }
}

module.exports = { scrapeAXS, closeBrowser, interpretAxsResponse };
