from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

wb = Workbook()
F = "Arial"
head_font = Font(name=F, bold=True, color="FFFFFF", size=11)
head_fill = PatternFill("solid", fgColor="4338CA")
body_font = Font(name=F, size=10)
input_fill = PatternFill("solid", fgColor="FFF9DB")
thin = Side(style="thin", color="E5E7EB")
border = Border(bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")

def header(ws, cols, widths):
    for i, (c, w) in enumerate(zip(cols, widths), start=1):
        cell = ws.cell(row=1, column=i, value=c)
        cell.font, cell.fill = head_font, head_fill
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[cell.column_letter].width = w
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"

# ---------- How to use ----------
ws = wb.active
ws.title = "How to use"
ws.column_dimensions["A"].width = 24
ws.column_dimensions["B"].width = 95
rows = [
    ("ReplyFlow — Google Sheet template", ""),
    ("", ""),
    ("Tab", "What it does"),
    ("Knowledge", "YOU EDIT THIS. Every row is a fact the AI is allowed to use in replies. Column A = topic, column B = the answer. The AI will never state a price, policy or promise that is not here — it writes a [PLACEHOLDER] instead."),
    ("Contacts", "Filled automatically (your mini CRM). One row per customer email address, updated every time they write."),
    ("Log", "Filled automatically. One row per processed email: category, urgency, confidence, what happened. Use it for the weekly report."),
    ("", ""),
    ("Important", "Keep the tab names and the header row (row 1) exactly as they are — the n8n workflow finds columns by these names."),
    ("Example rows", "The Knowledge rows are DEMO answers for the Smart Click store. Replace every one with the client's real policies before going live."),
    ("Yellow cells", "Cells shaded yellow are the ones to edit."),
    ("Tips", "Write answers the way you'd explain them to a new staff member: short, specific, with real numbers. Add a row whenever the dashboard/Log shows the same [PLACEHOLDER] question coming up."),
]
for r, (a, b) in enumerate(rows, start=1):
    ws.cell(row=r, column=1, value=a).font = Font(name=F, size=10, bold=bool(a) and r != 1)
    ws.cell(row=r, column=2, value=b).font = body_font
    ws.cell(row=r, column=2).alignment = wrap
ws["A1"].font = Font(name=F, size=16, bold=True, color="3730A3")
for c in ("A3", "B3"):
    ws[c].font = head_font; ws[c].fill = head_fill

# ---------- Knowledge ----------
ws = wb.create_sheet("Knowledge")
header(ws, ["topic", "answer"], [30, 110])
kb = [
    ("Shipping policy", "Nationwide delivery in 2–5 working days (major cities usually 2–3). Orders placed before 2 PM ship the same working day. Shipping is free on orders over Rs 3,000; otherwise Rs 250."),
    ("Order tracking", "A tracking link is emailed and sent by SMS as soon as the order ships. Customers can also track on our website under 'Track order' with their order number."),
    ("Refund & return policy", "Unused items in original packaging can be returned within 7 days of delivery for a full refund. Damaged or wrong items are replaced or refunded free of charge — the customer should send a photo. Refunds reach the customer in 5–7 working days after we receive the item. Refunds are always confirmed by a staff member."),
    ("Order changes & cancellations", "Address or item changes and cancellations are possible until the order ships. After shipping, the order can't be changed; the customer can refuse delivery or return it."),
    ("Payment methods", "We accept cash on delivery (orders under Rs 25,000), debit/credit cards and bank transfer."),
    ("Payment problems", "If a customer was charged twice, the team checks the payment and refunds the duplicate the same working day once confirmed. Always apologise and confirm the order number."),
    ("Wholesale & bulk orders", "Wholesale pricing is available from 50 units. Bulk orders are delivered in 3–5 working days after confirmation. A sales team member sends a formal quote."),
    ("Warranty", "Electronics come with a 6-month warranty against manufacturing defects. Physical damage and water damage are not covered."),
    ("Business hours & contact", "Customer support replies Monday to Saturday, 10 AM – 7 PM (PKT). WhatsApp support: [YOUR WHATSAPP NUMBER]."),
    ("Partnerships & influencers", "Influencer and agency proposals are forwarded to the marketing lead. Ask for a media kit and typical rates."),
]
for r, (t, a) in enumerate(kb, start=2):
    for c, v in ((1, t), (2, a)):
        cell = ws.cell(row=r, column=c, value=v)
        cell.font, cell.alignment, cell.fill, cell.border = body_font, wrap, input_fill, border
# light-shade some empty rows for new entries
for r in range(len(kb) + 2, len(kb) + 12):
    for c in (1, 2):
        ws.cell(row=r, column=c).fill = input_fill

# ---------- Contacts ----------
ws = wb.create_sheet("Contacts")
header(ws, ["email", "name", "company", "last_category", "last_subject", "last_order_id", "last_contact"],
       [32, 22, 22, 15, 45, 16, 24])

# ---------- Log ----------
ws = wb.create_sheet("Log")
header(ws, ["received_at", "from_email", "from_name", "subject", "category", "urgent", "sentiment",
            "confidence", "action", "needs_human", "summary", "knowledge_used", "gmail_link"],
       [22, 30, 20, 40, 12, 9, 12, 11, 11, 40, 50, 30, 40])

for s in wb.worksheets:
    s.sheet_view.showGridLines = s.title != "How to use"
out = "/home/claude/replyflow/dist/replyflow-sheet-template.xlsx"
wb.save(out)
print("saved", out)
