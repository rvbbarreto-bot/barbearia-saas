import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvolutionSendTextResponse } from './n8n-qa-sendtext-classify-snippet.js';

describe('classifyEvolutionSendTextResponse', () => {
  it('treats Evolution PENDING with key as technical success (PO smoke)', () => {
    const res = {
      statusCode: 201,
      key: {
        remoteJid: '5511973305448@s.whatsapp.net',
        fromMe: true,
        id: '3EB03A66EE32C705488140',
      },
      status: 'PENDING',
      message: { conversation: '[QA Smoke] Barbearia SaaS' },
    };
    const out = classifyEvolutionSendTextResponse(res);
    assert.equal(out.ok, true);
    assert.equal(out.status, 'PENDING');
    assert.equal(out.delivery_status, 'queued_or_pending');
    assert.equal(out.message_id, '3EB03A66EE32C705488140');
    assert.equal(out.remoteJid, '5511973305448@s.whatsapp.net');
    assert.equal(out.requires_whatsapp_confirmation, true);
  });

  it('does not confuse message status PENDING with HTTP status', () => {
    const res = { status: 'PENDING' };
    const out = classifyEvolutionSendTextResponse(res);
    assert.equal(out.ok, false);
    assert.equal(out.error_class, 'provider_invalid_response');
  });

  it('classifies 401 as auth error', () => {
    const out = classifyEvolutionSendTextResponse({ statusCode: 401, error: 'Unauthorized' });
    assert.equal(out.ok, false);
    assert.equal(out.error_class, 'auth_401_invalid_api_key');
  });
});
