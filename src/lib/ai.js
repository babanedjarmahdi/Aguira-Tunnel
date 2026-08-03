import dotenv from 'dotenv';

dotenv.config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

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

export async function extractPropertyWithAI(entry, apiKey, retries = 5) {
  const userContent = `NAME: ${entry.name}\nDESCRIPTION:\n${entry.description}\n\nReturn the JSON object.`;
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = Math.min(60000, 3000 * Math.pow(2, attempt - 1));
      console.log(`    (rate limited - retry ${attempt}/${retries} in ${wait}ms)`);
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        lastErr = new Error(`Groq API 429 rate limit`);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Groq API ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      return JSON.parse(content);
    } catch (e) {
      lastErr = e;
      if (!String(e.message).includes('429')) throw e;
    }
  }
  throw lastErr;
}

// Throttle to stay under free-tier TPM: approx (tokensPerRequest / tpmLimit) seconds between calls.
export function pacingDelayMs(tokensPerRequest = 700, tpmLimit = 12000) {
  return Math.max(300, Math.ceil((tokensPerRequest / tpmLimit) * 60000));
}

export function computePriceDzd(ai) {
  // Algerian conventions (verified against existing CRM data):
  // - "X مليون" (centimes) -> X * 1_000_000 centimes = X * 10_000 DA
  // - "N للمتر": small N (< 100) means N thousands DA/m2 (e.g. "24 للمتر" -> 24_000 DA/m2);
  //   large N (>= 100) is literal DA/m2 (e.g. "2700 لمتر" -> 2_700, "23000" -> 23_000)
  if (ai.price_in_million != null) return ai.price_in_million * 10000;
  if (ai.price_per_meter != null && ai.area_m2 != null) {
    const perMeter = ai.price_per_meter < 100 ? ai.price_per_meter * 1000 : ai.price_per_meter;
    return perMeter * ai.area_m2;
  }
  return null;
}
