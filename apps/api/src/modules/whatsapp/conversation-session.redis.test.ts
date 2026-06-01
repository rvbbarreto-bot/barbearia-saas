import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock('../../infra/redis/client.js', () => ({
  redis: redisMock,
}));

describe('conversation-session.redis', () => {
  beforeEach(() => {
    vi.resetModules();
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    process.env.WHATSAPP_CONVERSATION_REDIS_ENABLED = 'true';
    process.env.WHATSAPP_CONVERSATION_TTL_SECONDS = '3600';
  });

  it('turnsToSessionText formata cliente e barbearia', async () => {
    const { turnsToSessionText } = await import('./conversation-session.redis.js');
    const text = turnsToSessionText([
      { direction: 'in', body: 'Oi', at: '2026-01-01T00:00:00.000Z' },
      { direction: 'out', body: 'Olá', at: '2026-01-01T00:00:01.000Z' },
    ]);
    expect(text).toBe('Cliente: Oi\nBarbearia: Olá');
  });

  it('appendConversationTurn persiste JSON com TTL', async () => {
    redisMock.get.mockResolvedValue(null);
    const { appendConversationTurn } = await import('./conversation-session.redis.js');
    await appendConversationTurn('tenant-a', 'cust-b', {
      direction: 'in',
      body: 'Quero agendar',
      at: '2026-01-01T00:00:00.000Z',
    });
    expect(redisMock.set).toHaveBeenCalledTimes(1);
    const [key, payload, ex, ttl] = redisMock.set.mock.calls[0];
    expect(key).toBe('wa:conv:tenant-a:cust-b');
    expect(ex).toBe('EX');
    expect(ttl).toBe(3600);
    const parsed = JSON.parse(payload as string);
    expect(parsed.recent_messages).toHaveLength(1);
    expect(parsed.recent_messages[0].body).toBe('Quero agendar');
  });
});
