import { useEffect, useState } from 'react';
import { Zap, Clock, Cpu, KeyRound, PlugZap, Gauge, RotateCcw } from 'lucide-react';
import { getAiSettings, updateAiSettings, testAiConnection, getAiUsage, resetAiUsage } from '../api';
import { Card, Field, Button, Badge, Spinner, useToast } from '../components/ui';

const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-3b-preview'];

export default function AIConfig() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [usage, setUsage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [est, setEst] = useState({ records: 150, tokens: 800, overhead: 1200, priceM: 0 });

  const refreshUsage = () => getAiUsage().then(setUsage).catch(() => {});
  useEffect(() => {
    getAiSettings()
      .then((s) => setForm(s))
      .catch((e) => toast(e.message, 'err'));
    refreshUsage();
  }, []);

  if (!form) {
    return (
      <div className="page">
        <div className="page-head"><h1 className="page-title">AI configuration</h1></div>
        <div className="flex gap-8"><Spinner size={18} /> Loading settings…</div>
      </div>
    );
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, apiKey: form.apiKey || undefined };
      delete body.apiKeySet; delete body.apiKeyHint; delete body.source; delete body.updatedAt; delete body.defaults; delete body.models; delete body.usage;
      const saved = await updateAiSettings(body);
      setForm({ ...saved, apiKey: '' });
      refreshUsage();
      toast('AI settings saved — next job uses them');
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleResetUsage = async () => {
    try {
      setUsage(await resetAiUsage());
      toast('Today\'s usage reset — full daily credit available again');
    } catch (e) {
      toast(`Reset failed: ${e.message}`, 'err');
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection({
        provider: form.provider,
        model: form.model,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey || undefined,
      });
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const pacingMs = form.pacingTokensPerRequest > 0 && form.pacingTpmLimit > 0
    ? Math.max(300, Math.ceil((form.pacingTokensPerRequest / form.pacingTpmLimit) * 60000))
    : '—';

  const estPerReq = est.tokens + est.overhead;
  const estTotalTokens = est.records * estPerReq;
  const estDelayMs = pacingMs === '—' ? 1000 : pacingMs;
  const estLatencyMs = testResult?.ok ? testResult.latencyMs : 1000;
  const estSec = Math.round((est.records * (estDelayMs + estLatencyMs)) / 1000);
  const estTime = estSec >= 60 ? `${Math.floor(estSec / 60)}m ${estSec % 60}s` : `${estSec}s`;
  const estCost = (estTotalTokens / 1e6) * est.priceM;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">AI configuration</h1>
          <p className="page-sub">Provider, model, prompt and pacing for the AI analysis stage.</p>
        </div>
        <div className="flex gap-8">
          <Button icon={PlugZap} onClick={test} disabled={testing}>
            {testing ? <Spinner /> : null} {testing ? 'Testing…' : 'Test connection'}
          </Button>
          <Button variant="primary" icon={Zap} onClick={save} disabled={saving}>
            {saving ? <Spinner /> : null} Save changes
          </Button>
        </div>
      </div>

      {testResult && (
        <div className="mb-16">
          {testResult.ok ? (
            <Badge tone="ok">Connected · {testResult.latencyMs} ms · {testResult.model}</Badge>
          ) : (
            <Badge tone="err">Connection failed · {testResult.error}</Badge>
          )}
        </div>
      )}

      <div className="grid cols-2">
        <Card className="pad" title="Provider & model" sub={`Applied from ${form.source === 'settings' ? 'saved settings' : '.env'}`}>
          <Field label="Provider">
            <div className="segmented" style={{ width: '100%' }}>
              <button className="on">cloud</button>
              <button disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}>openrouter</button>
              <button disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}>local</button>
            </div>
          </Field>
          <Field label="Model" hint="Free-tier models only.">
            <select className="select" value={form.model} onChange={set('model')}>
              {(form.models || FALLBACK_MODELS).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="API base" hint="OpenAI-compatible endpoint">
            <input className="input" value={form.baseUrl} onChange={set('baseUrl')} />
          </Field>
          <Field label="API key" hint="Leave blank to keep the saved key.">
            <div className="flex gap-8">
              <input className="input" type="password" value={form.apiKey} onChange={set('apiKey')} placeholder={form.apiKeySet ? `Key set (${form.apiKeyHint})` : 'gsk_…'} style={{ flex: 1 }} />
              <span className="badge" title="Key status"><KeyRound size={13} /> {form.apiKeySet ? 'set' : 'missing'}</span>
            </div>
          </Field>
        </Card>

        <Card className="pad" title="Generation & pacing" sub="Applied to every AI request">
          <Field label="Temperature" hint="0 = deterministic extraction">
            <input className="input" type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={set('temperature')} />
          </Field>
          <Field label="Max tokens" hint="Upper bound for each extraction reply">
            <input className="input" type="number" min="1" value={form.maxTokens} onChange={set('maxTokens')} />
          </Field>
          <Field label="Pacing tokens per request" hint="Rate-limit budgeting">
            <input className="input" type="number" min="1" value={form.pacingTokensPerRequest} onChange={set('pacingTokensPerRequest')} />
          </Field>
          <Field label="TPM limit" hint="Tokens per minute your tier allows">
            <input className="input" type="number" min="1" value={form.pacingTpmLimit} onChange={set('pacingTpmLimit')} />
          </Field>
          <div className="flex between mt-16"><span className="text-sm">Computed delay between calls</span><span className="mono muted">{pacingMs} ms</span></div>
        </Card>
      </div>

      <Card className="pad mt-24" title="Free usage credit" sub="Daily Groq free-tier token budget — the AI stage stops calling once today's credit is spent (measured from the API's real token usage).">
        <div className="grid cols-2 gap-8">
          <Field label="Enforce daily budget">
            <div className="segmented" style={{ width: '100%' }}>
              <button className={form.usageEnabled ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, usageEnabled: true }))}>on</button>
              <button className={!form.usageEnabled ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, usageEnabled: false }))}>off</button>
            </div>
          </Field>
          <Field label="Daily token budget" hint="Groq llama-3.3-70b free cap = 60,000 tokens/day (llama-3.1-8b = 144,000)">
            <input className="input" type="number" min="0" step="1000" value={form.usageLimitTokens} onChange={set('usageLimitTokens')} />
          </Field>
        </div>

        <div className="mt-16">
          {usage ? (
            <>
              <div className="flex between text-sm mb-8">
                <span className="muted">Used today</span>
                <span className="mono">{usage.usedTokens.toLocaleString()} / {usage.limitTokens > 0 ? usage.limitTokens.toLocaleString() : '∞'} tokens · {usage.calls} call(s)</span>
              </div>
              <div className="usage-bar">
                <div className={usage.percentUsed >= 90 ? 'usage-fill danger' : usage.percentUsed >= 70 ? 'usage-fill warn' : 'usage-fill'} style={{ width: `${usage.percentUsed}%` }} />
              </div>
              {usage.percentUsed >= 90 && (
                <div className="text-sm mt-8" style={{ color: 'var(--error)' }}>Credit nearly spent — the AI stage stops as soon as the budget is hit.</div>
              )}
              <div className="usage-days mt-16">
                {usage.history.slice(-7).map((h) => (
                  <div key={h.date} className="usage-day" title={`${h.date}: ${h.totalTokens.toLocaleString()} tokens, ${h.calls} call(s)`}>
                    <span className="usage-day-bar" style={{ height: `${Math.max(6, Math.min(100, (h.totalTokens / Math.max(1, usage.limitTokens)) * 100))}%` }} />
                    <span className="usage-day-label">{h.date.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="flex between mt-16">
                <span className="text-sm muted">Budget applies per local day and resets automatically. The toggle + budget need "Save changes".</span>
                <Button variant="ghost" icon={RotateCcw} onClick={handleResetUsage} disabled={!usage.calls && usage.usedTokens === 0}>Reset today</Button>
              </div>
            </>
          ) : (
            <div className="flex gap-8"><Gauge size={15} /> Loading usage…</div>
          )}
        </div>
      </Card>

      <Card className="pad mt-24" title="Estimated cost & time per run" sub="AI stage = 1 request per record. Fill in your data volume and rate to size a run.">
        <div className="grid cols-4 gap-8">
          <Field label="Records to analyze">
            <input className="input" type="number" min="1" value={est.records} onChange={(e) => setEst((s) => ({ ...s, records: Math.max(1, +e.target.value || 1) }))} />
          </Field>
          <Field label="Tokens per record">
            <input className="input" type="number" min="1" value={est.tokens} onChange={(e) => setEst((s) => ({ ...s, tokens: Math.max(1, +e.target.value || 1) }))} />
          </Field>
          <Field label="Prompt overhead / request">
            <input className="input" type="number" min="0" value={est.overhead} onChange={(e) => setEst((s) => ({ ...s, overhead: Math.max(0, +e.target.value || 0) }))} />
          </Field>
          <Field label="$ per 1M tokens" hint="0 = free tier">
            <input className="input" type="number" min="0" step="0.01" value={est.priceM} onChange={(e) => setEst((s) => ({ ...s, priceM: Math.max(0, +e.target.value || 0) }))} />
          </Field>
        </div>
        <div className="grid cols-4 mt-16 gap-8">
          <Mini icon={Zap} label="Requests" value={String(est.records)} />
          <Mini icon={Cpu} label="Total tokens" value={estTotalTokens.toLocaleString()} />
          <Mini icon={Clock} label="Est. time" value={estTime} />
          <Mini icon={KeyRound} label="Est. cost" value={est.priceM > 0 ? `$${estCost.toFixed(2)}` : '$0.00 · free tier'} />
        </div>
        <div className="text-sm muted mt-16" style={{ lineHeight: 1.7 }}>
          Time = {est.records} requests × ({estDelayMs} ms pacing delay + {estLatencyMs} ms latency{testResult?.ok ? ' (measured)' : ' (assumed)'}). Tokens = {est.records} × ({est.tokens} record + {est.overhead} prompt).
        </div>
      </Card>

      <Card className="pad mt-24" title="System prompt" sub="Custom instructions replace the built-in Arabic extraction persona. Leave empty for the default.">
        <textarea className="textarea" rows={10} value={form.prompt} onChange={set('prompt')} />
      </Card>

      <div className="grid cols-4 mt-24">
        <Mini icon={Zap} label="Model" value={form.model} />
        <Mini icon={Clock} label="Pacing" value={`${pacingMs} ms`} />
        <Mini icon={Cpu} label="Retries" value="8 (429 backoff)" />
        <Mini icon={KeyRound} label="Key" value={form.apiKeySet ? `set (${form.apiKeyHint})` : 'missing'} />
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value }) {
  return <div className="card stat"><span className="icon"><Icon /></span><span className="label">{label}</span><span className="value" style={{ fontSize: 15 }}>{value}</span></div>;
}
