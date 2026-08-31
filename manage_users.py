"""
帳號管理小工具（給 Claude 在對話中執行，非給店長/RM 用）。

用法範例：
  python3 manage_users.py add-region "北區"
  python3 manage_users.py assign-store "信義A11店" "北區"
  python3 manage_users.py add-user "王小明" 1234 store_manager --store "信義A11店"
  python3 manage_users.py add-user "陳RM" 5678 rm --region "北區"
  python3 manage_users.py add-user "HQ管理員" 9999 admin
  python3 manage_users.py list
"""
import os
import sqlite3
import sys
from datetime import datetime

from werkzeug.security import generate_password_hash

from app import DB_PATH, init_db

init_db()


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def add_region(name):
    conn = db()
    conn.execute("INSERT OR IGNORE INTO regions (name) VALUES (?)", (name,))
    conn.commit()
    print(f"區域已建立/已存在：{name}")


def assign_store(store_name, region_name):
    conn = db()
    region = conn.execute("SELECT id FROM regions WHERE name = ?", (region_name,)).fetchone()
    if not region:
        print(f"找不到區域「{region_name}」，先用 add-region 建立")
        return
    store = conn.execute("SELECT id FROM stores WHERE name = ?", (store_name,)).fetchone()
    if not store:
        conn.execute("INSERT INTO stores (name, region_id) VALUES (?, ?)", (store_name, region["id"]))
    else:
        conn.execute("UPDATE stores SET region_id = ? WHERE id = ?", (region["id"], store["id"]))
    conn.commit()
    print(f"門店「{store_name}」已指定到區域「{region_name}」")


def add_user(name, pin, role, store_names=None, region_name=None):
    """store_names: list of store name strings (a store_manager may cover more than one)."""
    conn = db()
    store_names = store_names or []
    store_ids = []
    for store_name in store_names:
        store = conn.execute("SELECT id, region_id FROM stores WHERE name = ?", (store_name,)).fetchone()
        if not store:
            print(f"找不到門店「{store_name}」")
            return
        store_ids.append(store["id"])
    home_store_id = store_ids[0] if store_ids else None
    region_id = None
    if region_name:
        region = conn.execute("SELECT id FROM regions WHERE name = ?", (region_name,)).fetchone()
        if not region:
            print(f"找不到區域「{region_name}」")
            return
        region_id = region["id"]
    pin_hash = generate_password_hash(str(pin), method="pbkdf2:sha256")
    conn.execute(
        """INSERT INTO users (name, pin_hash, role, home_store_id, region_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET pin_hash=excluded.pin_hash, role=excluded.role,
               home_store_id=excluded.home_store_id, region_id=excluded.region_id""",
        (name, pin_hash, role, home_store_id, region_id, datetime.now().isoformat(timespec="seconds")),
    )
    user_id = conn.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchone()["id"]
    conn.execute("DELETE FROM user_stores WHERE user_id = ?", (user_id,))
    conn.executemany(
        "INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?, ?)",
        [(user_id, sid) for sid in store_ids],
    )
    conn.commit()
    print(f"帳號已建立/更新：{name}（角色：{role}，門店：{store_names}，區域：{region_name}，PIN：{pin}）")


def list_all():
    conn = db()
    print("=== 區域 ===")
    for r in conn.execute("SELECT * FROM regions"):
        print(f"  {r['id']}: {r['name']}")
    print("=== 門店 ===")
    for r in conn.execute("SELECT s.*, r.name AS region_name FROM stores s LEFT JOIN regions r ON r.id = s.region_id"):
        print(f"  {r['id']}: {r['name']} (區域: {r['region_name']})")
    print("=== 帳號 ===")
    for r in conn.execute(
        "SELECT u.*, r.name AS region_name FROM users u LEFT JOIN regions r ON r.id = u.region_id"
    ):
        stores = [
            row["name"]
            for row in conn.execute(
                "SELECT s.name FROM user_stores us JOIN stores s ON s.id = us.store_id WHERE us.user_id = ?",
                (r["id"],),
            )
        ]
        print(f"  {r['id']}: {r['name']} ({r['role']}) 門店:{stores or r['home_store_id']} 區域:{r['region_name']}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)
    cmd = args[0]
    if cmd == "add-region":
        add_region(args[1])
    elif cmd == "assign-store":
        assign_store(args[1], args[2])
    elif cmd == "add-user":
        name, pin, role = args[1], args[2], args[3]
        store_names = []
        region_name = None
        if "--store" in args:
            store_names = [args[args.index("--store") + 1]]
        if "--region" in args:
            region_name = args[args.index("--region") + 1]
        add_user(name, pin, role, store_names, region_name)
    elif cmd == "list":
        list_all()
    else:
        print(__doc__)
