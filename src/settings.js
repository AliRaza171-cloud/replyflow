// ============================================================
//  ReplyFlow — SETTINGS
//  This is the only node you need to edit for a new client.
// ============================================================
const SETTINGS = {
  // --- Business identity (used in the AI prompt) ---
  businessName: 'Smart Click',
  businessDescription: 'an online store in Pakistan selling phone accessories and gadgets',
  tone: 'friendly, warm and professional',
  replyLanguage: 'the same language the customer wrote in',
  signature: 'Best regards,\nSmart Click Support',

  // --- Connections ---
  // The long ID in your Google Sheet URL: docs.google.com/spreadsheets/d/<THIS PART>/edit
  googleSheetId: 'PASTE_GOOGLE_SHEET_ID_HERE',
  // ntfy topic for urgent phone alerts (install the ntfy app and subscribe to this exact name).
  // Make it hard to guess — anyone who knows the name can read the alerts.
  ntfyTopic: 'replyflow-CHANGE-ME-to-something-random',

  // --- AI model (Groq) ---
  // Use a model your Groq account can access (check the model list in the Groq Playground).
  // Tested: 'openai/gpt-oss-120b'. Alternatives: 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'.
  groqModel: 'openai/gpt-oss-120b',

  // --- Auto-send (OFF by default: everything becomes a Gmail draft for approval) ---
  autoSend: {
    enabled: false,
    categories: ['Support'],   // only these categories may ever be sent automatically
    minConfidence: 90          // and only when the AI is at least this confident
  },

  // --- Guardrails: if any of these appear, a person must always approve ---
  humanReviewKeywords: [
    'refund', 'money back', 'chargeback', 'charged twice', 'lawyer', 'legal action',
    'court', 'consumer court', 'discount', 'compensation', 'fraud', 'scam', 'cancel my order'
  ],

  // --- Always mark as urgent if any of these appear ---
  urgentKeywords: [
    'urgent', 'asap', 'immediately', 'charged twice', 'chargeback', 'lawyer', 'legal action',
    'fraud', 'scam', 'never received', 'still not received', 'damaged', 'broken',
    'refund', 'not delivered', 'not arrived', "hasn't arrived", 'still waiting', 'where is my order'
  ],

  // --- Emails to ignore completely (not customers) ---
  ignoreSenders: [
    'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster',
    'notifications@', 'notification@', 'newsletter', 'marketing@', 'news@', 'bounce'
  ],
  ignoreSubjects: [
    'unsubscribe', 'your receipt', 'verification code', 'password reset', 'security alert',
    'delivery status notification', 'out of office', 'automatic reply'
  ],

  // Longest email body sent to the AI (characters). Keeps costs and rate limits low.
  maxBodyChars: 4000
};

return $input.all().map((item, i) => ({
  json: { ...item.json, settings: SETTINGS },
  pairedItem: { item: i }
}));
