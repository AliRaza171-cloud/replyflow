// Builds the importable n8n workflow from the Code node sources in ./src
// Run: node build.js  →  dist/replyflow-email-automation.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = name => fs.readFileSync(path.join(__dirname, 'src', name), 'utf8');
const id = () => crypto.randomUUID();
const SHEET_ID = "={{ $('Settings').first().json.settings.googleSheetId }}";

const col = name => ({
  id: name, displayName: name, required: false, defaultMatch: false,
  display: true, type: 'string', canBeUsedToMatch: true, removed: false
});

const condition = (left, operator, right) => ({
  id: id(),
  leftValue: left,
  rightValue: right === undefined ? '' : right,
  operator
});

const conditionsBlock = conds => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
  conditions: conds,
  combinator: 'and'
});

const AR = "$('Apply rules & route').item.json";

const nodes = [
  {
    id: id(), name: 'Gmail Trigger', type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.2,
    position: [0, 300],
    parameters: {
      pollTimes: { item: [{ mode: 'everyMinute' }] },
      simple: false,
      filters: { q: 'in:inbox -category:promotions -category:social -category:updates -from:me', readStatus: 'unread' },
      options: {}
    }
  },
  {
    id: id(), name: 'Settings', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [220, 300], parameters: { jsCode: src('settings.js') }
  },
  {
    id: id(), name: 'Prepare email', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [440, 300], parameters: { jsCode: src('prepare.js') }
  },
  {
    id: id(), name: 'Load knowledge base', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
    position: [660, 300], executeOnce: true, alwaysOutputData: true,
    parameters: {
      operation: 'read',
      documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
      sheetName: { __rl: true, value: 'Knowledge', mode: 'name' },
      options: {}
    }
  },
  {
    id: id(), name: 'Attach knowledge base', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [880, 300], parameters: { jsCode: src('attachKnowledge.js') }
  },
  {
    id: id(), name: 'Groq: classify & draft', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [1100, 300],
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.aiRequest) }}',
      options: { batching: { batch: { batchSize: 1, batchInterval: 2000 } }, timeout: 60000 }
    }
  },
  {
    id: id(), name: 'Apply rules & route', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1320, 300], parameters: { jsCode: src('applyRules.js') }
  },
  {
    id: id(), name: 'Route by action', type: 'n8n-nodes-base.switch', typeVersion: 3.2,
    position: [1560, 120],
    parameters: {
      rules: {
        values: [
          ['draft', 'Draft for approval'],
          ['autosend', 'Auto-send'],
          ['skip', 'Skip (spam)']
        ].map(([value, label]) => ({
          conditions: conditionsBlock([
            condition('={{ $json.action }}', { type: 'string', operation: 'equals' }, value)
          ]),
          renameOutput: true,
          outputKey: label
        }))
      },
      options: {}
    }
  },
  {
    id: id(), name: 'Create Gmail draft', type: 'n8n-nodes-base.gmail', typeVersion: 2.1,
    position: [1820, -20],
    parameters: {
      resource: 'draft',
      operation: 'create',
      subject: '={{ $json.replySubject }}',
      emailType: 'text',
      message: '={{ $json.replyBody }}',
      options: { threadId: '={{ $json.threadId }}', sendTo: '={{ $json.fromEmail }}' }
    }
  },
  {
    id: id(), name: 'Send reply (auto)', type: 'n8n-nodes-base.gmail', typeVersion: 2.1,
    position: [1820, 140],
    parameters: {
      operation: 'reply',
      messageId: '={{ $json.gmailId }}',
      emailType: 'text',
      message: '={{ $json.replyBody }}',
      options: { appendAttribution: false }
    }
  },
  {
    id: id(), name: 'Ignore (spam)', type: 'n8n-nodes-base.noOp', typeVersion: 1,
    position: [1820, 300], parameters: {}
  },
  {
    id: id(), name: 'Save contact to CRM', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
    position: [2080, 60],
    parameters: {
      operation: 'appendOrUpdate',
      documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
      sheetName: { __rl: true, value: 'Contacts', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          email: `={{ ${AR}.fromEmail }}`,
          name: `={{ ${AR}.customerName }}`,
          company: `={{ ${AR}.company }}`,
          last_category: `={{ ${AR}.category }}`,
          last_subject: `={{ ${AR}.subject }}`,
          last_order_id: `={{ ${AR}.orderId }}`,
          last_contact: `={{ ${AR}.receivedAt }}`
        },
        matchingColumns: ['email'],
        schema: ['email', 'name', 'company', 'last_category', 'last_subject', 'last_order_id', 'last_contact'].map(col)
      },
      options: {}
    }
  },
  {
    id: id(), name: 'Log to sheet', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5,
    position: [1560, 380],
    parameters: {
      operation: 'append',
      documentId: { __rl: true, value: SHEET_ID, mode: 'id' },
      sheetName: { __rl: true, value: 'Log', mode: 'name' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          received_at: '={{ $json.receivedAt }}',
          from_email: '={{ $json.fromEmail }}',
          from_name: '={{ $json.customerName }}',
          subject: '={{ $json.subject }}',
          category: '={{ $json.category }}',
          urgent: "={{ $json.urgent ? 'yes' : 'no' }}",
          sentiment: '={{ $json.sentiment }}',
          confidence: '={{ $json.confidence }}',
          action: '={{ $json.action }}',
          needs_human: '={{ $json.needsHuman }}',
          summary: '={{ $json.summary }}',
          knowledge_used: '={{ $json.knowledgeUsed }}',
          gmail_link: '={{ $json.gmailLink }}'
        },
        matchingColumns: [],
        schema: ['received_at', 'from_email', 'from_name', 'subject', 'category', 'urgent', 'sentiment',
          'confidence', 'action', 'needs_human', 'summary', 'knowledge_used', 'gmail_link'].map(col)
      },
      options: {}
    }
  },
  {
    id: id(), name: 'Is urgent?', type: 'n8n-nodes-base.if', typeVersion: 2.2,
    position: [1560, 580],
    parameters: {
      conditions: conditionsBlock([
        condition('={{ $json.urgent }}', { type: 'boolean', operation: 'true', singleValue: true })
      ]),
      options: {}
    }
  },
  {
    id: id(), name: 'Phone alert (ntfy)', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [1820, 560], onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: "={{ 'https://ntfy.sh/' + $('Settings').first().json.settings.ntfyTopic }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Title', value: 'Urgent customer email' },
          { name: 'Priority', value: 'high' },
          { name: 'Tags', value: 'warning' },
          { name: 'Click', value: '={{ $json.gmailLink }}' }
        ]
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'text/plain',
      body: '={{ $json.alertText }}',
      options: {}
    }
  },
  {
    id: id(), name: 'Note: overview', type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [-40, -260],
    parameters: {
      width: 760, height: 300, color: 4,
      content: [
        '## ReplyFlow — AI email & customer inquiry automation',
        'Every minute: reads new customer emails → filters out newsletters/notifications → Groq classifies (Sales / Support / Complaint / Spam / Other), scores urgency & confidence and drafts a reply from your **Knowledge** sheet → hard guardrails in code → **Gmail draft for approval** (or auto-send if you allow it) → contact saved to **Contacts** → every email logged to **Log** → urgent ones pushed to your phone with **ntfy**.',
        '',
        '**To set up:** edit the **Settings** node (Sheet ID, ntfy topic, Groq model, business details), then attach credentials to: Gmail Trigger, Load knowledge base, Groq (Header Auth), Create Gmail draft, Send reply, Save contact, Log to sheet. Full guide: docs/SETUP.md.'
      ].join('\n')
    }
  },
  {
    id: id(), name: 'Note: safety', type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: [1260, -260],
    parameters: {
      width: 520, height: 300, color: 3,
      content: [
        '## Safety rules (enforced in code)',
        '- Auto-send is **OFF** by default: every reply is a Gmail draft.',
        '- Even with auto-send on, it never fires for refunds, discounts, legal words, angry customers, urgent emails, low confidence, or drafts with [placeholders].',
        '- The AI may only use facts from the Knowledge sheet; missing facts become [PLACEHOLDERS].',
        '- Email text is treated as untrusted data (prompt-injection guard).'
      ].join('\n')
    }
  }
];

const byName = Object.fromEntries(nodes.map(n => [n.name, n]));
const link = (...targets) => [targets.map(t => ({ node: t, type: 'main', index: 0 }))];
const connections = {
  'Gmail Trigger': { main: link('Settings') },
  'Settings': { main: link('Prepare email') },
  'Prepare email': { main: link('Load knowledge base') },
  'Load knowledge base': { main: link('Attach knowledge base') },
  'Attach knowledge base': { main: link('Groq: classify & draft') },
  'Groq: classify & draft': { main: link('Apply rules & route') },
  'Apply rules & route': { main: link('Route by action', 'Log to sheet', 'Is urgent?') },
  'Route by action': {
    main: [
      [{ node: 'Create Gmail draft', type: 'main', index: 0 }],
      [{ node: 'Send reply (auto)', type: 'main', index: 0 }],
      [{ node: 'Ignore (spam)', type: 'main', index: 0 }]
    ]
  },
  'Create Gmail draft': { main: link('Save contact to CRM') },
  'Send reply (auto)': { main: link('Save contact to CRM') },
  'Is urgent?': { main: [[{ node: 'Phone alert (ntfy)', type: 'main', index: 0 }], []] }
};

// sanity: every connection points at a real node
for (const [from, c] of Object.entries(connections)) {
  if (!byName[from]) throw new Error('Unknown source node: ' + from);
  c.main.flat().forEach(t => { if (!byName[t.node]) throw new Error('Unknown target node: ' + t.node); });
}

const workflow = {
  name: 'ReplyFlow — AI Email & Customer Inquiry Automation',
  nodes,
  connections,
  pinData: {},
  active: false,
  settings: { executionOrder: 'v1', saveManualExecutions: true },
  tags: []
};

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', 'replyflow-email-automation.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
console.log('Wrote', out, '-', nodes.length, 'nodes');
