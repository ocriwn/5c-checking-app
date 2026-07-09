import json
import os
import sqlite3
from datetime import datetime

from flask import Flask, g, jsonify, request, send_from_directory

from rubric import CATEGORIES, ITEM_INDEX, OVERALL_FEELINGS, TOTAL_MAX_SCORE, grade_for

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "data", "5c.db"))

app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="")


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
        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
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
    conn.commit()
    conn.close()


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/rubric")
def api_rubric():
    return jsonify(
        {
            "categories": CATEGORIES,
            "overallFeelings": OVERALL_FEELINGS,
            "totalMaxScore": TOTAL_MAX_SCORE,
        }
    )


@app.route("/api/stores", methods=["GET", "POST"])
def api_stores():
    db = get_db()
    if request.method == "POST":
        name = (request.json or {}).get("name", "").strip()
        if not name:
            return jsonify({"error": "門店名稱不可為空"}), 400
        try:
            db.execute("INSERT INTO stores (name) VALUES (?)", (name,))
            db.commit()
        except sqlite3.IntegrityError:
            pass
        row = db.execute("SELECT id, name FROM stores WHERE name = ?", (name,)).fetchone()
        return jsonify(dict(row)), 201
    rows = db.execute("SELECT id, name FROM stores ORDER BY name").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/employees")
def api_employees():
    db = get_db()
    store_id = request.args.get("store_id")
    if store_id:
        rows = db.execute(
            "SELECT DISTINCT employee_name FROM evaluations WHERE store_id = ? ORDER BY employee_name",
            (store_id,),
        ).fetchall()
    else:
        rows = db.execute("SELECT DISTINCT employee_name FROM evaluations ORDER BY employee_name").fetchall()
    return jsonify([r["employee_name"] for r in rows])


@app.route("/api/evaluators")
def api_evaluators():
    db = get_db()
    rows = db.execute("SELECT DISTINCT evaluator_name FROM evaluations ORDER BY evaluator_name").fetchall()
    return jsonify([r["evaluator_name"] for r in rows])


@app.route("/api/evaluations", methods=["GET", "POST"])
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
            return jsonify({"error": "日期、門店、員工姓名、考核人為必填"}), 400
        if not items:
            return jsonify({"error": "請至少完成一項評分"}), 400

        total_score = 0.0
        item_rows = []
        for item_id, entry in items.items():
            if item_id not in ITEM_INDEX:
                continue
            category, rubric_item = ITEM_INDEX[item_id]
            checked = bool(entry.get("checked"))
            actual = rubric_item["max"] if checked else 0
            total_score += actual
            item_rows.append(
                (category, item_id, rubric_item["max"], actual, entry.get("feedback", ""))
            )

        grade = grade_for(total_score)
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
                TOTAL_MAX_SCORE,
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
        return jsonify({"id": evaluation_id, "total_score": total_score, "grade": grade}), 201

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
    query += " ORDER BY e.eval_date DESC, e.id DESC"

    rows = db.execute(query, params).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["overall_feelings"] = json.loads(d["overall_feelings"] or "[]")
        result.append(d)
    return jsonify(result)


@app.route("/api/evaluations/<int:evaluation_id>")
def api_evaluation_detail(evaluation_id):
    db = get_db()
    ev = db.execute(
        """SELECT e.*, s.name AS store_name FROM evaluations e
           JOIN stores s ON s.id = e.store_id WHERE e.id = ?""",
        (evaluation_id,),
    ).fetchone()
    if not ev:
        return jsonify({"error": "not found"}), 404
    items = db.execute(
        "SELECT * FROM evaluation_items WHERE evaluation_id = ?", (evaluation_id,)
    ).fetchall()
    d = dict(ev)
    d["overall_feelings"] = json.loads(d["overall_feelings"] or "[]")
    d["items"] = [dict(i) for i in items]
    return jsonify(d)


@app.route("/api/analytics/category-breakdown")
def api_category_breakdown():
    db = get_db()
    store_id = request.args.get("store_id")
    employee_name = request.args.get("employee_name")

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
    query += " GROUP BY ei.category"

    rows = db.execute(query, params).fetchall()
    by_cat = {r["category"]: dict(r) for r in rows}
    order = [c["key"] for c in CATEGORIES]
    result = []
    for key in order:
        r = by_cat.get(key)
        cat_name = next(c["name"] for c in CATEGORIES if c["key"] == key)
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
def api_item_breakdown():
    db = get_db()
    store_id = request.args.get("store_id")

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
                "text": rubric_item["text"],
                "pct": pct,
                "n": r["n"],
            }
        )
    result.sort(key=lambda x: (x["pct"] is None, x["pct"]))
    return jsonify(result)


@app.route("/api/analytics/employee-trend")
def api_employee_trend():
    db = get_db()
    employee_name = request.args.get("employee_name")
    if not employee_name:
        return jsonify({"error": "employee_name required"}), 400

    evals = db.execute(
        """SELECT id, eval_date, total_score, max_score, grade
           FROM evaluations WHERE employee_name = ? ORDER BY eval_date ASC, id ASC""",
        (employee_name,),
    ).fetchall()

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


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5057))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
