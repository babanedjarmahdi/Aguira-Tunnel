/**
 * AI provider contract.
 *
 * The Engine depends on this interface only, never on a concrete provider.
 * Each provider receives the provider config at construction and must expose:
 *
 *   enrich(entry, opts?) -> Promise<object>   enriched Standard JSON `ai` fields
 *                                              opts: { signal?: AbortSignal,
 *                                                      retries?: number }
 *   pacingMs()           -> number             suggested delay between calls (rate limits)
 *   test(opts?)          -> Promise<void>      connection probe; throws on failure
 *
 * Providers must reject with an AbortError (name === 'AbortError') when the
 * passed signal fires. Providers are stateless beyond config. Add new providers
 * (OpenRouter, local models, OpenAI) by implementing this interface and
 * registering them in createProvider().
 */
export class AIProvider {
  async enrich() {
    throw new Error('Not implemented');
  }

  pacingMs() {
    return 0;
  }

  async test() {
    throw new Error('Not implemented');
  }
}
