const { chromium } = require('playwright');
const { normalizeCity, isUrl, isSafeUrl, checkStructuredData, CHALLENGE_PAGE_MAX_BYTES } = require('./scraper-utils');
const logger = require('../utils/logger');

const AXS_SEARCH_URL = 'https://www.axs.com/events';
const NAV_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 10000;

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

async function fetchWithPlaywright(url) {
  const browser = await getBrowser();
  let context;
  let html = '';
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Block non-essential resources to reduce attack surface and speed up loading
    await page.route('**/*', route => {
      const type = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS });
    } catch (_) {
      // networkidle timed out — page content is still usable
    }
    html = await page.content();
  } finally {
    if (context) await context.close().catch(() => {});
  }
  return html;
}

async function scrapeAXS(artist, city, dateFrom, dateTo) {
  try {
    const fetchUrl = isUrl(artist)
      ? artist
      : `${AXS_SEARCH_URL}?q=${encodeURIComponent(artist)}&location=${encodeURIComponent(city)}`;

    if (isUrl(artist) && !isSafeUrl(artist)) {
      return { success: false, found: false, error: `Unsafe or non-HTTPS URL rejected: ${artist}`, platform: 'axs' };
    }

    let html;
    try {
      html = await fetchWithPlaywright(fetchUrl);
    } catch (error) {
      return { success: false, found: false, error: `Playwright error: ${error.message}`, platform: 'axs' };
    }

    const pageContent = html.toLowerCase();

    const isChallengePage = html.length < CHALLENGE_PAGE_MAX_BYTES &&
      (pageContent.includes('cf-challenge') ||
       pageContent.includes('access denied') ||
       (pageContent.includes('captcha') && pageContent.includes('robot')));

    if (isChallengePage) {
      logger.log(logger.WARN, `AXS challenge/captcha page detected for ${fetchUrl} — scraper may be blocked`);
      return { success: true, found: false, platform: 'axs' };
    }

    const cities = normalizeCity(city);
    const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

    if (structuredResult !== undefined) {
      const found = structuredResult !== null;
      const url = structuredResult?.url || (found ? fetchUrl : null);
      return { success: true, found, url, date: structuredResult?.date || null, platform: 'axs' };
    }

    const hasNegative = pageContent.includes('no results') || pageContent.includes('no events');
    const hasPositive = pageContent.includes('buy tickets') ||
                        pageContent.includes('tickets from') ||
                        pageContent.includes('get tickets');
    const found = hasPositive && !hasNegative;

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

module.exports = { scrapeAXS, closeBrowser };
