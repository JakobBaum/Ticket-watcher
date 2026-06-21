const { chromium } = require('playwright');
const { normalizeCity, isUrl, isSafeUrl, checkStructuredData, CHALLENGE_PAGE_MAX_BYTES } = require('./scraper-utils');
const logger = require('../utils/logger');

const TICKETMASTER_SEARCH_URL = 'https://www.ticketmaster.com/search';

async function scrapeTicketmaster(artist, city, dateFrom, dateTo) {
  const fetchUrl = isUrl(artist)
    ? artist
    : `${TICKETMASTER_SEARCH_URL}?keyword=${encodeURIComponent(artist)}&city=${encodeURIComponent(city)}`;

  if (isUrl(artist) && !isSafeUrl(artist)) {
    return { success: false, found: false, error: `Unsafe or non-HTTPS URL rejected: ${artist}`, platform: 'ticketmaster' };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();

    await page.goto(fetchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (_) {
      // networkidle timed out — page content is still usable
    }
    const html = await page.content();
    const pageContent = html.toLowerCase();

    const isChallengePage = html.length < CHALLENGE_PAGE_MAX_BYTES &&
      (pageContent.includes('cf-challenge') ||
       pageContent.includes('access denied') ||
       (pageContent.includes('captcha') && pageContent.includes('robot')));

    if (isChallengePage) {
      logger.log(logger.WARN, `Ticketmaster challenge/captcha page detected for ${fetchUrl} — scraper may be blocked`);
      return { success: true, found: false, platform: 'ticketmaster' };
    }

    const cities = normalizeCity(city);
    const structuredResult = checkStructuredData(html, cities, dateFrom, dateTo);

    if (structuredResult !== undefined) {
      const found = structuredResult !== null;
      const url = structuredResult?.url || (found ? fetchUrl : null);
      return { success: true, found, url, date: structuredResult?.date || null, platform: 'ticketmaster' };
    }

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
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { scrapeTicketmaster };
