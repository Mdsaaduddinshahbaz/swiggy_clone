"""
MongoDB data layer for the restaurant app.

Collections (names kept exactly as they are in the database):
  restaurants_name   restaurants
  resturants_items   menu items. item_qty = stock left right now, sold = total sold so far
  seller_orders      ALL orders. One document per restaurant per checkout.
                     (The old "Orders" collection is no longer used.)
  categories         one document per restaurant: categories + subcategories
  users / owners     customers / restaurant owners

Links between documents (restaurant_id, resturant_id, user_id, ...) are stored as
strings. Only _id fields are ObjectIds.

Run migrate.py once before deploying this file.
"""
import hmac
import logging
import math
import os
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo import MongoClient, ReturnDocument, UpdateOne
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash, generate_password_hash

from redis_db import delete_cart, get_cart

load_dotenv(override=True)
log = logging.getLogger(__name__)

client = MongoClient(
    os.environ["MONGO_URI"],
    maxPoolSize=50,
    minPoolSize=5,                 # keep a few connections open and ready
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=15000,
    compressors="zlib",
)
db = client["restaurants"]

restaurants_col = db["restaurants_name"]
items_col = db["resturants_items"]
orders_col = db["seller_orders"]
categories_col = db["categories"]
users_col = db["users"]
owners_col = db["owners"]

DEFAULT_IMAGE_ID = "1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"

# "Today" and the chart days on the seller dashboard use this timezone (India = +330 min).
LOCAL_TZ = timezone(timedelta(minutes=int(os.getenv("TZ_OFFSET_MINUTES", "330"))))

# Order statuses. If the frontend sends a status that isn't listed here, add it.
CANCELED = ("canceled", "cancelled")
COMPLETED = ("completed",)
FINAL = CANCELED + COMPLETED
SELLER_STATUSES = {"accepted", "processing", "preparing", "ready", *FINAL}

_HASH_PREFIXES = ("scrypt:", "pbkdf2:")


class OutOfStock(Exception):
    """An item ran out between reading the cart and saving the order."""


class AlreadySetUp(Exception):
    """The owner doesn't exist or already has a restaurant."""


# --------------------------------------------------------------------- helpers

def _oid(value):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def _num(value, default=None):
    """'12' -> 12, 12.0 -> 12, '2.5' -> 2.5. Anything that isn't a number -> default."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(n):
        return default
    return int(n) if n.is_integer() else n


def _image_url(file_id):
    return f"https://drive.google.com/thumbnail?id={file_id or DEFAULT_IMAGE_ID}&sz=w1000"


def _now():
    return datetime.now(timezone.utc)


def _as_utc(t):
    """Mongo returns naive datetimes that are really UTC."""
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def _in_transaction(fn):
    """Run fn(session) inside a transaction. Retries on temporary errors by itself."""
    with client.start_session() as session:
        return session.with_transaction(fn)


# ------------------------------------------------------------- users & owners

def _password_ok(col, doc, password):
    stored = doc.get("password") or ""
    if stored.startswith(_HASH_PREFIXES):
        return check_password_hash(stored, password)
    # Old account with a plain-text password: check it once, then store a hash instead.
    if stored and hmac.compare_digest(stored.encode(), password.encode()):
        col.update_one({"_id": doc["_id"]}, {"$set": {"password": generate_password_hash(password)}})
        return True
    return False


def create_new_user(email, username, password, role):
    """role "seller" -> owners collection, anything else -> users."""
    doc = {
        "email": email,
        "username": username,
        "password": generate_password_hash(password),
        "role": role,
        "is_verified": False,
    }
    col = users_col
    if role == "seller":
        col = owners_col
        doc["is_setup"] = False
    try:
        return {"success": True, "id": str(col.insert_one(doc).inserted_id)}
    except DuplicateKeyError:
        return {"success": False, "message": "Email already exists"}


def check_existing_user(email, password):
    """-> {"status": "not_found" | "wrong_password" | "ok", ...}"""
    user = users_col.find_one({"email": email}, {"password": 1, "username": 1, "is_verified": 1})
    if user is None:
        return {"status": "not_found"}
    if not _password_ok(users_col, user, password):
        return {"status": "wrong_password"}
    return {
        "status": "ok",
        "user_id": str(user["_id"]),
        "username": user.get("username"),
        "is_verified": bool(user.get("is_verified")),
    }


def check_existing_owner(email, password):
    """-> {"status": "not_found" | "wrong_password" | "ok", ...}"""
    owner = owners_col.find_one(
        {"email": email},
        {"password": 1, "username": 1, "is_verified": 1, "is_setup": 1,
         "resturant_id": 1, "restaurant_name": 1},
    )
    if owner is None:
        return {"status": "not_found"}
    if not _password_ok(owners_col, owner, password):
        return {"status": "wrong_password"}
    return {
        "status": "ok",
        "owner_id": str(owner["_id"]),
        "username": owner.get("username"),
        "is_verified": bool(owner.get("is_verified")),
        "is_setup": bool(owner.get("is_setup")),
        "res_id": owner.get("resturant_id"),
        "res_name": owner.get("restaurant_name"),
    }


def set_verified(email, role):
    col = users_col if role == "user" else owners_col
    return col.update_one({"email": email}, {"$set": {"is_verified": True}}).matched_count == 1


def fetch_profiles(user_id):
    uid = _oid(user_id)
    if uid is None:
        return None
    user = users_col.find_one({"_id": uid}, {"_id": 0, "password": 0, "role": 0, "is_verified": 0})
    if user is None:
        return None
    for address in user.get("addresses", []):
        if "_id" in address:
            address["_id"] = str(address["_id"])
    return user


def update_profiles(user_id, name=None, phone=None):
    uid = _oid(user_id)
    if uid is None:
        return False
    fields = {key: value for key, value in (("username", name), ("phone", phone)) if value}
    if not fields:
        return True
    return users_col.update_one({"_id": uid}, {"$set": fields}).matched_count == 1


def save_address(address, address_type, user_id, coordinates):
    uid = _oid(user_id)
    if uid is None:
        return False
    entry = {"_id": ObjectId(), "address": address, "adrs_type": address_type, "coordinates": coordinates}
    return users_col.update_one({"_id": uid}, {"$push": {"addresses": entry}}).matched_count == 1


def fetch_address(user_id):
    """-> None if the user doesn't exist, otherwise a list (can be empty)."""
    uid = _oid(user_id)
    user = users_col.find_one({"_id": uid}, {"addresses": 1}) if uid else None
    if user is None:
        return None
    return [{
        "_id": str(a.get("_id", "")),
        "address": a.get("address"),
        "adrs_type": a.get("adrs_type"),
        "coordinates": a.get("coordinates"),
    } for a in user.get("addresses", [])]


# ----------------------------------------------------------------- restaurants

def add_resturants(name, shop_type, address, phone, owner_id, lng, lat, file_id=None):
    """Create the owner's restaurant and mark the owner as set up. Returns the restaurant id."""
    owner_oid = _oid(owner_id)
    if owner_oid is None:
        raise AlreadySetUp()
    res_oid = ObjectId()
    doc = {
        "_id": res_oid,
        "name": name,
        "type": shop_type,
        "address": address,
        "phone_no": phone,
        "ownerId": owner_id,
        "location": {"type": "Point", "coordinates": [float(lng), float(lat)]},
        "file_url": _image_url(file_id),
    }

    def txn(session):
        # Claim the owner first: a double-clicked "create" can't make two restaurants.
        claimed = owners_col.update_one(
            {"_id": owner_oid, "is_setup": {"$ne": True}},
            {"$set": {"is_setup": True, "restaurant_name": name, "resturant_id": str(res_oid)}},
            session=session,
        )
        if claimed.matched_count != 1:
            raise AlreadySetUp()
        restaurants_col.insert_one(doc, session=session)
        return str(res_oid)

    return _in_transaction(txn)


def list_resturants(lng, lat, dist_km=5, limit=100):
    pipeline = [
        {"$geoNear": {
            "near": {"type": "Point", "coordinates": [float(lng), float(lat)]},
            "key": "location",
            "distanceField": "distanceMeters",
            "maxDistance": dist_km * 1000,
            "spherical": True,
        }},
        {"$limit": limit},
        {"$project": {"name": 1, "address": 1, "file_url": 1, "type": 1, "distanceMeters": 1}},
    ]
    return {
        str(r["_id"]): {
            "res_name": r.get("name"),
            "address": r.get("address"),
            "file_url": r.get("file_url"),
            "type": r.get("type", "restaurant"),
            "distance_km": f"{r['distanceMeters'] / 1000:.1f}",
        }
        for r in restaurants_col.aggregate(pipeline)
    }


# ----------------------------------------------------------------------- items

def add_resturant_items(res_id, item_name, item_qty, price, sub_id, desc, unit, lowat, available, file_id=None):
    doc = {
        "resturant_id": res_id,
        "item_name": item_name,
        "item_qty": _num(item_qty, 0),
        "price": int(price),
        "sub_id": sub_id,
        "desc": desc,
        "unit": unit,
        "lowat": _num(lowat),
        "available": bool(available),
        "sold": 0,
        "file_url": _image_url(file_id),
    }
    if file_id:
        doc["file_id"] = file_id
    result = items_col.insert_one(doc)
    return {"id": str(result.inserted_id), "url": doc["file_url"]}


SELLER_ITEM_FIELDS = {"item_name": 1, "price": 1, "item_qty": 1, "sold": 1, "sub_id": 1, "desc": 1,
                      "unit": 1, "lowat": 1, "available": 1, "file_url": 1}
CUSTOMER_ITEM_FIELDS = {"item_name": 1, "price": 1, "item_qty": 1, "file_url": 1, "sub_id": 1}


def list_resturant_items(res_id, for_seller):
    categories = categories_col.find_one({"restaurant_id": res_id}, {"_id": 0})

    if for_seller:
        items = {
            str(r["_id"]): {
                "price": r.get("price"),
                "name": r.get("item_name"),
                "item_qty": r.get("item_qty", 0),
                "sold": r.get("sold", 0),
                "sub_id": r.get("sub_id"),
                "desc": r.get("desc", ""),
                "unit": r.get("unit"),
                "lowat": r.get("lowat"),
                "available": r.get("available", False),
                "file_url": r.get("file_url"),
            }
            for r in items_col.find({"resturant_id": res_id}, SELLER_ITEM_FIELDS)
        }
        return {"item_name": items, "categories": categories}

    # Customers only see what can be bought right now. item_qty IS the stock left.
    items = {}
    query = {"resturant_id": res_id, "available": True, "item_qty": {"$gt": 0}}
    for r in items_col.find(query, CUSTOMER_ITEM_FIELDS):
        name = key = r.get("item_name") or "Item"
        n = 2
        while key in items:            # two items with the same name: keep both
            key = f"{name} ({n})"
            n += 1
        items[key] = {
            "price": r.get("price"),
            "id": str(r["_id"]),
            "item_qty": r["item_qty"],
            "file_url": r.get("file_url"),
            "sub_id": r.get("sub_id"),
        }
    return {"item_name": items, "categories": categories}


def _owned_item_result(matched, item_oid):
    if matched:
        return {"success": True}
    exists = items_col.count_documents({"_id": item_oid}, limit=1)
    return {"success": False, "message": "Unauthorized" if exists else "Item not found"}


def update_resturant_item(item_id, res_id, name, price, unit, lowat, desc, sub_id, stock, available, file_id=None):
    iid = _oid(item_id)
    if iid is None:
        return {"success": False, "message": "Item not found"}
    fields = {
        "item_name": name,
        "price": int(price),
        "unit": unit,
        "lowat": _num(lowat),
        "desc": desc,
        "sub_id": sub_id,
        "item_qty": _num(stock, 0),
        "available": bool(available),
    }
    if file_id:                        # only replace the photo when a new one was uploaded
        fields["file_id"] = file_id
        fields["file_url"] = _image_url(file_id)
    result = items_col.update_one({"_id": iid, "resturant_id": res_id}, {"$set": fields})
    return _owned_item_result(result.matched_count, iid)


def remove_resturant_item(item_id, res_id):
    iid = _oid(item_id)
    if iid is None:
        return {"success": False, "message": "Item not found"}
    result = items_col.delete_one({"_id": iid, "resturant_id": res_id})
    return _owned_item_result(result.deleted_count, iid)


def get_item_for_cart(res_id, item_id):
    """The real name, price and stock of an item, for add-to-cart. None if not found."""
    iid = _oid(item_id)
    if iid is None:
        return None
    doc = items_col.find_one({"_id": iid, "resturant_id": res_id},
                             {"item_name": 1, "price": 1, "item_qty": 1, "available": 1})
    if doc is None:
        return None
    return {
        "name": doc.get("item_name") or "Item",
        "price": _num(doc.get("price"), 0),
        "item_qty": _num(doc.get("item_qty"), 0),
        "available": bool(doc.get("available")),
    }


def get_preview_items(res_ids, limit=4):
    """A few popular in-stock items per restaurant, for the home page cards, in one query."""
    res_ids = [str(r) for r in res_ids][:100]
    if not res_ids:
        return {}
    pipeline = [
        {"$match": {"resturant_id": {"$in": res_ids}, "available": True, "item_qty": {"$gt": 0}}},
        {"$sort": {"sold": -1}},
        {"$group": {
            "_id": "$resturant_id",
            "items": {"$push": {
                "id": {"$toString": "$_id"},
                "name": "$item_name",
                "price": "$price",
                "file_url": "$file_url",
            }},
        }},
        {"$project": {"items": {"$slice": ["$items", limit]}}},
    ]
    return {doc["_id"]: doc["items"] for doc in items_col.aggregate(pipeline)}


# ------------------------------------------------------------------ categories
# The counters next_category_id / next_subcat_id hold the LAST id handed out.

def save_category(res_id, cat_name, subcats):
    counters = categories_col.find_one_and_update(
        {"restaurant_id": res_id},
        {"$inc": {"next_category_id": 1, "next_subcat_id": len(subcats)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    first_sub_id = counters["next_subcat_id"] - len(subcats) + 1
    category = {
        "_id": counters["next_category_id"],
        "name": cat_name,
        "subcategories": [{"_id": first_sub_id + i, "name": s} for i, s in enumerate(subcats)],
    }
    categories_col.update_one({"restaurant_id": res_id}, {"$push": {"categories": category}})
    return category


def add_subcategory(res_id, category_id, subcat_name):
    counters = categories_col.find_one_and_update(
        {"restaurant_id": res_id, "categories._id": category_id},
        {"$inc": {"next_subcat_id": 1}},
        projection={"next_subcat_id": 1},
        return_document=ReturnDocument.AFTER,
    )
    if counters is None:
        return {"success": False, "error": "Category not found"}
    subcategory = {"_id": counters["next_subcat_id"], "name": subcat_name}
    categories_col.update_one(
        {"restaurant_id": res_id, "categories._id": category_id},
        {"$push": {"categories.$.subcategories": subcategory}},
    )
    return {"success": True, "subcategory": subcategory}


# ---------------------------------------------------------------------- orders

ORDER_FIELDS = {"user_id": 1, "token_no": 1, "restaurant_id": 1, "restaurant_name": 1,
                "items": 1, "status": 1, "time": 1, "pickup_time": 1, "total": 1}


def store_orders(user_id, pickup_time=None):
    """Checkout: turn the user's Redis cart into one order per restaurant.
    -> {"success": True, "restaurant_ids": [...], "token_no": "AB12CD"}
    or {"success": False, "message": "..."}"""
    cart = get_cart(user_id)
    if not cart or not cart.get("cart"):
        return {"success": False, "message": "Your cart is empty"}

    # 1. read every item in the cart with one query
    item_oids = [_oid(item_id) for res in cart["cart"].values() for item_id in res["items"]]
    if None in item_oids:
        return {"success": False, "message": "Item no longer available"}
    fresh = {
        str(d["_id"]): d
        for d in items_col.find({"_id": {"$in": item_oids}},
                                {"item_name": 1, "price": 1, "item_qty": 1, "available": 1, "resturant_id": 1})
    }

    # 2. check every line against the database; build the orders and the stock updates
    token = uuid.uuid4().hex[:6].upper()
    now = _now()
    orders, stock_updates = [], []
    for res_id, res in cart["cart"].items():
        lines = {}
        for item_id, line in res["items"].items():
            item = fresh.get(item_id)
            if item is None or item.get("resturant_id") != res_id:
                return {"success": False, "message": "Item no longer available"}
            name = item.get("item_name") or "Item"
            qty = int(line["qty"])
            price = _num(item.get("price"), 0)
            stock = _num(item.get("item_qty"), 0)
            if not item.get("available"):
                return {"success": False, "message": f"{name} is unavailable"}
            if stock < qty:
                return {"success": False, "message": f"{name} has only {stock} left"}
            if price != _num(line.get("price"), 0):
                log.info("price changed: user=%s item=%s cart=%s now=%s", user_id, item_id, line.get("price"), price)
                return {"success": False, "message": f"Price changed for {name}, please review your cart"}

            lines[item_id] = {"item": name, "name": name, "qty": qty, "price": price}
            # The stock check is part of the filter, so two people can't both buy the last one.
            stock_updates.append(UpdateOne(
                {"_id": item["_id"], "available": True, "item_qty": {"$gte": qty}},
                {"$inc": {"item_qty": -qty, "sold": qty}},
            ))
        orders.append({
            "user_id": user_id,
            "token_no": token,
            "restaurant_id": res_id,
            "restaurant_name": res.get("name"),
            "items": lines,
            "total": sum(line["qty"] * line["price"] for line in lines.values()),
            "status": "placed",
            "time": now,
            "pickup_time": pickup_time,
        })

    # 3. take the stock and save the orders together. If anything ran out meanwhile, nothing is saved.
    def txn(session):
        result = items_col.bulk_write(stock_updates, session=session)
        if result.matched_count != len(stock_updates):
            raise OutOfStock()
        orders_col.insert_many([dict(o) for o in orders], session=session)

    try:
        _in_transaction(txn)
    except OutOfStock:
        return {"success": False, "message": "Some items just sold out, please review your cart"}

    delete_cart(user_id)
    return {"success": True, "restaurant_ids": [o["restaurant_id"] for o in orders], "token_no": token}


def get_orders(user_id, limit=50):
    """The customer's latest orders, newest first."""
    cursor = orders_col.find({"user_id": user_id}, ORDER_FIELDS).sort("time", -1).limit(limit)
    return [{
        "order_id": str(o["_id"]),
        "token_no": o.get("token_no"),
        "resturants": {o.get("restaurant_id"): {"name": o.get("restaurant_name"), "items": o.get("items", {})}},
        "status": o.get("status"),
        "date": o.get("time"),
        "pickup_time": o.get("pickup_time"),
        "total": o.get("total"),
    } for o in cursor]


def get_seller_orders(res_id, limit=100):
    """The restaurant's latest orders, newest first."""
    cursor = orders_col.find({"restaurant_id": res_id}, ORDER_FIELDS).sort("time", -1).limit(limit)
    return [{
        "order_id": str(o["_id"]),
        "token_no": o.get("token_no"),
        "user_id": o.get("user_id"),
        "items": o.get("items", {}),
        "status": o.get("status"),
        "time": o.get("time"),
        "pickup_time": o.get("pickup_time"),
        "total": o.get("total"),
    } for o in cursor]


def _restock(items, session):
    """Give the stock of a canceled order back."""
    updates = []
    for item_id, line in (items or {}).items():
        iid = _oid(item_id)
        qty = int(_num(line.get("qty"), 0)) if isinstance(line, dict) else 0
        if iid and qty > 0:
            updates.append(UpdateOne({"_id": iid}, {"$inc": {"item_qty": qty, "sold": -qty}}))
    if updates:
        items_col.bulk_write(updates, session=session)


def update_order_status_seller(order_id, status, res_id):
    """Sellers can move an order to any status in SELLER_STATUSES, until it is completed or canceled."""
    oid = _oid(order_id)
    if oid is None or status not in SELLER_STATUSES:
        return {"success": False, "message": "Invalid order or status"}
    query = {"_id": oid, "restaurant_id": res_id, "status": {"$nin": list(FINAL)}}
    update = {"$set": {"status": status, "updated_at": _now()}}

    if status in CANCELED:
        def txn(session):
            doc = orders_col.find_one_and_update(query, update, projection={"items": 1, "user_id": 1},
                                                 session=session)
            if doc:
                _restock(doc["items"], session)
            return doc
        doc = _in_transaction(txn)
    else:
        doc = orders_col.find_one_and_update(query, update, projection={"user_id": 1})

    if doc is None:
        return {"success": False, "message": "Order not found, not yours, or already finished"}
    return {"success": True, "user_id": doc.get("user_id")}


def update_order_status_user(order_id, status, user_id):
    """Customers can only cancel, and only before the restaurant has started on the order."""
    oid = _oid(order_id)
    if oid is None or status not in CANCELED:
        return {"success": False, "message": "You can only cancel an order"}

    def txn(session):
        doc = orders_col.find_one_and_update(
            {"_id": oid, "user_id": user_id, "status": "placed"},
            {"$set": {"status": status, "updated_at": _now()}},
            projection={"items": 1, "restaurant_id": 1},
            session=session,
        )
        if doc:
            _restock(doc["items"], session)
        return doc

    doc = _in_transaction(txn)
    if doc is None:
        return {"success": False, "message": "Order not found, not yours, or already accepted"}
    return {"success": True, "res_ids": [doc.get("restaurant_id")]}


def verify_order(res_id, order_id):
    """The customer's user_id if this order belongs to this restaurant, else None."""
    oid = _oid(order_id)
    doc = orders_col.find_one({"_id": oid, "restaurant_id": res_id}, {"user_id": 1}) if oid else None
    return doc.get("user_id") if doc else None


# ------------------------------------------------------------ stats & analytics

def resturant_stats(res_id):
    counts = {d["_id"]: d["n"] for d in orders_col.aggregate([
        {"$match": {"restaurant_id": res_id}},
        {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ])}
    total = sum(counts.values())
    completed = sum(counts.get(s, 0) for s in COMPLETED)
    canceled = sum(counts.get(s, 0) for s in CANCELED)
    return {"Total_orders": total, "completed": completed, "canceled": canceled,
            "pending": total - completed - canceled}


def return_res_analytics(res_id):
    result = []
    for d in items_col.find({"resturant_id": res_id}, {"item_name": 1, "item_qty": 1, "sold": 1}):
        remaining, sold = _num(d.get("item_qty"), 0), _num(d.get("sold"), 0)
        result.append({"item_name": d.get("item_name"), "initial_qty": remaining + sold,
                       "sold": sold, "remaining": remaining})
    return result


def _order_amount(order, price_by_id):
    """Order total. New orders store it; very old ones are added up from their lines."""
    if order.get("total") is not None:
        return order["total"]
    total = 0
    for item_id, line in (order.get("items") or {}).items():
        if isinstance(line, dict):
            price = line.get("price", price_by_id.get(item_id, 0))
            total += _num(price, 0) * _num(line.get("qty"), 0)
    return total


def _line_name(item_id, line, names_by_id):
    if isinstance(line, dict) and (line.get("item") or line.get("name")):
        return line.get("item") or line.get("name")
    return names_by_id.get(item_id) or "Unknown"


ANALYTICS_ORDER_FIELDS = {"items": 1, "status": 1, "time": 1, "token_no": 1, "user_id": 1, "total": 1}


def get_seller_analytics(res_id):
    """Everything the seller dashboard shows."""
    items = list(items_col.find(
        {"resturant_id": res_id},
        {"item_name": 1, "item_qty": 1, "sold": 1, "lowat": 1, "price": 1, "sub_id": 1, "unit": 1},
    ))
    price_by_id = {str(i["_id"]): _num(i.get("price"), 0) for i in items}
    names_by_id = {str(i["_id"]): i.get("item_name") for i in items}

    today = datetime.now(LOCAL_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today.replace(day=1)
    chart_start = today - timedelta(days=30)

    # Only the orders the KPIs and the chart need, newest first.
    window = list(orders_col.find(
        {"restaurant_id": res_id, "time": {"$gte": min(chart_start, month_start)}},
        ANALYTICS_ORDER_FIELDS,
    ).sort("time", -1))

    # All-time revenue and open orders: the database adds these up.
    totals = next(orders_col.aggregate([
        {"$match": {"restaurant_id": res_id}},
        {"$group": {
            "_id": None,
            "revenue": {"$sum": {"$cond": [{"$in": ["$status", list(CANCELED)]}, 0, {"$ifNull": ["$total", 0]}]}},
            "active": {"$sum": {"$cond": [{"$in": ["$status", list(FINAL)]}, 0, 1]}},
        }},
    ]), {"revenue": 0, "active": 0})

    today_revenue = month_revenue = 0
    today_orders = month_orders = 0
    daily = defaultdict(float)
    for order in window:
        if order.get("status") in CANCELED or not order.get("time"):
            continue
        t = _as_utc(order["time"]).astimezone(LOCAL_TZ)
        amount = _order_amount(order, price_by_id)
        if t >= chart_start:
            daily[t.strftime("%b %d")] += amount
        if t >= month_start:
            month_revenue += amount
            month_orders += 1
        if t >= today:
            today_revenue += amount
            today_orders += 1

    labels = [(today - timedelta(days=i)).strftime("%b %d") for i in range(30, -1, -1)]
    values = [round(daily.get(label, 0), 2) for label in labels]

    inventory, low_stock, out_of_stock = [], [], []
    for item in items:
        remaining = _num(item.get("item_qty"), 0)      # item_qty IS what's left
        sold = _num(item.get("sold"), 0)
        price = _num(item.get("price"), 0)
        low_at = _num(item.get("lowat"), 10)
        entry = {
            "item_id": str(item["_id"]),
            "item_name": item.get("item_name"),
            "sub_id": item.get("sub_id"),
            "unit": item.get("unit"),
            "price": price,
            "initial_qty": remaining + sold,
            "sold": sold,
            "remaining": remaining,
            "revenue": round(sold * price, 2),
        }
        inventory.append(entry)
        alert = {"item_name": entry["item_name"], "sub_id": entry["sub_id"]}
        if remaining <= 0:
            out_of_stock.append({**alert, "stock": 0, "status": "out"})
        elif remaining <= low_at:
            low_stock.append({**alert, "stock": remaining, "status": "low"})

    latest = window[:10]
    if len(latest) < 10:    # quiet month: show the latest 10 overall
        latest = list(orders_col.find({"restaurant_id": res_id}, ANALYTICS_ORDER_FIELDS)
                      .sort("time", -1).limit(10))
    recent_orders = [{
        "order_id": str(o["_id"]),
        "customer_id": o.get("user_id"),
        "items_summary": ", ".join(_line_name(k, v, names_by_id)
                                   for k, v in list((o.get("items") or {}).items())[:3]),
        "total_amount": round(_order_amount(o, price_by_id), 2),
        "status": o.get("status"),
        "tokenNo": o.get("token_no"),
        "created_at": _as_utc(o["time"]).isoformat() if o.get("time") else None,
    } for o in latest]

    return {
        "kpis": {
            "total_revenue": round(totals["revenue"], 2),
            "month_revenue": round(month_revenue, 2),
            "month_orders": month_orders,
            "today_revenue": round(today_revenue, 2),
            "today_orders": today_orders,
            "total_items": len(items),
            "low_stock_count": len(low_stock),
            "out_of_stock_count": len(out_of_stock),
        },
        "chart": {"labels": labels, "values": values},
        "top_products": sorted(inventory, key=lambda x: x["sold"], reverse=True)[:5],
        "stock_alerts": out_of_stock + low_stock,
        "recent_orders": recent_orders,
        "inventory": inventory,
        "active_orders": totals["active"],
    }
