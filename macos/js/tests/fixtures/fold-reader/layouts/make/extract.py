# PDF words to the lines FoldPDF gives (pdfplumber): a line cut where its words stand 1.5 x its height apart.
# usage: extract.py IN.pdf pdfkit OUT.json, then round to 5 decimals
import json, sys, re
import pdfplumber
path, mode, out = sys.argv[1], sys.argv[2], sys.argv[3]
pages = []
with pdfplumber.open(path) as pdf:
    for n, page in enumerate(pdf.pages, 1):
        W, H = float(page.width), float(page.height)
        ws = page.extract_words(extra_attrs=["fontname", "size"], keep_blank_chars=False, x_tolerance=1)
        rows = []
        for w in sorted(ws, key=lambda w: (round(w["bottom"]), w["x0"])):
            if rows and abs(rows[-1][0]["bottom"] - w["bottom"]) < 1.0:
                rows[-1].append(w)
            else:
                rows.append([w])
        lines = []
        for row in rows:
            row.sort(key=lambda w: w["x0"])
            runs = [[]]
            hi = max(w["bottom"] for w in row) - min(w["top"] for w in row)
            for w in row:
                if runs[-1]:
                    gap = w["x0"] - runs[-1][-1]["x1"]
                    if mode == "pdfkit" and gap > 1.5 * hi: runs.append([])
                    if mode == "cols" and runs[-1][-1]["x1"] < W / 2 and w["x0"] > W / 2: runs.append([])
                runs[-1].append(w)
            for run in runs:
                if not run: continue
                bold = lambda w: bool(re.search(r"bold|black|heavy", w["fontname"], re.I))
                ital = lambda w: bool(re.search(r"italic|oblique", w["fontname"], re.I))
                chars = sum(len(w["text"]) for w in run)
                size = sum(w["size"] * len(w["text"]) for w in run) / chars
                f = (1 if sum(len(w["text"]) for w in run if bold(w)) * 2 > chars else 0) | (2 if sum(len(w["text"]) for w in run if ital(w)) * 2 > chars else 0)
                lb = 0
                for w in run:
                    if not bold(w): break
                    lb += 1
                box = lambda w: [round(w["x0"] / W, 6), round(w["top"] / H, 6), round(w["x1"] / W, 6), round(w["bottom"] / H, 6)]
                bs = [box(w) for w in run]
                lines.append({"t": " ".join(w["text"] for w in run), "b": [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)],
                              "s": round(size * 2) / 2, "f": f, "lb": lb, "w": [[w["text"]] + box(w) for w in run]})
        pages.append({"n": n, "size": [W, H], "lines": lines})
json.dump(pages, open(out, "w"))
print(path, mode, sum(len(p["lines"]) for p in pages), "lines")
