// Sends a task report with 3 decision buttons (Continue / Wait / Suggest change)
// and watches the bridge inbox for the user's answer. Blocks up to `--timeout`
// ms (default 60_000). Exits with a DECISION= line on stdout:
//   continue | wait | modify | timeout
// On modify, prints the user's suggested change on the next line (MODIFICATION=).
//
// Usage: node scripts/telegram-ask.mjs --title "Job history + log viewer" --body "..." [--timeout 60000]
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { sendTelegram, decisionKeyboard, readInbox, inboxCount } from './telegram-bridge.mjs';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
}

const title = arg('title', 'TerraFlow report');
const bodyFile = arg('body-file', null);
const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8') : arg('body', '');
const timeoutMs = Number(arg('timeout', 60000));
const silent = arg('silent', '0') === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN not set'); process.exit(2); }

  const report = `<b>${title}</b>\n\n${body}\n\n_What next?_`;
  const sent = await sendTelegram(report, { keyboard: decisionKeyboard(), silent });
  const sentMessageId = sent.message_id;
  console.log(`sent msg_id=${sentMessageId}`);

  const startIndex = inboxCount();
  const deadline = Date.now() + timeoutMs;
  let modification = null;

  while (Date.now() < deadline) {
    const entries = readInbox(startIndex);
    for (const e of entries) {
      if (e.kind === 'callback' && (e.messageId === sentMessageId || e.messageText)) {
        const data = e.data;
        if (data === 'continue' || data === 'wait') {
          console.log(`DECISION=${data}`);
          await sendTelegram(data === 'continue' ? 'Continue.' : 'Waiting — I will hold.', { replyTo: sentMessageId });
          process.exit(0);
        }
        if (data === 'modify') {
          console.log('DECISION=modify');
          await sendTelegram('Write your change and I will apply it.', { replyTo: sentMessageId });
          const modDeadline = Date.now() + timeoutMs;
          while (Date.now() < modDeadline) {
            const msgs = readInbox(startIndex);
            for (const m of msgs) {
              // User pressed another button while we waited → respect it.
              if (m.kind === 'callback' && (m.messageId === sentMessageId) && (m.data === 'continue' || m.data === 'wait')) {
                console.log(`DECISION=${m.data}`);
                process.exit(0);
              }
              if (m.kind === 'message' && m.chatId === CHAT_ID && m.text && m.text.trim()) {
                modification = m.text.trim();
                console.log(`MODIFICATION=${modification}`);
                process.exit(0);
              }
            }
            await sleep(2000);
          }
          console.log('MODIFICATION=(none within timeout)');
          process.exit(0);
        }
      }
      // Direct text reply to the report counts as a modification.
      if (e.kind === 'message' && e.chatId === CHAT_ID && (e.replyTo === sentMessageId || (e.text && !modification))) {
        modification = (e.text || '').trim();
        if (modification) {
          console.log(`DECISION=modify\nMODIFICATION=${modification}`);
          process.exit(0);
        }
      }
    }
    await sleep(2000);
  }

  console.log('DECISION=timeout');
  process.exit(0);
}

main().catch((e) => { console.error('ask error:', e.message); process.exit(1); });
