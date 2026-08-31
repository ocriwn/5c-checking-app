import json
import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

from rubric import CATEGORIES, ITEM_INDEX, OVERALL_FEELINGS, TOTAL_MAX_SCORE, grade_for
from translations import (
    CATEGORY_I18N,
    GRADE_LABELS,
    ITEM_I18N,
    LANGUAGES,
    OVERALL_FEELINGS_I18N,
    UI_STRINGS,
    norm_lang,
)


def localized_categories(lang):
    lang = norm_lang(lang)
    cats = []
    for cat in CATEGORIES:
        cat_i18n = CATEGORY_I18N[cat["key"]][lang]
        items = []
        for item in cat["items"]:
            text = item["text"] if lang == "zh-TW" else ITEM_I18N.get(item["id"], {}).get(lang, item["text"])
            items.append({"id": item["id"], "max": item["max"], "text": text})
        cats.append(
            {
                "key": cat["key"],
                "name": cat_i18n["name"],
                "subtitle": cat_i18n["subtitle"],
                "items": items,
            }
        )
    return cats


def localized_item_text(item_id, lang):
    lang = norm_lang(lang)
    category, rubric_item = ITEM_INDEX.get(item_id, (None, None))
    if not rubric_item:
        return None
    if lang == "zh-TW":
        return rubric_item["text"]
    return ITEM_I18N.get(item_id, {}).get(lang, rubric_item["text"])


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "data", "5c.db"))

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-insecure-key-change-in-render-env")
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.permanent_session_lifetime = timedelta(days=30)


def get_db():
    if "db" not in g:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS regions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            pin_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('store_manager','rm','admin')),
            home_store_id INTEGER REFERENCES stores(id),
            region_id INTEGER REFERENCES regions(id),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_stores (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            store_id INTEGER NOT NULL REFERENCES stores(id),
            PRIMARY KEY (user_id, store_id)
        );

        CREATE TABLE IF NOT EXISTS evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            eval_date TEXT NOT NULL,
            store_id INTEGER NOT NULL REFERENCES stores(id),
            employee_name TEXT NOT NULL,
            evaluator_name TEXT NOT NULL,
            overall_feelings TEXT,
            overall_feedback TEXT,
            total_score REAL NOT NULL,
            max_score REAL NOT NULL,
            grade TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS evaluation_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            item_id TEXT NOT NULL,
            max_score REAL NOT NULL,
            actual_score REAL NOT NULL,
            feedback TEXT
        );
        """
    )
    cols = [r[1] for r in conn.execute("PRAGMA table_info(stores)").fetchall()]
    if "region_id" not in cols:
        conn.execute("ALTER TABLE stores ADD COLUMN region_id INTEGER REFERENCES regions(id)")
    conn.commit()
    conn.close()


# ---------- Auth helpers ----------

def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def user_store_ids(user):
    """All store ids explicitly assigned to this store_manager (their full patch, may be >1)."""
    db = get_db()
    rows = db.execute("SELECT store_id FROM user_stores WHERE user_id = ?", (user["id"],)).fetchall()
    ids = [r["store_id"] for r in rows]
    if not ids and user.get("home_store_id"):
        ids = [user["home_store_id"]]
    return ids


def user_public(user):
    db = get_db()
    store_ids = user_store_ids(user)
    stores = []
    if store_ids:
        placeholders = ",".join("?" * len(store_ids))
        stores = [dict(r) for r in db.execute(f"SELECT id, name FROM stores WHERE id IN ({placeholders}) ORDER BY name", store_ids)]
    home_store_name = None
    if user.get("home_store_id"):
        r = db.execute("SELECT name FROM stores WHERE id = ?", (user["home_store_id"],)).fetchone()
        home_store_name = r["name"] if r else None
    region_id = user.get("region_id")
    if not region_id and store_ids:
        r = db.execute("SELECT region_id FROM stores WHERE id = ?", (store_ids[0],)).fetchone()
        region_id = r["region_id"] if r else None
    region_name = None
    if region_id:
        r = db.execute("SELECT name FROM regions WHERE id = ?", (region_id,)).fetchone()
        region_name = r["name"] if r else None
    return {
        "id": user["id"],
        "name": user["name"],
        "role": user["role"],
        "home_store_id": user.get("home_store_id"),
        "home_store_name": home_store_name,
        "stores": stores,
        "region_id": region_id,
        "region_name": region_name,
    }


def view_scope_store_ids(user):
    """Store ids this user may VIEW history/analytics for. None = unrestricted (admin)."""
    db = get_db()
    if user["role"] == "admin":
        return None
    if user["role"] == "rm":
        return [r["id"] for r in db.execute("SELECT id FROM stores WHERE region_id = ?", (user["region_id"],))]
    return user_store_ids(user)


def submit_scope_store_ids(user):
    """Store ids this user may SUBMIT an observation for. None = unrestricted (admin)."""
    db = get_db()
    if user["role"] == "admin":
        return None
    if user["role"] == "rm":
        return [r["id"] for r in db.execute("SELECT id FROM stores WHERE region_id = ?", (user["region_id"],))]
    store_ids = user_store_ids(user)
    region_id = user.get("region_id")
    if not region_id and store_ids:
        r = db.execute("SELECT region_id FROM stores WHERE id = ?", (store_ids[0],)).fetchone()
        region_id = r["region_id"] if r else None
    if not region_id:
        return store_ids
    return [r["id"] for r in db.execute("SELECT id FROM stores WHERE region_id = ?", (region_id,))]


def apply_view_scope(query, params, user, alias="e"):
    scope = view_scope_store_ids(user)
    if scope is not None:
        if not scope:
            scope = [-1]
        placeholders = ",".join("?" * len(scope))
        query += f" AND {alias}.store_id IN ({placeholders})"
        params = list(params) + scope
    return query, params


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "請先登入", "code": "login_required"}), 401
        g.user = user
        return f(*args, **kwargs)

    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "請先登入", "code": "login_required"}), 401
        if user["role"] != "admin":
            return jsonify({"error": "沒有權限", "code": "forbidden"}), 403
        g.user = user
        return f(*args, **kwargs)

    return wrapper


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/rubric")
def api_rubric():
    lang = norm_lang(request.args.get("lang"))
    return jsonify(
        {
            "categories": localized_categories(lang),
            "overallFeelings": OVERALL_FEELINGS_I18N[lang],
            "totalMaxScore": TOTAL_MAX_SCORE,
        }
    )


@app.route("/api/i18n")
def api_i18n():
    lang = norm_lang(request.args.get("lang"))
    return jsonify(
        {
            "lang": lang,
            "languages": LANGUAGES,
            "ui": UI_STRINGS[lang],
            "gradeLabels": GRADE_LABELS[lang],
        }
    )


# ---------- Auth routes ----------

@app.route("/api/users/names")
def api_user_names():
    rows = get_db().execute("SELECT name FROM users ORDER BY name").fetchall()
    return jsonify([r["name"] for r in rows])


@app.route("/api/login", methods=["POST"])
def api_login():
    db = get_db()
    payload = request.json or {}
    name = (payload.get("name") or "").strip()
    pin = (payload.get("pin") or "").strip()
    row = db.execute("SELECT * FROM users WHERE name = ?", (name,)).fetchone()
    if not row or not check_password_hash(row["pin_hash"], pin):
        return jsonify({"error": "姓名或 PIN 錯誤", "code": "invalid_login"}), 401
    session.clear()
    session["user_id"] = row["id"]
    session.permanent = True
    return jsonify(user_public(dict(row)))


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
def api_me():
    user = current_user()
    return jsonify(user_public(user) if user else None)


@app.route("/api/admin/users", methods=["POST"])
@admin_required
def api_admin_add_user():
    """Admin-only: create or update a store_manager/rm/admin account.
    Region/store are created on the fly by name if they don't exist yet,
    so this one call is enough for "add manager X at stores [Y,Z] in region W".
    store_names may list more than one store (cluster/area managers)."""
    db = get_db()
    payload = request.json or {}
    name = (payload.get("name") or "").strip()
    pin = (payload.get("pin") or "").strip()
    role = payload.get("role")
    store_names = payload.get("store_names")
    if store_names is None:
        single = (payload.get("store_name") or "").strip()
        store_names = [single] if single else []
    store_names = [s.strip() for s in store_names if s and s.strip()]
    region_name = (payload.get("region_name") or "").strip() or None

    if not name or not pin or role not in ("store_manager", "rm", "admin"):
        return jsonify({"error": "缺少必要欄位或角色不正確"}), 400

    region_id = None
    if region_name:
        db.execute("INSERT OR IGNORE INTO regions (name) VALUES (?)", (region_name,))
        region_id = db.execute("SELECT id FROM regions WHERE name = ?", (region_name,)).fetchone()["id"]

    store_ids = []
    for store_name in store_names:
        row = db.execute("SELECT id FROM stores WHERE name = ?", (store_name,)).fetchone()
        if row:
            sid = row["id"]
            if region_id:
                db.execute("UPDATE stores SET region_id = ? WHERE id = ?", (region_id, sid))
        else:
            cur = db.execute("INSERT INTO stores (name, region_id) VALUES (?, ?)", (store_name, region_id))
            sid = cur.lastrowid
        store_ids.append(sid)
    home_store_id = store_ids[0] if store_ids else None

    pin_hash = generate_password_hash(pin, method="pbkdf2:sha256")
    db.execute(
        """INSERT INTO users (name, pin_hash, role, home_store_id, region_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET pin_hash=excluded.pin_hash, role=excluded.role,
               home_store_id=excluded.home_store_id, region_id=excluded.region_id""",
        (name, pin_hash, role, home_store_id, region_id, datetime.now().isoformat(timespec="seconds")),
    )
    user_id = db.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchone()["id"]
    db.execute("DELETE FROM user_stores WHERE user_id = ?", (user_id,))
    db.executemany(
        "INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?, ?)",
        [(user_id, sid) for sid in store_ids],
    )
    db.commit()
    return jsonify({"ok": True, "name": name, "role": role, "store_ids": store_ids}), 201


@app.route("/api/stores", methods=["GET", "POST"])
@login_required
def api_stores():
    db = get_db()
    if request.method == "POST":
        if g.user["role"] != "admin":
            return jsonify({"error": "沒有權限", "code": "forbidden"}), 403
        name = (request.json or {}).get("name", "").strip()
        if not name:
            return jsonify({"error": UI_STRINGS["zh-TW"]["err_store_name_required"], "code": "store_name_required"}), 400
        try:
            db.execute("INSERT INTO stores (name) VALUES (?)", (name,))
            db.commit()
        except sqlite3.IntegrityError:
            pass
        row = db.execute("SELECT id, name FROM stores WHERE name = ?", (name,)).fetchone()
        return jsonify(dict(row)), 201

    for_scope = request.args.get("for")
    ids = submit_scope_store_ids(g.user) if for_scope == "submit" else view_scope_store_ids(g.user)
    if ids is None:
        rows = db.execute("SELECT id, name FROM stores ORDER BY name").fetchall()
    elif not ids:
        rows = []
    else:
        placeholders = ",".join("?" * len(ids))
        rows = db.execute(f"SELECT id, name FROM stores WHERE id IN ({placeholders}) ORDER BY name", ids).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/employees")
@login_required
def api_employees():
    db = get_db()
    query = "SELECT DISTINCT employee_name FROM evaluations e WHERE 1=1"
    params = []
    store_id = request.args.get("store_id")
    if store_id:
        query += " AND e.store_id = ?"
        params.append(store_id)
    query, params = apply_view_scope(query, params, g.user)
    query += " ORDER BY employee_name"
    rows = db.execute(query, params).fetchall()
    return jsonify([r["employee_name"] for r in rows])


@app.route("/api/evaluators")
@login_required
def api_evaluators():
    db = get_db()
    query = "SELECT DISTINCT evaluator_name FROM evaluations e WHERE 1=1"
    query, params = apply_view_scope(query, [], g.user)
    query += " ORDER BY evaluator_name"
    rows = db.execute(query, params).fetchall()
    return jsonify([r["evaluator_name"] for r in rows])


@app.route("/api/evaluations", methods=["GET", "POST"])
@login_required
def api_evaluations():
    db = get_db()
    if request.method == "POST":
        payload = request.json or {}
        eval_date = payload.get("eval_date")
        store_id = payload.get("store_id")
        employee_name = (payload.get("employee_name") or "").strip()
        evaluator_name = (payload.get("evaluator_name") or "").strip()
        overall_feelings = payload.get("overall_feelings") or []
        overall_feedback = payload.get("overall_feedback") or ""
        items = payload.get("items") or {}

        if not eval_date or not store_id or not employee_name or not evaluator_name:
            return jsonify({"error": UI_STRINGS["zh-TW"]["err_missing_fields"], "code": "missing_fields"}), 400
        if not items:
            return jsonify({"error": UI_STRINGS["zh-TW"]["err_no_items"], "code": "no_items"}), 400

        allowed = submit_scope_store_ids(g.user)
        if allowed is not None and int(store_id) not in allowed:
            return jsonify({"error": "沒有權限為這間門店打分", "code": "forbidden"}), 403

        # Categories the observer didn't get a chance to see this time simply
        # send no items for that category, so they're excluded from both the
        # numerator and denominator here (and from analytics aggregates,
        # since no evaluation_items rows get written for them).
        total_score = 0.0
        max_score = 0.0
        item_rows = []
        for item_id, entry in items.items():
            if item_id not in ITEM_INDEX:
                continue
            category, rubric_item = ITEM_INDEX[item_id]
            checked = bool(entry.get("checked"))
            actual = rubric_item["max"] if checked else 0
            total_score += actual
            max_score += rubric_item["max"]
            item_rows.append(
                (category, item_id, rubric_item["max"], actual, entry.get("feedback", ""))
            )

        if max_score <= 0:
            return jsonify({"error": UI_STRINGS["zh-TW"]["err_no_items"], "code": "no_items"}), 400

        grade = grade_for(total_score, max_score)
        created_at = datetime.now().isoformat(timespec="seconds")

        cur = db.execute(
            """INSERT INTO evaluations
               (eval_date, store_id, employee_name, evaluator_name, overall_feelings,
                overall_feedback, total_score, max_score, grade, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                eval_date,
                store_id,
                employee_name,
                evaluator_name,
                json.dumps(overall_feelings, ensure_ascii=False),
                overall_feedback,
                total_score,
                max_score,
                grade,
                created_at,
            ),
        )
        evaluation_id = cur.lastrowid
        db.executemany(
            """INSERT INTO evaluation_items
               (evaluation_id, category, item_id, max_score, actual_score, feedback)
               VALUES (?, ?, ?, ?, ?, ?)""",
            [(evaluation_id, *row) for row in item_rows],
        )
        db.commit()
        return jsonify({"id": evaluation_id, "total_score": total_score, "max_score": max_score, "grade": grade}), 201

    store_id = request.args.get("store_id")
    employee_name = request.args.get("employee_name")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    query = """
        SELECT e.*, s.name AS store_name
        FROM evaluations e JOIN stores s ON s.id = e.store_id
        WHERE 1=1
    """
    params = []
    if store_id:
        query += " AND e.store_id = ?"
        params.append(store_id)
    if employee_name:
        query += " AND e.employee_name = ?"
        params.append(employee_name)
    if date_from:
        query += " AND e.eval_date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND e.eval_date <= ?"
        params.append(date_to)
    query, params = apply_view_scope(query, params, g.user)
    query += " ORDER BY e.eval_date DESC, e.id DESC"

    rows = db.execute(query, params).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["overall_feelings"] = json.loads(d["overall_feelings"] or "[]")
        result.append(d)
    return jsonify(result)


@app.route("/api/evaluations/<int:evaluation_id>")
@login_required
def api_evaluation_detail(evaluation_id):
    db = get_db()
    ev = db.execute(
        """SELECT e.*, s.name AS store_name FROM evaluations e
           JOIN stores s ON s.id = e.store_id WHERE e.id = ?""",
        (evaluation_id,),
    ).fetchone()
    if not ev:
        return jsonify({"error": "not found"}), 404
    scope = view_scope_store_ids(g.user)
    if scope is not None and ev["store_id"] not in scope:
        return jsonify({"error": "沒有權限", "code": "forbidden"}), 403
    items = db.execute(
        "SELECT * FROM evaluation_items WHERE evaluation_id = ?", (evaluation_id,)
    ).fetchall()
    d = dict(ev)
    d["overall_feelings"] = json.loads(d["overall_feelings"] or "[]")
    d["items"] = [dict(i) for i in items]
    return jsonify(d)


@app.route("/api/analytics/category-breakdown")
@login_required
def api_category_breakdown():
    db = get_db()
    store_id = request.args.get("store_id")
    employee_name = request.args.get("employee_name")
    lang = norm_lang(request.args.get("lang"))

    query = """
        SELECT ei.category, SUM(ei.actual_score) AS actual, SUM(ei.max_score) AS possible,
               COUNT(DISTINCT ei.evaluation_id) AS eval_count
        FROM evaluation_items ei
        JOIN evaluations e ON e.id = ei.evaluation_id
        WHERE 1=1
    """
    params = []
    if store_id:
        query += " AND e.store_id = ?"
        params.append(store_id)
    if employee_name:
        query += " AND e.employee_name = ?"
        params.append(employee_name)
    query, params = apply_view_scope(query, params, g.user)
    query += " GROUP BY ei.category"

    rows = db.execute(query, params).fetchall()
    by_cat = {r["category"]: dict(r) for r in rows}
    order = [c["key"] for c in CATEGORIES]
    result = []
    for key in order:
        r = by_cat.get(key)
        cat_name = CATEGORY_I18N[key][lang]["name"]
        if r and r["possible"]:
            pct = round(100 * r["actual"] / r["possible"], 1)
        else:
            pct = None
        result.append(
            {
                "category": key,
                "name": cat_name,
                "actual": r["actual"] if r else 0,
                "possible": r["possible"] if r else 0,
                "pct": pct,
            }
        )
    return jsonify(result)


@app.route("/api/analytics/item-breakdown")
@login_required
def api_item_breakdown():
    db = get_db()
    store_id = request.args.get("store_id")
    lang = norm_lang(request.args.get("lang"))

    query = """
        SELECT ei.item_id, ei.category, SUM(ei.actual_score) AS actual, SUM(ei.max_score) AS possible,
               COUNT(*) AS n
        FROM evaluation_items ei
        JOIN evaluations e ON e.id = ei.evaluation_id
        WHERE 1=1
    """
    params = []
    if store_id:
        query += " AND e.store_id = ?"
        params.append(store_id)
    query, params = apply_view_scope(query, params, g.user)
    query += " GROUP BY ei.item_id"

    rows = db.execute(query, params).fetchall()
    result = []
    for r in rows:
        category, rubric_item = ITEM_INDEX.get(r["item_id"], (None, None))
        if not rubric_item:
            continue
        pct = round(100 * r["actual"] / r["possible"], 1) if r["possible"] else None
        result.append(
            {
                "item_id": r["item_id"],
                "category": category,
                "text": localized_item_text(r["item_id"], lang),
                "pct": pct,
                "n": r["n"],
            }
        )
    result.sort(key=lambda x: (x["pct"] is None, x["pct"]))
    return jsonify(result)


@app.route("/api/analytics/employee-trend")
@login_required
def api_employee_trend():
    db = get_db()
    employee_name = request.args.get("employee_name")
    if not employee_name:
        return jsonify({"error": "employee_name required"}), 400

    query = "SELECT e.id, e.eval_date, e.total_score, e.max_score, e.grade FROM evaluations e WHERE e.employee_name = ?"
    params = [employee_name]
    query, params = apply_view_scope(query, params, g.user)
    query += " ORDER BY e.eval_date ASC, e.id ASC"
    evals = db.execute(query, params).fetchall()

    trend = []
    for ev in evals:
        cat_rows = db.execute(
            """SELECT category, SUM(actual_score) AS actual, SUM(max_score) AS possible
               FROM evaluation_items WHERE evaluation_id = ? GROUP BY category""",
            (ev["id"],),
        ).fetchall()
        cat_pct = {r["category"]: round(100 * r["actual"] / r["possible"], 1) if r["possible"] else None for r in cat_rows}
        trend.append(
            {
                "eval_date": ev["eval_date"],
                "total_score": ev["total_score"],
                "grade": ev["grade"],
                "categories": cat_pct,
            }
        )
    return jsonify(trend)


def seed_admin():
    """First-run only: if the users table is completely empty and
    ADMIN_NAME/ADMIN_PIN are set (Render env vars, not committed to git),
    create the initial HQ admin account so someone can log in at all."""
    admin_name = os.environ.get("ADMIN_NAME")
    admin_pin = os.environ.get("ADMIN_PIN")
    if not admin_name or not admin_pin:
        return
    conn = sqlite3.connect(DB_PATH)
    try:
        existing = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing == 0:
            conn.execute(
                "INSERT INTO users (name, pin_hash, role, created_at) VALUES (?, ?, 'admin', ?)",
                (
                    admin_name,
                    generate_password_hash(admin_pin, method="pbkdf2:sha256"),
                    datetime.now().isoformat(timespec="seconds"),
                ),
            )
            conn.commit()
    finally:
        conn.close()


init_db()
seed_admin()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5057))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
