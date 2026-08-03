import { GroqProvider } from './groq.js';

export { AIProvider } from './provider.js';
export { GroqProvider } from './groq.js';

// Only 'groq' is supported today. New providers are added here without
// touching the Engine.
export function createProvider(config = {}) {
  const name = (config.provider || 'groq').toLowerCase();
  if (name === 'groq') {
    return new GroqProvider({ apiKey: config.apiKey, model: config.model });
  }
  throw new Error(`Unsupported AI provider: "${name}". Supported: groq`);
}
