// Telegram bridge: long-polls the bot for incoming messages AND inline-button
// presses (callback_query) and appends them to output/telegram/inbox.jsonl so
// the CLI session can read and answer them. Also sends job notifications and
// task reports with 3 decision buttons (Continue / Wait / Suggest change).
// Credentials come from .env (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INBOX_DIR = path.join(ROOT, 'output', 'telegram');
const INBOX_FILE = path.join(INBOX_DIR, 'inbox.jsonl');
const STATE_FILE = path.join(INBOX_DIR, 'state.json');

const API = 'https://api.telegram.org';

async function call(method, payload = {}) {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.description || `Telegram ${method} ${res.status}`);
  return json.result;
}

export async function sendTelegram(text, opts = {}) {
  if (!TOKEN) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  const payload = {
    chat_id: opts.chatId || CHAT_ID,
    text,
    disable_web_page_preview: true,
  };
  if (opts.keyboard) payload.reply_markup = { inline_keyboard: opts.keyboard };
  if (opts.silent) payload.disable_notification = true;
  if (opts.replyTo) payload.reply_to_message_id = opts.replyTo;
  return call('sendMessage', payload);
}

// The 3 decision buttons every task report carries.
export function decisionKeyboard() {
  return [
    [{ text: 'اكمل', callback_data: 'continue' }],
    [{ text: 'انتظر', callback_data: 'wait' }],
    [{ text: 'اقتراح تعديل', callback_data: 'modify' }],
  ];
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { offset: 0 }; }
}

function append(entry) {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.appendFileSync(INBOX_FILE, JSON.stringify({ date: new Date().toISOString(), ...entry }) + '\n', 'utf8');
}

async function pollOnce(offset) {
  const json = await call('getUpdates', {
    timeout: 30,
    offset,
    allowed_updates: ['message', 'callback_query'],
  });
  let next = offset;
  for (const u of json || []) {
    next = Math.max(next, u.update_id + 1);
    if (u.message) {
      const m = u.message;
      const text = m.text || m.caption || '';
      if (m.chat?.id === CHAT_ID && (text || m.sticker)) {
        append({
          kind: 'message',
          messageId: m.message_id,
          chatId: m.chat.id,
          from: m.from?.first_name || null,
          username: m.from?.username || null,
          text,
          replyTo: m.reply_to_message?.message_id || null,
          raw: m,
        });
      }
    } else if (u.callback_query) {
      const cq = u.callback_query;
      const msg = cq.message || {};
      append({
        kind: 'callback',
        callbackId: cq.id,
        messageId: msg.message_id || null,
        chatId: msg.chat?.id || CHAT_ID,
        from: cq.from?.first_name || null,
        username: cq.from?.username || null,
        data: cq.data || null,
        messageText: msg.text || null,
        raw: cq,
      });
      // Acknowledge so the button's loading spinner stops on the user's device.
      call('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
    }
  }
  if (next !== offset) fs.writeFileSync(STATE_FILE, JSON.stringify({ offset: next }), 'utf8');
  return next;
}

export function readInbox(fromIndex = 0) {
  try {
    const lines = fs.readFileSync(INBOX_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.slice(fromIndex).map((l) => JSON.parse(l));
  } catch { return []; }
}

export function inboxCount() {
  try { return fs.readFileSync(INBOX_FILE, 'utf8').split('\n').filter(Boolean).length; }
  catch { return 0; }
}

async function main() {
  if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN missing in .env'); process.exit(1); }
  let offset = loadState().offset;
  console.log(`Telegram bridge running (@mhdnyxorbot) → ${INBOX_FILE} (offset ${offset})`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { offset = await pollOnce(offset); }
    catch (e) { console.error('bridge error:', e.message); await new Promise((r) => setTimeout(r, 5000)); }
  }
}

// Start polling without blocking the caller (used when the API server imports
// this module so the bridge runs alongside it).
export function startBridge() {
  if (!TOKEN) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  main().catch((e) => console.error('telegram bridge crashed:', e.message));
  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
