// ============================================================
//  Prepare email: clean the email and drop anything that is not
//  a real customer message (newsletters, notifications, bounces).
//  Emails that are dropped here never reach the AI, which saves
//  API cost and keeps the inbox log clean.
// ============================================================

const NOISE_LABELS = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'SPAM', 'DRAFT', 'SENT'];

function parseFrom(json) {
  // Gmail Trigger with "Simplify" OFF gives { from: { value: [{ address, name }] } }
  const v = json.from && json.from.value && json.from.value[0];
  if (v && v.address) return { email: String(v.address).toLowerCase(), name: v.name || '' };
  // Simplified output gives "From": "Name <email@x.com>"
  const raw = String(json.From || (json.from && json.from.text) || json.from || '');
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() };
  return { email: raw.trim().toLowerCase(), name: '' };
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function cleanBody(text, max) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  // Cut the quoted previous conversation
  const cutPatterns = [
    /\n\s*On .{5,200}wrote:\s*\n/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*From:\s.+\n\s*Sent:\s/i,
    /\n\s*_{5,}\s*\n\s*From:/i
  ];
  for (const p of cutPatterns) {
    const m = t.match(p);
    if (m && m.index > 0) t = t.slice(0, m.index);
  }
  t = t.split('\n').filter(line => !/^\s*>/.test(line)).join('\n');
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > max) t = t.slice(0, max) + '\n[...email shortened]';
  return t;
}

function headerValue(headers, name) {
  if (!headers) return '';
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : '';
}

const out = [];
$input.all().forEach((item, i) => {
  const j = item.json;
  const s = j.settings;
  const from = parseFrom(j);
  const subject = String(j.subject || j.Subject || '(no subject)').trim();
  const rawText = j.text || (j.html ? htmlToText(j.html) : '') || j.snippet || '';
  const body = cleanBody(rawText, s.maxBodyChars);
  const labels = j.labelIds || [];
  const headers = j.headers || {};

  const senderLower = from.email;
  const subjectLower = subject.toLowerCase();
  const isNoise =
    !from.email ||
    !body ||
    labels.some(l => NOISE_LABELS.includes(l)) ||
    s.ignoreSenders.some(x => senderLower.includes(x.toLowerCase())) ||
    s.ignoreSubjects.some(x => subjectLower.includes(x.toLowerCase())) ||
    headerValue(headers, 'list-unsubscribe') !== '' ||
    /(^|:\s*)(bulk|list|junk)\b/i.test(headerValue(headers, 'precedence')) ||
    /(^|:\s*)auto-(generated|replied)/i.test(headerValue(headers, 'auto-submitted'));

  if (isNoise) return; // dropped: not a customer email

  out.push({
    json: {
      settings: s,
      gmailId: j.id,
      threadId: j.threadId || j.id,
      fromEmail: from.email,
      fromName: from.name,
      subject,
      body,
      receivedAt: j.date ? new Date(j.date).toISOString() : new Date().toISOString()
    },
    pairedItem: { item: i }
  });
});

return out;
