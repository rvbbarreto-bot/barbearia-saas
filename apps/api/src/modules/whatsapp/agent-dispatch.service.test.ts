import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = {
  set: vi.fn(),
  get: vi.fn(),
};

vi.mock('../../infra/redis/client.js', () => ({
  redis: redisMock,
}));

describe('agent-dispatch.service', () => {
  beforeEach(() => {
    vi.resetModules();
    redisMock.set.mockReset();
    redisMock.get.mockReset();
    delete process.env.WHATSAPP_AGENT_DEBOUNCE_MS;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_AGENT_DEBOUNCE_MS;
  });

  it('registerAgentDispatch com debounce 0 dispara imediato', async () => {
    process.env.WHATSAPP_AGENT_DEBOUNCE_MS = '0';
    const { registerAgentDispatch } = await import('./agent-dispatch.service.js');
    const r = await registerAgentDispatch('t1', 'c1', 'm1');
    expect(r.should_dispatch_immediately).toBe(true);
    expect(r.wait_ms).toBe(0);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('registerAgentDispatch grava chave debounce', async () => {
    process.env.WHATSAPP_AGENT_DEBOUNCE_MS = '3000';
    const { registerAgentDispatch } = await import('./agent-dispatch.service.js');
    const r = await registerAgentDispatch('t1', 'c1', 'msg-uuid');
    expect(r.should_dispatch_immediately).toBe(false);
    expect(r.wait_ms).toBe(3000);
    expect(redisMock.set).toHaveBeenCalledWith('wa:deb:t1:c1', 'msg-uuid', 'PX', 3000);
  });

  it('shouldDispatchAgent true quando chave expirou', async () => {
    process.env.WHATSAPP_AGENT_DEBOUNCE_MS = '2500';
    redisMock.get.mockResolvedValue(null);
    const { shouldDispatchAgent } = await import('./agent-dispatch.service.js');
    expect(await shouldDispatchAgent('t1', 'c1', 'm1')).toBe(true);
  });

  it('shouldDispatchAgent false quando token superseded', async () => {
    process.env.WHATSAPP_AGENT_DEBOUNCE_MS = '2500';
    redisMock.get.mockResolvedValue('other-message');
    const { shouldDispatchAgent } = await import('./agent-dispatch.service.js');
    expect(await shouldDispatchAgent('t1', 'c1', 'm1')).toBe(false);
  });

  it('shouldDispatchAgent true quando token ainda e o ultimo', async () => {
    process.env.WHATSAPP_AGENT_DEBOUNCE_MS = '2500';
    redisMock.get.mockResolvedValue('m1');
    const { shouldDispatchAgent } = await import('./agent-dispatch.service.js');
    expect(await shouldDispatchAgent('t1', 'c1', 'm1')).toBe(true);
  });
});
