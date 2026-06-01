/**
 * Transcrição opcional de áudio WhatsApp via OpenAI Whisper.
 * Requer OPENAI_API_KEY no ambiente da API e URL acessível do media (Evolution).
 */
export async function transcribeAudioFromUrl(mediaUrl: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !mediaUrl?.trim()) return null;

  let audioBuf: Buffer;
  try {
    const headers: Record<string, string> = {};
    const evoKey = process.env.EVOLUTION_API_KEY?.trim();
    if (evoKey) headers.apikey = evoKey;

    const mediaRes = await fetch(mediaUrl, { headers });
    if (!mediaRes.ok) return null;
    audioBuf = Buffer.from(await mediaRes.arrayBuffer());
  } catch {
    return null;
  }

  if (audioBuf.length < 100) return null;

  const form = new FormData();
  form.append('file', new Blob([audioBuf], { type: 'audio/ogg' }), 'audio.ogg');
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  try {
    const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!tr.ok) return null;
    const data = (await tr.json()) as { text?: string };
    const text = String(data.text ?? '').trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** Feature flag simples — não quebra deploy sem OpenAI. */
export function isAudioTranscribeEnabled(): boolean {
  if (!process.env.OPENAI_API_KEY?.trim()) return false;
  const flag = process.env.WHATSAPP_AUDIO_TRANSCRIBE_ENABLED;
  if (flag === undefined || flag === '') return true;
  return flag === 'true' || flag === '1' || flag === 'yes';
}
