import { AIProvider } from './provider.js';
import { abortableSleep } from '@terraflow/shared';

// Groq free-tier models. The pipeline and the Professional UI restrict model
// selection to this list (free tier only).
export const GROQ_FREE_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama-3.2-3b-preview',
  'llama-3.2-1b-preview',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'mixtral-8x7b-32768',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen2.5-coder-32b',
];

const SYSTEM_PROMPT = `You are an expert Arabic real-estate data extractor working for a CRM system.
You will receive a property record (name + Arabic free-text description).
Extract these fields and return ONLY a valid JSON object with keys:
- property_type: one of "أرض","منزل","كراج","محل تجاري","فيلا","شقة","مزرعة","كركاس" or null
- status: "متوفر" or "مباع" or "للإيجار" or "للإيجار" if the text mentions rental, else "متوفر"
- location: neighborhood/area name (e.g. "صالوحة","اموضان","الشواهين") or null
- area_m2: numeric area in square meters if present, else null
- price_in_million: numeric value if price is quoted as "X مليون", else null
- price_per_meter: numeric value if price is quoted as "X للمتر", else null
- price_note: exact Arabic price phrase as written (e.g. "طالب 900 مليون", "سعر 24 للمتر"), or null
- owner_name: the owner/person name if present, else null
- phone: phone number if present (digits, normalize . and spaces), else null
- notes: short summary in Arabic of the rest (contract type, features), or null

Rules:
- If price is quoted as "X مليون", set price_in_million.
- If price is quoted as "X للمتر"/"X الف للمتر", set price_per_meter.
- Keep Arabic text verbatim in notes/location/owner_name.
- If a field is truly absent, use null. Do NOT invent values.
Return the JSON object only, no commentary.`;

// Groq returns either seconds or an HTTP-date in Retry-After.
function retryAfterMs(value) {
  if (!value) return 0;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  const ms = Date.parse(value);
  if (Number.isFinite(ms)) return Math.max(0, ms - Date.now());
  return 0;
}

export class GroqProvider extends AIProvider {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'llama-3.3-70b-versatile';
    this.baseUrl = (config.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    this.temperature = config.temperature ?? 0;
    this.maxTokens = config.maxTokens ?? 512;
    this.prompt = config.prompt || null;
    this.pacingTokensPerRequest = config.pacingTokensPerRequest ?? 700;
    this.pacingTpmLimit = config.pacingTpmLimit ?? 12000;
  }

  chatUrl() {
    return `${this.baseUrl}/chat/completions`;
  }

  async enrich(entry, { signal, retries = 8 } = {}) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: this.prompt || SYSTEM_PROMPT },
        { role: 'user', content: `NAME: ${entry.name}\nDESCRIPTION:\n${entry.description}\n\nReturn the JSON object.` },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
    };

    const backoffFor = (attempt) => Math.min(120000, 3000 * Math.pow(2, Math.max(0, attempt - 1)));

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res;
      try {
        res = await fetch(this.chatUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        lastErr = e; // transient network failure -> retry with backoff
        if (attempt < retries) await abortableSleep(backoffFor(attempt), signal);
        continue;
      }

      if (res.status === 429) {
        lastErr = new Error('Groq API 429 rate limit');
        if (attempt < retries) {
          const wait = Math.max(retryAfterMs(res.headers.get('retry-after')), backoffFor(attempt));
          await abortableSleep(wait, signal);
        }
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Groq API ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      return JSON.parse(content);
    }
    throw lastErr;
  }

  // Minimal probe: verifies key + model + endpoint reachability. Throws on failure.
  async test({ signal } = {}) {
    const res = await fetch(this.chatUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        temperature: 0,
        max_tokens: 4,
      }),
    });
    if (res.status === 429) {
      throw new Error('Rate limited (429) — try again in a minute');
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API ${res.status}: ${text.slice(0, 300)}`);
    }
    await res.json();
  }

  // Throttle to stay under the configured TPM limit between calls.
  pacingMs() {
    return Math.max(300, Math.ceil((this.pacingTokensPerRequest / this.pacingTpmLimit) * 60000));
  }
}
