/**
 * AI provider contract.
 *
 * The Engine depends on this interface only, never on a concrete provider.
 * Each provider receives the provider config at construction and must expose:
 *
 *   enrich(entry) -> Promise<object>   enriched Standard JSON `ai` fields
 *   pacingMs()   -> number             suggested delay between calls (rate limits)
 *
 * Providers are stateless beyond config. Add new providers (OpenRouter,
 * local models, OpenAI) by implementing this interface and registering them
 * in createProvider().
 */
export class AIProvider {
  async enrich() {
    throw new Error('Not implemented');
  }

  pacingMs() {
    return 0;
  }
}
