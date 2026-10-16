"""Hand-drawn (code-drawn) diagrams for the report. Each function returns an inline <svg> string.
Monochrome with one accent colour so they print well in black & white."""

INK, GREY, LIGHT, ACCENT = "#111111", "#6b6b6b", "#f3f1ec", "#9c3d1a"
FONT = "font-family:Inter,'Liberation Sans',sans-serif"


_n = [0]


def svg(w, h, body):
    _n[0] += 1
    body = body.replace('url(#a)', f'url(#a{_n[0]})')
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'style="width:100%;height:auto;{FONT}">'
            f'<defs><marker id="a{_n[0]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M0 0L10 5L0 10z" fill="{INK}"/></marker></defs>{body}</svg>')


def box(x, y, w, h, title, sub=None, fill="#fff", stroke=INK, bold=True, dash=False):
    d = ' stroke-dasharray="4 3"' if dash else ""
    t = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.1"{d}/>'
    cy = y + h / 2 + (0 if sub is None else -5)
    wt = 600 if bold else 400
    t += f'<text x="{x + w / 2}" y="{cy + 4}" text-anchor="middle" font-size="11" font-weight="{wt}" fill="{INK}">{title}</text>'
    if sub:
        t += f'<text x="{x + w / 2}" y="{cy + 18}" text-anchor="middle" font-size="9" fill="{GREY}">{sub}</text>'
    return t


def label(x, y, s, anchor="middle", size=9, color=GREY, weight=400):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" fill="{color}" font-weight="{weight}">{s}</text>'


def arrow(x1, y1, x2, y2, both=False, dash=False, color=INK):
    d = ' stroke-dasharray="4 3"' if dash else ""
    start = ' marker-start="url(#a)"' if both else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.1"'
            f'{d} marker-end="url(#a)"{start}/>')


def group(x, y, w, h, title):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{LIGHT}" stroke="#cfcac0"/>'
            + label(x + 10, y + 16, title.upper(), "start", 9, ACCENT, 700))


# ------------------------------------------------------------------ Fig: architecture
def architecture():
    b = group(10, 10, 190, 220, "Browser (client)")
    b += box(26, 40, 158, 44, "login.html", "React · JSX · hooks")
    b += box(26, 100, 158, 44, "index.html + app.jsx", "React single-page app")
    b += box(26, 160, 158, 50, "style.css", "responsive · glass UI")
    b += group(250, 10, 210, 290, "Node.js + Express :8181")
    for i, (t, s) in enumerate([("server.js", "REST routes · static files"), ("auth.js", "register · login · token"),
                                ("recommend.js", "taste engine"), ("tmdb.js", "TMDB client · tags · cards"),
                                ("db.js", "SQLite queries")]):
        b += box(266, 38 + i * 50, 178, 40, t, s)
    b += group(510, 10, 150, 290, "External / data")
    b += box(526, 170, 118, 52, "TMDB API", "movie & TV data", dash=True)
    b += box(526, 238, 118, 52, "SQLite", "app.db (node:sqlite)")
    b += arrow(184, 62, 266, 58, both=True) + label(225, 52, "JSON + token", "middle", 8)
    b += arrow(184, 122, 266, 74, both=True)
    b += arrow(444, 208, 526, 196, both=True) + label(485, 188, "HTTPS", "middle", 8)
    b += arrow(444, 258, 526, 264, both=True)
    b += group(10, 320, 190, 80, "PHP module")
    b += box(26, 342, 158, 46, "login.php · index.php", "forms · sessions · CRUD", dash=True)
    b += group(510, 320, 150, 80, "MySQL")
    b += box(526, 342, 118, 46, "reel_diary", "users · diary")
    b += arrow(184, 365, 526, 365, both=True) + label(355, 358, "PDO (prepared statements)", "middle", 8)
    return svg(670, 410, b)


# ------------------------------------------------------------------ Fig: DFD level 1
def dfd():
    b = box(10, 150, 90, 50, "User", "(external entity)", fill=LIGHT)
    procs = [(170, 20, "1.0 Authenticate"), (170, 100, "2.0 Seed taste profile"), (170, 180, "3.0 Recommend cards"),
             (170, 260, "4.0 Record swipe")]
    for x, y, t in procs:
        b += f'<ellipse cx="{x + 70}" cy="{y + 25}" rx="70" ry="26" fill="#fff" stroke="{INK}" stroke-width="1.1"/>'
        b += label(x + 70, y + 29, t, "middle", 10, INK, 600)
    stores = [(430, 20, "D1  users / sessions"), (430, 100, "D2  profile_tags"), (430, 180, "D3  hidden / lists / actions"),
              (430, 260, "D4  movie_cache")]
    for x, y, t in stores:
        b += (f'<line x1="{x}" y1="{y}" x2="{x + 170}" y2="{y}" stroke="{INK}"/>'
              f'<line x1="{x}" y1="{y + 40}" x2="{x + 170}" y2="{y + 40}" stroke="{INK}"/>')
        b += label(x + 85, y + 24, t, "middle", 10, INK)
    b += box(430, 330, 170, 34, "TMDB API", "(external entity)", fill=LIGHT)
    b += arrow(100, 160, 170, 50) + label(60, 108, "credentials", "middle", 8)
    b += arrow(100, 170, 170, 125) + label(60, 134, "genres, titles", "middle", 8)
    b += arrow(100, 185, 170, 205) + label(60, 222, "request cards", "middle", 8)
    b += arrow(100, 198, 170, 285) + label(48, 262, "like / pass / save", "middle", 8)
    b += arrow(310, 45, 430, 40) + arrow(310, 125, 430, 120) + arrow(310, 205, 430, 200, both=True)
    b += arrow(310, 285, 430, 205) + arrow(310, 285, 430, 130, dash=True)
    b += arrow(500, 330, 500, 302, both=True, dash=True)
    b += arrow(310, 215, 430, 280, both=True, dash=True)
    return svg(620, 375, b)


# ------------------------------------------------------------------ Fig: ER diagram
def table(x, y, w, name, cols, accent=False):
    h = 24 + 15 * len(cols)
    t = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="{INK}" stroke-width="1.1"/>'
    t += f'<rect x="{x}" y="{y}" width="{w}" height="22" fill="{ACCENT if accent else INK}"/>'
    t += label(x + w / 2, y + 15, name, "middle", 10.5, "#fff", 700)
    for i, c in enumerate(cols):
        key = c.startswith("*") or c.startswith("+")
        txt = c.lstrip("*+")
        t += label(x + 8, y + 38 + i * 15, ("PK  " if c.startswith("*") else "FK  " if c.startswith("+") else "      ") + txt,
                   "start", 9, INK, 700 if key else 400)
    return t, h


def er():
    b = ""
    tabs = {}
    layout = [
        ("users", 20, 20, ["*id", "username (unique)", "pass_hash"]),
        ("sessions", 20, 120, ["*token", "+user_id"]),
        ("settings", 20, 205, ["*+user_id", "*key", "value"]),
        ("profile_tags", 240, 20, ["*+user_id", "*medium", "*tag", "score"]),
        ("actions", 240, 130, ["*id", "+user_id", "medium", "movie_id", "action", "weight", "ts"]),
        ("hidden", 460, 20, ["*+user_id", "*medium", "*movie_id", "until_ts"]),
        ("lists", 460, 130, ["*+user_id", "*medium", "*movie_id", "*list", "ts"]),
        ("movie_cache", 460, 245, ["*medium", "*id", "json"]),
    ]
    for n, x, y, cols in layout:
        t, h = table(x, y, 190, n, cols)
        b += t
        tabs[n] = (x, y, h)
    ux, uy, uh = tabs["users"]
    for n in ["sessions", "settings"]:
        x, y, h = tabs[n]
        b += arrow(ux + 95, uy + uh, x + 95, y, color=GREY)
    b += f'<path d="M210 40 H240" stroke="{GREY}"/>'
    b += f'<path d="M210 60 H225 V150 H240" stroke="{GREY}" fill="none"/>'
    b += f'<path d="M210 70 H225 V50 H240" stroke="{GREY}" fill="none"/>'
    b += f'<path d="M225 35 V10 H550 V20" stroke="{GREY}" fill="none"/>'
    b += f'<path d="M225 150 V120 H555 V130" stroke="{GREY}" fill="none"/>'
    b += label(230, 335, "users 1 ──── N  every per-user table (user_id).  movie_cache is shared by all users.", "start", 9, GREY)
    # MySQL
    b += group(20, 355, 640, 190, "MySQL — reel_diary (PHP module)")
    t1, h1 = table(50, 385, 250, "users", ["*id", "username (unique)", "pass_hash", "created_at"], True)
    t2, h2 = table(360, 385, 270, "diary", ["*id", "+user_id", "title", "kind (movie | tv)", "status (want | watched)",
                                              "rating (1–10, nullable)", "note", "created_at"], True)
    b += t1 + t2 + arrow(300, 420, 360, 420, color=GREY) + label(330, 412, "1 : N", "middle", 8)
    return svg(680, 560, b)


# ------------------------------------------------------------------ Fig: sequence diagram
def sequence():
    xs = {"Browser": 70, "Express": 230, "SQLite": 390, "TMDB": 550}
    b = ""
    for n, x in xs.items():
        b += box(x - 55, 10, 110, 30, n, fill=LIGHT)
        b += f'<line x1="{x}" y1="40" x2="{x}" y2="395" stroke="#bdb8ad" stroke-dasharray="3 3"/>'
    msgs = [
        ("Browser", "Express", "POST /api/action {movieId, action} + Bearer token", 70, False),
        ("Express", "SQLite", "look up session → user", 100, False),
        ("Express", "SQLite", "cached details for movieId?", 130, False),
        ("Express", "TMDB", "(cache miss) GET /movie/{id}", 160, True),
        ("Express", "SQLite", "store details in movie_cache", 190, False),
        ("Express", "SQLite", "add points to the title's tags", 220, False),
        ("Express", "SQLite", "log action · hide title · update lists", 250, False),
        ("Express", "Browser", "{ ok: true, watchlistCount }", 285, False),
        ("Browser", "Express", "POST /api/next (queue running low)", 320, False),
        ("Express", "Browser", "{ cards: [ 10 ranked cards ] }", 365, False),
    ]
    for a, c, t, y, dash in msgs:
        x1, x2 = xs[a], xs[c]
        b += arrow(x1, y, x2 + (-4 if x2 < x1 else 4), y, dash=dash or (c == "Browser"))
        b += label((x1 + x2) / 2, y - 5, t, "middle", 8.5, INK)
    return svg(620, 410, b)


# ------------------------------------------------------------------ Fig: recommendation flow
def recommend_flow():
    b = box(200, 8, 200, 34, "POST /api/next", "user, medium, count, inQueue", fill=LIGHT)
    b += box(180, 62, 240, 38, "Load taste profile + hidden titles", "skip = hidden ∪ cards already in deck")
    b += box(180, 120, 240, 38, "Rank genres by score", "top 3 → main · next 5 → wildcard · ≤ −3 → avoid")
    # decision
    b += f'<polygon points="300,176 400,206 300,236 200,206" fill="#fff" stroke="{INK}" stroke-width="1.1"/>'
    b += label(300, 203, "Fewer than 15 swipes", "middle", 9, INK, 600) + label(300, 215, "and loved titles?", "middle", 9, INK, 600)
    b += box(10, 262, 190, 44, "Seed from TMDB", "/recommendations of a loved title")
    b += box(400, 262, 190, 44, "Discover", "top genres, minus avoided genres")
    b += arrow(200, 206, 105, 262) + label(135, 228, "yes", "middle", 9, ACCENT, 700)
    b += arrow(400, 206, 495, 262) + label(465, 228, "no", "middle", 9, ACCENT, 700)
    b += box(180, 332, 240, 38, "Wildcard pool (30 %)", "adjacent genres, or trending if none")
    b += box(180, 390, 240, 38, "Fetch cached details · score fit", "fit = sum of tag scores of the title")
    b += box(180, 448, 240, 38, "Sort main by fit · sprinkle wildcards", "return up to `count` cards", fill=LIGHT)
    b += arrow(300, 42, 300, 62) + arrow(300, 100, 300, 120) + arrow(300, 158, 300, 176)
    b += arrow(105, 306, 220, 332) + arrow(495, 306, 380, 332)
    b += arrow(300, 370, 300, 390) + arrow(300, 428, 300, 448)
    return svg(600, 496, b)


FIGS = {"arch": architecture, "dfd": dfd, "er": er, "seq": sequence, "flow": recommend_flow}
