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
 *
 * Optional `usage` hook (engine wires a persisted daily-token budget):
 *   config.usage.remainingTokens() -> number  tokens left this budget period
 *   config.usage.add({input, output})         persist real tokens from the API
 * Providers that honor the hook check `remainingTokens()` before each request
 * and reject with `UsageLimitError` when the budget is exhausted, then record
 * the real `usage` from the response after each successful call.
 */

// Rejections of this name mean "the daily free-tier token budget is spent".
// The AI stage stops early instead of burning more requests.
export class UsageLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UsageLimitError';
    this.usedTokens = details.usedTokens;
    this.limitTokens = details.limitTokens;
  }
}

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
