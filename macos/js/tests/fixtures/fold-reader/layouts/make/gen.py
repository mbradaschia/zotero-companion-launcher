# Synthetic two-column papers (made-up words only), drawn with reportlab, for FoldMake's layout tests.
# usage: gen.py OUT.pdf MODE (MODE: ieee, elsevier or unheaded); OUT.pdf.abstract.txt gets the abstract drawn
import sys, random
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth
random.seed(11)
W, H = 612, 792
GAP = 14.45
L0, L1 = 54, (W - GAP) / 2
R0, R1 = L1 + GAP, W - 54
out, MODE = sys.argv[1], sys.argv[2]
words = "folding reader level paragraph claim sentence model summary column method result analysis evidence reading layout heading caption figure table section measure value study system design approach".split()
def sent(n=None):
    n = n or random.randint(8, 16)
    w = [random.choice(words) for _ in range(n)]
    w[0] = w[0].capitalize()
    return " ".join(w) + "."
c = canvas.Canvas(out, pagesize=(W, H))
FONT, BOLD, IT, BI = "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"
st = {"page": 1, "col": 0, "y": 0, "top": 0, "span": False}
def bounds():
    if st["span"]: return (L0, R1)
    return (L0, L1) if st["col"] == 0 else (R0, R1)
def head_foot():
    c.setFont(FONT, 8); c.drawCentredString(W / 2, H - 40, "MADE-UP JOURNAL OF FOLDING STUDIES, VOL. 1, 2026")
def newcol():
    if st["col"] == 0:
        st["col"] = 1; st["y"] = st["top"]
    else:
        c.setFont(FONT, 9); c.drawCentredString(W / 2, 40, str(st["page"]))
        c.showPage(); st["page"] += 1; st["col"] = 0; st["top"] = 72; st["y"] = 72; head_foot()
def justify(ws, fonts, size, x0, x1, y, last):
    widths = [stringWidth(w, f, size) for w, f in zip(ws, fonts)]
    space = stringWidth(" ", FONT, size) if last or len(ws) == 1 else (x1 - x0 - sum(widths)) / (len(ws) - 1)
    x = x0
    for w, f, wd in zip(ws, fonts, widths):
        c.setFont(f, size); c.drawString(x, H - y, w); x += wd + space
def para(text, size=10, font=FONT, indent=10, lead=None, leadfont=BOLD):
    ws = text.split(); fs = [font] * len(ws)
    if lead: ws = [lead] + ws; fs = [leadfont] + fs
    first = True
    while ws:
        x0, x1 = bounds(); xs = x0 + (indent if first else 0)
        n = 0
        while n < len(ws) and (n == 0 or sum(stringWidth(w, f, size) for w, f in zip(ws[:n + 1], fs[:n + 1])) + stringWidth(" ", font, size) * n <= x1 - xs): n += 1
        line, lf = ws[:n], fs[:n]; ws, fs = ws[n:], fs[n:]
        if not st["span"] and st["y"] + size * 1.2 > H - 70: newcol(); x0, x1 = bounds(); xs = x0 + (indent if first else 0)
        st["y"] += size * 1.2
        justify(line, lf, size, xs, x1, st["y"], not ws)
        first = False
def heading(t, font=FONT, size=10, centred=True, gap=8):
    st["y"] += gap
    if st["y"] + 14 > H - 70: newcol()
    x0, x1 = bounds()
    st["y"] += size * 1.2
    c.setFont(font, size)
    if centred: c.drawCentredString((x0 + x1) / 2, H - st["y"], t)
    else: c.drawString(x0, H - st["y"], t)
    st["y"] += 3
head_foot()
c.setFont(BOLD, 20); c.drawCentredString(W / 2, H - 100, "Folding Made-Up Papers into Levels")
c.setFont(FONT, 11); c.drawCentredString(W / 2, H - 128, "Ana Example and Ben Sample")
c.setFont(IT, 9); c.drawCentredString(W / 2, H - 142, "Example University, ana@example.org")
ABS = " ".join(sent() for _ in range(5))
open(out + ".abstract.txt", "w").write(ABS)
st.update({"span": True, "y": 160})
if MODE == "ieee":
    st["span"] = False; st.update({"top": 160, "y": 160})
    para(ABS, size=9, font=BOLD, indent=0, lead="Abstract—", leadfont=BI)
    st["y"] += 4
    para("Index Terms—folding, reading, layout.", size=9, font=BI, indent=0)
elif MODE == "elsevier":
    heading("A B S T R A C T", font=BOLD, size=8, centred=False, gap=0)
    para(ABS, size=9, font=FONT, indent=0)
    st["span"] = False; st["y"] += 16; st["top"] = st["y"]
else:
    para(ABS, size=9, font=FONT, indent=0)
    st["span"] = False; st["y"] += 16; st["top"] = st["y"]
heading("I. INTRODUCTION")
for i in range(3): para(" ".join(sent() for _ in range(5)))
heading("II. METHOD")
for i in range(3): para(" ".join(sent() for _ in range(5)))
heading("III. RESULTS")
for i in range(3): para(" ".join(sent() for _ in range(5)))
heading("REFERENCES")
for i in range(1, 5): para(sent(12), size=8, indent=0, lead="[%d]" % i, leadfont=FONT)
c.setFont(FONT, 9); c.drawCentredString(W / 2, 40, str(st["page"]))
c.save()
