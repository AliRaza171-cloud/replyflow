# ReplyFlow — Setup Guide

ReplyFlow reads a business's incoming customer emails and handles the routine work. It sorts each email into a category, writes a reply from the business's own knowledge base, and puts it in Gmail as a draft for a person to approve. It also saves the customer to a CRM sheet, logs every email, and pushes urgent ones to your phone right away (ntfy).

```
Gmail (new email, checked every minute)
  → Settings
  → Prepare email        cleans the text, removes quoted history, drops newsletters / notifications / promotions
  → Load knowledge base  reads the "Knowledge" tab of the Google Sheet
  → Groq                 classifies + scores urgency/confidence + drafts a reply (JSON)
  → Apply rules & route  code-enforced guardrails decide: draft / auto-send / skip
       ├─ Draft for approval → Gmail draft in the same thread ─┐
       ├─ Auto-send (off by default) → Gmail reply ────────────┴→ Save contact (Contacts tab)
       ├─ Skip (spam)
       ├─ Log to sheet (Log tab, every email)
       └─ Is urgent? → phone push alert (ntfy) — tap it to open the Gmail thread
```

## Files

| File | What it is |
|---|---|
| `dist/replyflow-email-automation.json` | The n8n workflow. Import this into n8n. |
| `dist/replyflow-sheet-template.xlsx` | Google Sheet template with the Knowledge, Contacts and Log tabs. |
| `src/*.js` | Source of the four Code nodes (Settings, Prepare, Attach knowledge, Apply rules). |
| `build.js` | Rebuilds the workflow JSON from `src/`. Run `node build.js`. |
| `test.js` | Runs the Code nodes against 8 sample emails with a mocked n8n runtime. Run `node test.js`. |

---

## Setup (about 45 minutes the first time)

### 1. Run n8n (no Docker needed)

**For development on your laptop**, you need Node.js 20 or 22 LTS:

```bash
npx n8n
```

Open http://localhost:5678 and create the owner account. The workflow only runs while your laptop is on and n8n is running.

**For a client**, use **n8n Cloud** (created in the client's own account) or n8n on a small VPS. Their emails then stay on their infrastructure, and it runs 24/7.

### 2. Create the Google Sheet

1. Upload `replyflow-sheet-template.xlsx` to Google Drive.
2. Open it, then go to **File → Save as Google Sheets**.
3. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/`**`THIS_LONG_PART`**`/edit`
4. Replace the demo rows in the **Knowledge** tab with the client's real policies, prices and FAQs. **Don't rename the tabs or change row 1.**

### 3. Import the workflow

In n8n, go to **Workflows → Add workflow → ⋯ menu → Import from file** and choose `replyflow-email-automation.json`.

### 4. Add credentials

Nodes with a red warning need a credential.

**Google (Gmail + Google Sheets)**
- On **n8n Cloud**, click *Sign in with Google* in the credential window. That's it.
- On **local or self-hosted n8n**:
  1. Go to Google Cloud Console and create a project.
  2. Enable the **Gmail API** and the **Google Sheets API**.
  3. Set up the OAuth consent screen: choose *External*, then add your Gmail address as a test user.
  4. Go to **Credentials → Create OAuth client ID → Web application**. Paste the *OAuth Redirect URL* shown in n8n's credential window.
  5. Copy the Client ID and Client Secret into n8n's **Gmail OAuth2** and **Google Sheets OAuth2** credentials.
- Use the Gmail credential on: *Gmail Trigger*, *Create Gmail draft*, *Send reply (auto)*.
- Use the Sheets credential on: *Load knowledge base*, *Save contact to CRM*, *Log to sheet*.

**Groq (AI)**
1. Go to https://console.groq.com, open **API Keys**, and create a key (it starts with `gsk_`).
2. In the *Groq: classify & draft* node, create a **Header Auth** credential:
   - Name: `Authorization`
   - Value: `Bearer gsk_your_key_here` (keep the word `Bearer` and the space)

**Phone alerts (ntfy — free, no account)**
1. Install the **ntfy** app (Android / iOS).
2. Tap **+ → Subscribe to topic**, server **ntfy.sh**, and pick a topic name that's hard to guess, e.g. `replyflow-yourname-k3x91p`. Anyone who knows the name can read the alerts.
3. Test from a browser: `https://ntfy.sh/<your-topic>/publish?message=test` — your phone should ring.
4. Put the same topic name in the Settings node (`ntfyTopic`). No credential is needed.
5. Android: allow ntfy notifications and set its battery usage to **Unrestricted**, or alerts can arrive late.

Prefer email or WhatsApp? The node *Phone alert (ntfy)* can be swapped for a Gmail "Send a message" node (use `{{ $json.alertHtml }}` as an HTML body) or the official WhatsApp Business Cloud node (Premium clients).

### 5. Edit the Settings node

Open **Settings** and fill in:
- `googleSheetId` and `ntfyTopic`
- `businessName`, `businessDescription`, `tone`, `signature`
- `groqModel`: a model your Groq account can use. Check the model dropdown in the Groq **Playground**. Tested with `openai/gpt-oss-120b`.
- Optionally the guardrail keyword lists and `autoSend`

### 6. Test

From a **different** email account, send the test emails below to the connected Gmail. Then click **Test workflow** in n8n. Check that:
- Gmail has a draft reply inside each customer's thread.
- The **Log** and **Contacts** tabs have new rows.
- Your phone got an ntfy alert for the urgent ones.

| Send this | Expected result |
|---|---|
| Subject "Order #1234 still not here" — *"I ordered 9 days ago and tracking hasn't moved. I need it by Friday or I want a refund."* | Complaint, **urgent**, draft (refund guardrail), phone alert |
| Subject "Bulk order" — *"Do you offer wholesale pricing for 200 phone stands?"* | Sales, draft that uses the Wholesale entry |
| Subject "Delivery time" — *"How long does delivery to Islamabad take?"* | Support, high confidence, draft (auto-send candidate) |
| Subject "Do you ship to Dubai?" | Low confidence, `[PLACEHOLDER]` in the draft, since it's not in the knowledge base |
| Subject "Rank #1 on Google" — an SEO sales pitch | Spam, skipped (logged only) |

### 7. Turn it on

Toggle the workflow to **Active** (newer n8n versions call this **Publish**). It then checks Gmail every minute.

---

## How the safety works

- **Auto-send is off by default.** Every reply is a draft that a person sends from Gmail.
- If you set `autoSend.enabled: true`, a reply is sent automatically **only** when all of these are true:
  - its category is in `autoSend.categories`
  - confidence is at least `autoSend.minConfidence`
  - it isn't urgent
  - the customer isn't angry
  - no guardrail keyword appears (refund, discount, legal, chargeback, and so on)
  - the draft has no `[placeholders]`
  - the AI raised no concern
- These checks run **in code after the AI**, so a strange AI answer or a prompt-injection email can't bypass them.
- The AI may only use facts from the Knowledge tab. When something is missing, it writes `[WHAT'S MISSING]`, and the Log shows which questions need new knowledge rows.
- If Groq fails (rate limit, outage), the email still gets a draft that says *write your reply here*, is logged, and is still alerted if it looks urgent. Nothing is silently lost.
- Emails stay **unread** in Gmail, so the team still sees them as new.

## Customising for Fiverr packages

| Package | Change |
|---|---|
| Basic | Use as is; phone alerts optional (disable that node). |
| Standard | Knowledge base filled with the client's documents, plus CRM sheet and phone/Slack/email alerts. For Slack, replace the ntfy node with n8n's Slack node using `{{ $json.alertText }}`. |
| Premium | Swap the Contacts sheet for HubSpot (HubSpot node → *Create or update contact*). Add a Shopify/WooCommerce order lookup before the Groq node. Turn on auto-send for Support. Add a weekly report workflow that reads the Log tab. |

## Troubleshooting

- **Groq error 429 (rate limit):** the free tier has per-minute limits. The workflow already sends one request every 2 seconds and retries 3 times. For busy inboxes, use a paid Groq plan or `llama-3.1-8b-instant`.
- **Groq error 404 `model_not_found`:** your key works, but that model isn't available to your account (or was retired). Open the Groq Playground, copy an ID from the model dropdown, and put it in `groqModel`.
- **Draft says "the AI could not draft this one":** open the *Groq* node's output in the last execution to see the real error.
- **Phone alert not arriving:** the ntfy node must use **POST** (GET only returns the ntfy web page). Check the topic matches the app exactly, and that Android isn't battery-limiting ntfy.
- **Google sign-in disconnects after 7 days:** your Google app is in *Testing*. In Google Cloud → Google Auth Platform → Audience, click **Publish app**.
- **"Sheet with name … not found":** a tab was renamed. The workflow needs `Knowledge`, `Contacts` and `Log` exactly.
- **Nothing happens on test:** the Gmail Trigger only picks up *unread* inbox emails that aren't in Promotions, Social or Updates. Send from a real personal address, not a newsletter tool.
- **Draft not in the thread:** make sure *Create Gmail draft* still has `Thread ID = {{ $json.threadId }}` under Options.

## Known limits (v1)

- Gmail only. Outlook/Microsoft 365 needs the Outlook trigger and node instead.
- Attachments are ignored, and image-only emails are skipped.
- One inbox per workflow. Duplicate the workflow for a second inbox.
