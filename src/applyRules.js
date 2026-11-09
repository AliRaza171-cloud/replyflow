// ============================================================
//  Apply rules & route.
//  Reads the AI answer, double-checks it with hard guardrails,
//  and decides what happens: draft for approval, auto-send, or skip.
//  The code always wins over the AI: a refund mention, an angry
//  customer or a placeholder in the draft can never be auto-sent.
// ============================================================

const CATEGORIES = ['Sales', 'Support', 'Complaint', 'Spam', 'Other'];
const SENTIMENTS = ['Positive', 'Neutral', 'Frustrated', 'Angry'];

function parseAiJson(content) {
  if (!content || typeof content !== 'string') return null;
  const attempts = [content];
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1]);
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(content.slice(first, last + 1));
  for (const a of attempts) {
    try {
      const v = JSON.parse(a);
      if (v && typeof v === 'object') return v;
    } catch (err) { /* try the next form */ }
  }
  return null;
}

function pick(value, allowed, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return allowed.find(a => a.toLowerCase() === v) || fallback;
}

function escapeHtml(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function firstName(name, email) {
  const n = String(name || '').trim().split(/\s+/)[0];
  if (n) return n;
  return '';
}

const emails = $('Attach knowledge base').all();

return $input.all().map((res, i) => {
  const email = emails[i].json;
  const s = email.settings;
  const r = res.json || {};

  const content = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  let ai = parseAiJson(content);
  let aiProblem = '';
  if (!ai) {
    aiProblem = r.error ? 'AI request failed — reply manually' : 'AI answer could not be read — reply manually';
    ai = {};
  }

  const category = aiProblem ? 'Other' : pick(ai.category, CATEGORIES, 'Other');
  const sentiment = pick(ai.sentiment, SENTIMENTS, 'Neutral');
  let confidence = parseInt(ai.confidence, 10);
  if (isNaN(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(100, confidence));

  const customerName = String(ai.customer_name || email.fromName || '').trim();
  let reply = String(ai.reply_body || '').trim();
  if (!reply) {
    const hi = firstName(customerName) ? `Hi ${firstName(customerName)},` : 'Hi,';
    reply = `${hi}\n\n[WRITE YOUR REPLY HERE — the AI could not draft this one]\n\n${s.signature}`;
  }

  // ---------- Guardrails (code-enforced, the AI cannot override) ----------
  const reasons = [];
  if (aiProblem) reasons.push(aiProblem);
  if (ai.needs_human_reason) reasons.push(String(ai.needs_human_reason).trim());

  const scanText = `${email.subject}\n${email.body}\n${reply}`.toLowerCase();
  const reviewHits = s.humanReviewKeywords.filter(k => scanText.includes(k.toLowerCase()));
  if (reviewHits.length) reasons.push(`Mentions ${reviewHits.slice(0, 3).join(', ')}`);
  if (/\[[^\]\n]{2,80}\]/.test(reply)) reasons.push('Draft has [placeholders] to fill in');
  if (sentiment === 'Angry') reasons.push('Customer sounds angry');

  const urgentHits = s.urgentKeywords.filter(k => `${email.subject}\n${email.body}`.toLowerCase().includes(k.toLowerCase()));
  const urgent = category !== 'Spam' && (ai.urgent === true || String(ai.urgent).toLowerCase() === 'true' || urgentHits.length > 0 || sentiment === 'Angry');

  const auto = s.autoSend || {};
  const canAutoSend =
    auto.enabled === true &&
    (auto.categories || []).includes(category) &&
    confidence >= (auto.minConfidence || 101) &&
    reasons.length === 0 &&
    !urgent;

  let action = 'draft';
  if (category === 'Spam') action = 'skip';
  else if (canAutoSend) action = 'autosend';

  const uniqueReasons = [...new Set(reasons.filter(Boolean))];
  const replySubject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`;

  // Plain-text alert (ntfy push notification / WhatsApp / email)
  const alertText = [
    `From: ${customerName || email.fromEmail} (${email.fromEmail})`,
    `Subject: ${email.subject}`,
    `Type: ${category} · ${sentiment}`,
    ai.summary ? `Summary: ${ai.summary}` : '',
    uniqueReasons.length ? `Check before sending: ${uniqueReasons.join('; ')}` : '',
    action === 'autosend' ? 'Reply was sent automatically.' : 'An AI draft reply is waiting in Gmail.'
  ].filter(Boolean).join('\n');

  // HTML version (for an email alert or Telegram, if used)
  const alertHtml = [
    '<b>Urgent customer email</b>',
    `<b>From:</b> ${escapeHtml(customerName || email.fromEmail)} (${escapeHtml(email.fromEmail)})`,
    `<b>Subject:</b> ${escapeHtml(email.subject)}`,
    `<b>Type:</b> ${category} · ${sentiment}`,
    ai.summary ? `<b>Summary:</b> ${escapeHtml(ai.summary)}` : '',
    uniqueReasons.length ? `<b>Check before sending:</b> ${escapeHtml(uniqueReasons.join('; '))}` : '',
    `<a href="${gmailLink}">Open in Gmail</a>`
  ].filter(Boolean).join('<br>');

  return {
    json: {
      gmailId: email.gmailId,
      threadId: email.threadId,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      customerName,
      company: String(ai.company || '').trim(),
      orderId: String(ai.order_id || '').trim(),
      subject: email.subject,
      receivedAt: email.receivedAt,
      category,
      sentiment,
      urgent,
      confidence,
      language: String(ai.language || '').trim(),
      summary: String(ai.summary || '').trim(),
      knowledgeUsed: Array.isArray(ai.knowledge_used) ? ai.knowledge_used.join(', ') : '',
      needsHuman: uniqueReasons.join('; '),
      action,
      replySubject,
      replyBody: reply,
      gmailLink,
      alertText,
      alertHtml,
      processedAt: new Date().toISOString()
    },
    pairedItem: { item: i }
  };
});
