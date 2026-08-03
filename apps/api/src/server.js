import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import express from 'express';
import { runPipeline, createEmitter, loadConfig } from '@terraflow/engine';
import { createDb } from '@terraflow/database';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const EVENT_NAMES = [
  'log',
  'stage:start',
  'stage:progress',
  'stage:end',
  'stage:error',
  'pipeline:complete',
  'pipeline:error',
];

// ---- Pipeline job service -------------------------------------------------
// Runs the engine in the background and fans its structured events out to
// SSE subscribers. The engine stays UI-agnostic; this is the only adapter.
class PipelineService {
  constructor(env) {
    this.env = env;
    this.events = new EventEmitter();
    this.history = [];
    this.state = {
      running: false,
      stages: [],
      startedAt: null,
      finishedAt: null,
      lastError: null,
      results: null,
    };
  }

  broadcast(name, payload) {
    const entry = { type: name, payload, ts: new Date().toISOString() };
    this.history.push(entry);
    if (this.history.length > 5000) this.history.shift();
    this.events.emit(name, entry);
  }

  start(stages = ['extract', 'ai', 'db', 'fill']) {
    if (this.state.running) return false;
    this.state.running = true;
    this.state.stages = stages;
    this.state.startedAt = new Date().toISOString();
    this.state.finishedAt = null;
    this.state.lastError = null;
    this.state.results = null;

    const emitter = createEmitter();
    for (const n of EVENT_NAMES) {
      emitter.on(n, (payload) => this.broadcast(n, payload));
    }
    this.broadcast('job:start', { stages });

    runPipeline({ stages, env: this.env, emitter })
      .then(({ results, summary }) => {
        this.state.running = false;
        this.state.finishedAt = new Date().toISOString();
        this.state.results = { summary, perStage: results };
        this.broadcast('job:end', { summary });
      })
      .catch((err) => {
        this.state.running = false;
        this.state.finishedAt = new Date().toISOString();
        this.state.lastError = String(err && (err.stack || err.message) || err);
        this.broadcast('job:error', { error: this.state.lastError });
      });
    return true;
  }
}

const service = new PipelineService(process.env);
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', async (req, res) => {
  let db = 'down';
  const client = createDb(process.env);
  try {
    await client.connect();
    await client.query('SELECT 1');
    db = 'up';
  } catch {
    db = 'down';
  } finally {
    await client.end().catch(() => {});
  }
  res.json({ status: 'ok', db, time: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const c = loadConfig(process.env);
  res.json({
    sourceKmzDir: c.sourceKmzDir,
    doneKmzDir: c.doneKmzDir,
    templatePath: c.templatePath,
    originalPath: c.originalPath,
    excelOutputPath: c.excelOutputPath,
    ai: { provider: c.ai.provider, model: c.ai.model },
    db: {
      host: c.db.PGHOST || 'localhost',
      port: Number(c.db.PGPORT || 5432),
      database: c.db.PGDATABASE || 'terraflow',
    },
  });
});

app.get('/api/status', (req, res) => {
  res.json(service.state);
});

// SSE: replay buffered events, then stream live events.
app.get('/api/pipeline/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');
  for (const entry of service.history) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }
  const listeners = {};
  for (const n of EVENT_NAMES) {
    listeners[n] = (entry) => res.write(`data: ${JSON.stringify(entry)}\n\n`);
    service.events.on(n, listeners[n]);
  }
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    for (const n of EVENT_NAMES) service.events.removeListener(n, listeners[n]);
  });
});

app.post('/api/pipeline', (req, res) => {
  const stages = Array.isArray(req.body?.stages) && req.body.stages.length
    ? req.body.stages
    : ['extract', 'ai', 'db', 'fill'];
  const started = service.start(stages);
  if (!started) return res.status(409).json({ error: 'Pipeline already running' });
  res.status(202).json({ status: 'started', stages, id: service.state.startedAt });
});

app.get('/api/properties', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const client = createDb(process.env);
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT id, source_file, placemark_idx, name, area_m2, property_type, status, location,
              price, price_note, owner_name, owner_phone, lat, lon, created_at
       FROM properties ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    await client.end().catch(() => {});
  }
});

app.use((req, res) => res.status(404).json({ error: `No route: ${req.method} ${req.path}` }));

app.listen(PORT, () => {
  console.log(`TerraFlow API listening on http://localhost:${PORT}`);
  console.log(`  GET  /api/health | /api/config | /api/status | /api/properties`);
  console.log(`  GET  /api/pipeline/events  (SSE)`);
  console.log(`  POST /api/pipeline`);
});
