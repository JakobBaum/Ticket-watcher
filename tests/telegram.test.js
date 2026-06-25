/**
 * Telegram notifier tests. node-telegram-bot-api is mocked so no real message
 * is sent; we verify the message is well-formed and errors are reported, not thrown.
 */

const mockSendMessage = jest.fn();
jest.mock('node-telegram-bot-api', () => {
  return jest.fn().mockImplementation(() => ({ sendMessage: mockSendMessage }));
});

describe('telegram notifier', () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    jest.resetModules();
    mockSendMessage.mockReset();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
  });
  afterEach(() => { process.env = { ...OLD }; });

  const event = {
    artist: 'Shinedown',
    city: 'Las Vegas',
    date: '2026-08-07',
    event_url: 'https://www.ticketmaster.com/event/ABC',
    platform: 'ticketmaster',
  };

  test('sends a formatted message and returns success', async () => {
    mockSendMessage.mockResolvedValueOnce({});
    const { sendNotification } = require('../src/notifier/telegram');
    const result = await sendNotification(event);

    expect(result.success).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = mockSendMessage.mock.calls[0];
    expect(chatId).toBe('12345');
    expect(text).toContain('Shinedown');
    expect(text).toContain('Las Vegas');
    expect(text).toContain('07.08.2026'); // formatted date
    expect(text).toContain('Ticketmaster');
    expect(text).toContain(event.event_url);
  });

  test('returns success:false (does not throw) when Telegram errors', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('ETELEGRAM: 401 Unauthorized'));
    const { sendNotification } = require('../src/notifier/telegram');
    const result = await sendNotification(event);

    expect(result.success).toBe(false);
    expect(result.error).toMatch('401');
  });
});
