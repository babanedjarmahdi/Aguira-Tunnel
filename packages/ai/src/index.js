import { GroqProvider } from './groq.js';

export { AIProvider } from './provider.js';
export { GroqProvider, GROQ_FREE_MODELS } from './groq.js';

// Only 'groq' is supported today. New providers are added here without
// touching the Engine.
export function createProvider(config = {}) {
  const name = (config.provider || 'groq').toLowerCase();
  if (name === 'groq') {
    return new GroqProvider(config);
  }
  throw new Error(`Unsupported AI provider: "${name}". Supported: groq`);
}

// Verifies provider credentials/endpoint without running a job.
// Resolves with { ok, latencyMs, model, provider } or { ok:false, error, latencyMs }.
export async function testAiConnection(config = {}) {
  let provider;
  try {
    provider = createProvider(config);
  } catch (e) {
    return { ok: false, error: e.message, latencyMs: 0 };
  }
  const t0 = Date.now();
  try {
    await provider.test();
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      model: config.model,
      provider: (config.provider || 'groq').toLowerCase(),
    };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: e.message };
  }
}
