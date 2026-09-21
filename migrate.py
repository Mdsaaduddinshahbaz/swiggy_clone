"""
One-time data fix for the new code. Run it BEFORE deploying the new files.
Safe to run again: it only changes what still needs changing.

  1. Back up:  Atlas -> your cluster -> Backup,  or  mongodump --uri "<MONGO_URI>"
  2. python migrate.py
  3. Deploy database.py, redis_db.py, server.py, validators.py

It never deletes anything. At the end it tells you which old collections you can drop.
"""
import os

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

load_dotenv(override=True)
db = MongoClient(os.environ["MONGO_URI"])["restaurants"]

items = db["resturants_items"]
orders = db["seller_orders"]
legacy_orders = db["Orders"]
categories = db["categories"]
users = db["users"]
owners = db["owners"]
restaurants = db["restaurants_name"]


def number(value, whole=False):
    if value is None or isinstance(value, bool):
        raise ValueError(value)
    n = float(value.strip() if isinstance(value, str) else value)
    if whole:
        return int(round(n))
    return int(n) if n.is_integer() else n


def write(col, ops):
    for i in range(0, len(ops), 1000):
        col.bulk_write(ops[i:i + 1000], ordered=False)
    return len(ops)


def fix_item_fields():
    """Numbers saved as text -> numbers. "true"/"false" text -> real true/false."""
    ops, bad = [], []
    for d in items.find({}, {"item_name": 1, "item_qty": 1, "sold": 1, "lowat": 1, "price": 1, "available": 1}):
        new = {}
        try:
            for field, whole in (("item_qty", False), ("sold", True), ("price", True)):
                old = d.get(field)
                n = number(0 if old in (None, "") else old, whole)
                if field not in d or type(n) is not type(old) or n != old:
                    new[field] = n
            lowat = d.get("lowat")
            if isinstance(lowat, str):
                new["lowat"] = number(lowat) if lowat.strip() else None
        except (TypeError, ValueError):
            bad.append(f'{d["_id"]} ({d.get("item_name")})')
            continue
        available = d.get("available", True)
        if not isinstance(available, bool):
            new["available"] = str(available).strip().lower() not in ("false", "0", "", "no", "off", "none")
        if new:
            ops.append(UpdateOne({"_id": d["_id"]}, {"$set": new}))
    print(f"items: fixed {write(items, ops)}")
    for b in bad:
        print(f"  !! could not read the numbers of item {b} - fix it by hand in Compass")


def copy_legacy_orders():
    """Orders that only exist in the old "Orders" collection get copied into seller_orders."""
    copied_parents = {p for p in orders.distinct("parent_order_id") if p}
    new_docs, skipped = [], 0
    for o in legacy_orders.find():
        if str(o["_id"]) in copied_parents:
            continue
        per_restaurant = o.get("items")
        if not isinstance(per_restaurant, dict):
            skipped += 1
            continue
        for res_id, res in per_restaurant.items():
            if not isinstance(res, dict) or not isinstance(res.get("items"), dict):
                skipped += 1
                continue
            new_docs.append({
                "user_id": o.get("user_id"),
                "token_no": o.get("token_no"),
                "restaurant_id": res_id,
                "restaurant_name": res.get("name"),
                "items": res["items"],
                "status": o.get("status", "placed"),
                "time": o.get("time"),
                "pickup_time": o.get("pickup_time"),
                "parent_order_id": str(o["_id"]),
            })
    if new_docs:
        orders.insert_many(new_docs)
    print(f"orders: copied {len(new_docs)} old orders from Orders into seller_orders"
          + (f" ({skipped} had an unknown shape and were skipped)" if skipped else ""))


def fix_orders():
    """restaurant_id on every order, and a saved total (the dashboard adds these up)."""
    ops = [UpdateOne({"_id": o["_id"]}, {"$set": {"restaurant_id": o["res_id"]}})
           for o in orders.find({"restaurant_id": {"$exists": False}, "res_id": {"$exists": True}}, {"res_id": 1})]
    print(f"orders: added restaurant_id to {write(orders, ops)}")

    price_by_id = {str(d["_id"]): d.get("price", 0) for d in items.find({}, {"price": 1})}
    ops = []
    for o in orders.find({"total": {"$exists": False}}, {"items": 1}):
        total = 0
        lines = o.get("items") if isinstance(o.get("items"), dict) else {}
        for item_id, line in lines.items():
            if not isinstance(line, dict):
                continue
            try:
                total += number(line.get("price", price_by_id.get(item_id, 0))) * number(line.get("qty", 0))
            except (TypeError, ValueError):
                pass
        ops.append(UpdateOne({"_id": o["_id"]}, {"$set": {"total": total}}))
    print(f"orders: saved a total on {write(orders, ops)}")


def fix_addresses():
    """Every saved address needs an _id (the app reads it)."""
    ops = []
    for u in users.find({"addresses": {"$elemMatch": {"_id": {"$exists": False}}}}, {"addresses": 1}):
        fixed = [{**a, "_id": a.get("_id") or ObjectId()} for a in u["addresses"]]
        ops.append(UpdateOne({"_id": u["_id"]}, {"$set": {"addresses": fixed}}))
    print(f"users: gave address ids to {write(users, ops)} users")


def fix_category_ids():
    """The old save_category gave the first two categories the same _id. Renumber the duplicates."""
    ops = []
    for doc in categories.find({}, {"categories": 1, "next_category_id": 1}):
        cats = doc.get("categories") or []
        last = max([doc.get("next_category_id") or 0]
                   + [c["_id"] for c in cats if isinstance(c.get("_id"), int)])
        seen, changed = set(), False
        for c in cats:
            if c.get("_id") in seen:
                last += 1
                c["_id"] = last
                changed = True
            seen.add(c.get("_id"))
        if changed:
            ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": {"categories": cats, "next_category_id": last}}))
    print(f"categories: fixed duplicate ids in {write(categories, ops)} restaurants")

    dupes = list(categories.aggregate([
        {"$group": {"_id": "$restaurant_id", "n": {"$sum": 1}}},
        {"$match": {"n": {"$gt": 1}}},
    ]))
    for d in dupes:
        print(f"  !! restaurant {d['_id']} has {d['n']} categories documents - merge them into one "
              "in Compass, then run this script again")


def create_indexes():
    specs = [
        (items, [("resturant_id", 1), ("available", 1)], {}),
        (orders, [("restaurant_id", 1), ("time", -1)], {}),
        (orders, [("user_id", 1), ("time", -1)], {}),
        (categories, [("restaurant_id", 1)], {"unique": True}),
        (users, [("email", 1)], {"unique": True}),
        (owners, [("email", 1)], {"unique": True}),
        (restaurants, [("location", "2dsphere")], {}),
    ]
    for col, keys, options in specs:
        try:
            col.create_index(keys, **options)
            print(f"index ok: {col.name} {keys}")
        except Exception as e:
            print(f"  !! index failed: {col.name} {keys}: {e}")


def report_unused():
    for name in ("Orders", "customers", "customer_carts"):
        count = db[name].count_documents({})
        if count:
            print(f"'{name}' is no longer used ({count} docs). Once the app works, you can drop it: "
                  f"db.{name}.drop()")


if __name__ == "__main__":
    fix_item_fields()
    copy_legacy_orders()
    fix_orders()
    fix_addresses()
    fix_category_ids()
    create_indexes()
    report_unused()
    print("done")
