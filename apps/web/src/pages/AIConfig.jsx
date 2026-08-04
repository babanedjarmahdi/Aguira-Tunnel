import { Sparkles, Zap, Clock, Cpu, ShieldCheck } from 'lucide-react';
import { usePoll, getConfig } from '../api';
import { Card, Field, Button, Toggle, Progress, useToast, Badge } from '../components/ui';

export default function AIConfig() {
  const toast = useToast();
  const { data: config } = usePoll(getConfig, 5000);
  const sysPrompt = config?.ai?.systemPrompt || '';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">AI configuration</h1>
          <p className="page-sub">Provider, model, prompt and pacing for the AI analysis stage.</p>
        </div>
        <Button variant="primary" icon={Sparkles} onClick={() => toast('Config saved (server restart applies .env changes)')}>Save changes</Button>
      </div>

      <div className="grid cols-2">
        <Card className="pad" title="Provider & model" sub="Current runtime values">
          <Field label="Provider">
            <div className="segmented" style={{ width: '100%' }}>
              <button className="on">groq</button>
              <button disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}>openrouter</button>
              <button disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}>local</button>
            </div>
          </Field>
          <Field label="Model">
            <input className="input" defaultValue={config?.ai?.model || 'llama-3.3-70b-versatile'} />
          </Field>
          <Field label="API base" hint="Only groq is enabled in v0.4; more providers land next.">
            <input className="input" defaultValue={config?.ai?.baseUrl || 'https://api.groq.com/openai/v1'} />
          </Field>
        </Card>

        <Card className="pad" title="Runtime" sub="Resume-safety and pacing defaults">
          <div className="flex between mb-16"><span className="text-sm">Max retries</span><span className="mono muted">5</span></div>
          <div className="flex between mb-16"><span className="text-sm">Retry on HTTP 429</span><Badge tone="ok">enabled</Badge></div>
          <div className="flex between mb-16"><span className="text-sm">Resume-safe cache</span><Badge tone="ok">enabled</Badge></div>
          <Field label="Pacing (ms between requests)" hint="Free-tier rate-limit friendly.">
            <input className="input" type="number" defaultValue={250} />
          </Field>
          <div className="flex gap-8 mt-16">
            <Toggle checked label="Pause on 429 (backoff)" />
          </div>
        </Card>
      </div>

      <Card className="pad mt-24" title="System prompt" sub="The persona handed to the model for every analysis">
        <textarea className="textarea" defaultValue={sysPrompt || '# TerraFlow AI\nYou structure real-estate placemarks into JSON…\n'} />
      </Card>

      <div className="grid cols-4 mt-24">
        <Mini icon={Zap} label="Model" value="llama-3.3-70b" />
        <Mini icon={Clock} label="Pacing" value="~250ms" />
        <Mini icon={Cpu} label="Retries" value="5" />
        <Mini icon={ShieldCheck} label="Mode" value="resume-safe" />
      </div>

      <div className="mt-24">
        <Card className="pad" title="Confidence thresholds">
          <div className="conf-row"><span className="f">Name / title</span><Progress value={96} /><span className="f mono">≥ 90%</span></div>
          <div className="conf-row"><span className="f">Price (DA)</span><Progress value={92} /><span className="f mono">≥ 85%</span></div>
          <div className="conf-row"><span className="f">Area (m²)</span><Progress value={94} /><span className="f mono">≥ 85%</span></div>
        </Card>
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value }) {
  return <div className="card stat"><span className="icon"><Icon /></span><span className="label">{label}</span><span className="value" style={{ fontSize: 18 }}>{value}</span></div>;
}
