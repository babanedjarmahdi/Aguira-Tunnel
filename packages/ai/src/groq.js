import { AIProvider } from './provider.js';
import { abortableSleep } from '@terraflow/shared';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  constructor({ apiKey, model }) {
    super();
    this.apiKey = apiKey;
    this.model = model || 'llama-3.3-70b-versatile';
  }

  async enrich(entry, { signal, retries = 8 } = {}) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `NAME: ${entry.name}\nDESCRIPTION:\n${entry.description}\n\nReturn the JSON object.` },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    };

    const backoffFor = (attempt) => Math.min(120000, 3000 * Math.pow(2, Math.max(0, attempt - 1)));

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res;
      try {
        res = await fetch(GROQ_URL, {
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

  // Throttle to stay under free-tier TPM: approx (tokensPerRequest / tpmLimit) seconds between calls.
  pacingMs(tokensPerRequest = 700, tpmLimit = 12000) {
    return Math.max(300, Math.ceil((tokensPerRequest / tpmLimit) * 60000));
  }
}
