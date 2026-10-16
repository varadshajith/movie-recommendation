"""Build REPORT.pdf from report.html + report.css + figures.py.   Usage: python3 build.py
Needs WeasyPrint on PATH. Edit CONFIG below to change names / guide / year."""
import html, re, subprocess, sys
from pathlib import Path
from figures import FIGS

CONFIG = {
    "STUDENTS": "Varad Shajith",
    "GUIDE": "Course Instructor, Web Technologies",
    "YEAR": "2026–27",
}

here = Path(__file__).parent
out_pdf = here.parent.parent / "REPORT.pdf"
doc = (here / "report.html").read_text()

for k, v in CONFIG.items():
    doc = doc.replace("{{%s}}" % k, html.escape(v))
doc = re.sub(r"\{\{FIG:(\w+)\}\}", lambda m: FIGS[m.group(1)](), doc)

# ---- number headings, give them ids, collect the contents list ----
toc, chapter, section, seen_chapter = [], 0, 0, False

def heading(m):
    global chapter, section, seen_chapter
    tag, attrs, text = m.group(1), m.group(2) or "", m.group(3)
    plain = re.sub(r"<[^>]+>", "", text)
    if tag == "h1" and "chapter" in attrs:
        chapter, section, seen_chapter = chapter + 1, 0, True
        hid = f"c{chapter}"
        toc.append((1, f"{chapter}", plain, hid))
    elif tag == "h1" and seen_chapter:           # References, Appendices
        hid = "p" + str(len(toc))
        toc.append((1, "", plain, hid))
    elif tag == "h2" and seen_chapter and "nonum" not in attrs:
        section += 1
        hid = f"s{chapter}-{section}"
        toc.append((2, f"{chapter}.{section}", plain, hid))
    elif tag == "h2" and seen_chapter:
        hid = "n" + str(len(toc))
        toc.append((2, "", plain, hid))
    else:
        return m.group(0)
    return f'<{tag}{attrs} id="{hid}">{text}</{tag}>'

doc = re.sub(r"<(h[12])((?: [^>]*)?)>(.*?)</\1>", heading, doc, flags=re.S)

def toc_html():
    rows = []
    for lvl, num, title, hid in toc:
        label = f'<span style="display:inline-block;width:{"9" if lvl == 1 else "11"}mm">{num}</span>{title}' if num else title
        rows.append(f'<li class="l{lvl}"><a href="#{hid}">{label}</a></li>')
    return "<ul>" + "".join(rows) + "</ul>"

# ---- figures and tables: ids + lists ----
figs, tabs = [], []

def figure(m):
    figs.append(re.sub(r"<[^>]+>", "", m.group(3)))
    fid = f"fig{len(figs)}"
    return f'<figure{m.group(1)} id="{fid}">{m.group(2)}<figcaption>{m.group(3)}</figcaption></figure>'

doc = re.sub(r"<figure((?: [^>]*)?)>(.*?)<figcaption>(.*?)</figcaption></figure>", figure, doc, flags=re.S)

def tcap(m):
    tabs.append(re.sub(r"<[^>]+>", "", m.group(1)))
    return f'<p class="caption top" id="tab{len(tabs)}"><span class="tcap"></span>{m.group(1)}</p>'

doc = re.sub(r'<p class="caption top"><span class="tcap"></span>(.*?)</p>', tcap, doc, flags=re.S)

def lst(items, prefix, word):
    li = "".join(f'<li><a href="#{prefix}{i}"><span class="n">{word} {i}</span>{t}</a></li>' for i, t in enumerate(items, 1))
    return f"<ul>{li}</ul>"

doc = doc.replace("{{TOC}}", toc_html()).replace("{{LOF}}", lst(figs, "fig", "Figure")).replace("{{LOT}}", lst(tabs, "tab", "Table"))
assert "{{" not in doc, re.findall(r"\{\{.*?\}\}", doc)

built = here / "report.built.html"
built.write_text(doc)
r = subprocess.run(["weasyprint", str(built), str(out_pdf)], capture_output=True, text=True)
sys.stderr.write(r.stderr[-1500:])
built.unlink()
print("wrote", out_pdf, f"({len(figs)} figures, {len(tabs)} tables)")
