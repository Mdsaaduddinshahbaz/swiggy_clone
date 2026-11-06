from pymongo import MongoClient, UpdateOne, ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure
from dotenv import load_dotenv
import re
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import math
import time
import uuid
import os

from redis_db import (
    delete_cart,
    get_cart,
    get_cached_delivery,
    set_cached_delivery,
    invalidate_restaurant_delivery,
    get_cached_online,
    set_cached_online,
)

load_dotenv(override=True)
api = os.getenv("MONGO_URI", None)
client = MongoClient(api)
try:
    client.admin.command('ping')
    print("Connected successfullyto MongoDB Atlas!")
except Exception as e:
    print("Connection failed:", e)

db = client["restaurants"]
restaurants_name = db["restaurants_name"]
resturants_items = db["resturants_items"]
offers = db["offers"]
seller_payouts = db["seller_payouts"]
owners = db["owners"]
customers = db["customers"]
customer_carts = db["customer_carts"]
# NOTE: the old "Orders" collection is gone. seller_orders is now the single
# source of truth: one doc per restaurant per checkout, tied together by "checkout_id".
seller_orders = db["seller_orders"]
users = db["users"]
categories = db["categories"]
MAX_RETRIES = 5
users.create_index("email", unique=True)
owners.create_index("email", unique=True)
# seller_orders is now queried by user (order history), by checkout (cancel) and by restaurant (seller dashboard)
seller_orders.create_index([("user_id", 1), ("time", 1)])
seller_orders.create_index([("checkout_id", 1), ("user_id", 1)])
seller_orders.create_index([("restaurant_id", 1), ("time", -1)])
offers.create_index([("restaurant_id", 1), ("code", 1)], unique=True)
seller_payouts.create_index([("restaurant_id", 1), ("date", -1)])
support_tickets = db["support_tickets"]
support_tickets.create_index([("user_id", 1), ("checkout_id", 1), ("category", 1), ("created_at", -1)])
support_tickets.create_index([("restaurant_ids", 1), ("created_at", -1)])
support_tickets.create_index([("ticket_id", 1)], unique=True)


class InventoryError(Exception):
    """Raised inside the order transaction when stock changed under us."""
    pass


def add_resturant_owner(username, password):
    owners.insert_one({"username": username, "password": password})


def add_resturants(name, shop_type, address, phone, owner_id, long, latt, delivery_available=False, delivery_radius=0, file_id="1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"):
    with client.start_session() as session:
        with session.start_transaction():

            result = restaurants_name.insert_one({"name": name, "type": shop_type, "address": address, "phone_no": phone, "ownerId": owner_id, "location": {"type": "Point", "coordinates": [long, latt]}, "file_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000", "delivery_available": delivery_available, "delivery_radius": delivery_radius, "is_online": True}, session=session)

            owners.update_one(
                {"_id": ObjectId(owner_id)},
                {
                    "$set": {
                        "is_setup": True,
                        "restaurant_name": name,
                        "resturant_id": str(result.inserted_id)
                    }
                },
                session=session
            )
    return str(result.inserted_id)


def add_resturant_items(resturant_id, item_name, item_qty, price, sub_id, desc, unit, lowat, available, sold=0, file_id="1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"):
    ret = resturants_items.insert_one({"resturant_id": resturant_id, "item_name": item_name, "item_qty": item_qty, "price": price, "sub_id": sub_id, "desc": desc, "unit": unit, "lowat": lowat, "available": available, "sold": sold, "file_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"})
    return ({"id": str(ret.inserted_id), "url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"})


def list_resturant_items(resturant_id, types):
    cat = categories.find_one({"restaurant_id": resturant_id}, {"_id": 0})
    if (types == "seller"):
        res = resturants_items.find({"resturant_id": resturant_id})
        item_name = {}
        for r in res:
            item_name[str(r["_id"])] = {
                "price": r["price"],
                "name": r["item_name"],
                "item_qty": r["item_qty"],
                "sold": r["sold"],
                "sub_id": r["sub_id"],
                "desc": r["desc"],
                "unit": r["unit"],
                "lowat": r["lowat"],
                "available": r["available"],
                "file_url": r["file_url"]
            }
        return ({"item_name": item_name, "categories": cat})
    else:
        res = resturants_items.find({"resturant_id": resturant_id})
        item_name = {}
        for r in res:
            if ((int(r["item_qty"]) - int(r["sold"])) > 0):
                item_name[r["item_name"]] = {
                    "price": r["price"],
                    "id": str(r["_id"]),
                    "item_qty": (int(r["item_qty"]) - int(r["sold"])),
                    "file_url": r["file_url"],
                    "sub_id": r["sub_id"]
                }
        return ({"item_name": item_name, "categories": cat})


def update_resturant_item(item_id, name, price, unit, lowAt, desc, subId, stock, available, res_id=None, file_id="1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"):
    result = resturants_items.find_one_and_update({
        "_id": ObjectId(item_id),
        "resturant_id": res_id
    },
        {"$set":
            {"item_name": name,
             "price": int(price),
             "unit": unit,
             "lowat": lowAt,
             "desc": desc,
             "sub_id": subId,
             "item_qty": stock,
             "available": available,
             "file_id": file_id,
             "file_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"
             }
         }
    )
    if (result):
        return ({"success": True})
    # Only on failure
    item = resturants_items.find_one({"_id": ObjectId(item_id)})

    if item is None:
        return {"success": False, "message": "Item not found"}

    return {"success": False, "message": "Unauthorized"}


def fetch_profiles(user_id):
    user = users.find_one({"_id": ObjectId(user_id)}, {"_id": 0, "password": 0, "role": 0, "is_verified": 0})
    if user:
        print("user=", user)
        for key in user.get("addresses", []):
            print("key=", key)
            key["_id"] = str(key["_id"])
        return {"success": True, "profile": user}
    else:
        return {"success": False, "message": "User not found"}


def update_profiles(user_id, name, phone):
    result = users.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": {"username": name, "phone": phone}},
        return_document=ReturnDocument.AFTER
    )
    if result:
        return {"success": True}
    else:
        return {"success": False, "message": "User not found"}


def list_resturants(long, latt, dist: int = 5):
    restaurants = restaurants_name.aggregate([
        {
            "$geoNear": {
                "near": {
                    "type": "Point",
                    "coordinates": [long, latt]
                },
                "key": "location",
                "distanceField": "distanceMeters",
                "maxDistance": dist * 1000,
                "spherical": True
            }
        }
    ])
    res_names = {}
    for r in restaurants:
        print(r.get("delivery_available"))
        res_names[str(r["_id"])] = {"res_name": r["name"], "address": r["address"], "file_url": r["file_url"], "type": r.get("type", "restaurant"), "distance_km": f"{r['distanceMeters'] / 1000:.1f}", "delivery_available": r.get("delivery_available"), "delivery_radius": r.get("delivery_radius", 0), "is_online": _to_bool(r.get("is_online", True))}
    return res_names


# =========================================================
# Restaurant online status (Redis key of its own, Mongo is source of truth)
# =========================================================

def _to_bool(v):
    return str(v).lower() in ("true", "1")


def is_restaurant_online(res_id):
    """Redis first, Mongo on miss. Missing field = online (legacy docs)."""
    cached = get_cached_online(res_id)
    if cached is not None:
        return cached
    try:
        doc = restaurants_name.find_one({"_id": ObjectId(res_id)}, {"is_online": 1})
    except Exception:
        return False
    if not doc:
        return False
    online = _to_bool(doc.get("is_online", True))
    set_cached_online(res_id, online)
    return online


def set_restaurant_online(res_id, online: bool):
    """Mongo first (source of truth), then Redis."""
    try:
        result = restaurants_name.update_one(
            {"_id": ObjectId(res_id)},
            {"$set": {"is_online": online}}
        )
    except Exception:
        return False
    if result.matched_count == 0:
        return False
    set_cached_online(res_id, online)
    invalidate_restaurant_delivery(res_id)
    return True


# =========================================================
# Restaurant delivery details (cached in Redis)
# =========================================================

def get_restaurant_delivery(res_id):
    cached = get_cached_delivery(res_id)
    if cached:
        data = dict(cached)
        data["is_online"] = is_restaurant_online(res_id)   # always live
        return data

    try:
        doc = restaurants_name.find_one(
            {"_id": ObjectId(res_id)},
            {"_id": 0, "delivery_available": 1, "delivery_radius": 1, "location": 1}
        )
    except Exception:
        return None
    if not doc:
        return None

    coords = (doc.get("location") or {}).get("coordinates") or [None, None]
    try:
        radius = int(doc.get("delivery_radius") or 0)
    except (TypeError, ValueError):
        radius = 0

    data = {
        "delivery_available": _to_bool(doc.get("delivery_available", False)),
        "delivery_radius": radius,
        "long": coords[0],
        "latt": coords[1],
    }
    set_cached_delivery(res_id, data)          # no is_online in the cache
    return {**data, "is_online": is_restaurant_online(res_id)}


def _haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def get_user_address(user_id, address_id):
    """Fetch one saved address, scoped to this user (prevents using someone else's)."""
    try:
        doc = users.find_one(
            {"_id": ObjectId(user_id), "addresses._id": ObjectId(address_id)},
            {"addresses.$": 1}
        )
    except Exception:
        return None
    if not doc or not doc.get("addresses"):
        return None
    return doc["addresses"][0]


def add_new_customer(username, password):
    customers.insert_one({"username": username, "password": password})


def add_customer_items(item_name, resturant_id, item_id):
    customer_carts.insert_one({"item_name": item_name, "resturant_id": resturant_id, "item_id": item_id})


def remove_itemss(item_id, res_id=None):
    result = resturants_items.find_one_and_delete({
        "_id": ObjectId(item_id),
        "resturant_id": res_id
    })
    if (result):
        return ({"success": True})
    # Only on failure
    item = resturants_items.find_one({"_id": ObjectId(item_id)})

    if item is None:
        return {"success": False, "message": "Item not found"}

    return {"success": False, "message": "Unauthorized"}


def normalize_cart(items):
    print("items in normalize", items)
    normalized = {}

    for res_id, data in items.items():
        res_name = data.get("name", "unknown")

        # If items is already dict -> OK
        if isinstance(data["items"], dict):
            normalized[res_id] = data

        # If items is list -> convert to dict
        elif isinstance(data["items"], list):
            item_dict = {}
            for item in data["items"]:
                item_name = item.get("name", "item")
                item_dict[item_name] = item

            normalized[res_id] = {
                "name": res_name,
                "items": item_dict
            }

    return normalized


def generate_token():
    while True:
        token = str(uuid.uuid4())[:6].upper()
        return token


# =========================================================
# Orders (seller_orders is the single source of truth)
#
# One seller_orders doc per restaurant per checkout. All docs created by the
# same checkout share the same "checkout_id" - that is what the customer sees
# as "an order" (it replaces the old parent doc in the Orders collection).
#
#   {
#     _id, checkout_id, user_id, token_no,
#     restaurant_id, restaurant_name, items,
#     status, time, pickup_time, order_type, delivery_address,
#     subtotal, discount, coupon (snapshot of the rules used), total
#   }
# =========================================================

def store_orders(userid, pickup_time=None, order_type="pickup", address_id=None, coupon_code=None):
    token = generate_token()
    items = get_cart(userid)

    if not items or not items.get("cart"):
        return 404

    # ---- store must be online (authoritative check; client checks are UX only) ----
    for rid in items["cart"].keys():
        if not is_restaurant_online(rid):
            return {
                "success": False,
                "code": "STORE_OFFLINE",
                "message": f"{items['cart'][rid]['name']} is currently offline. Your order wasn't placed."
            }

    # ---- delivery validation (server-side; the client check is UX only) ----
    delivery_address = None
    if order_type == "delivery":
        addr = get_user_address(userid, address_id) if address_id else None
        if not addr or not addr.get("coordinates"):
            return {"success": False, "message": "Please select a valid delivery address"}

        for rid in items["cart"].keys():
            d = get_restaurant_delivery(rid)
            if not d or not d["delivery_available"]:
                return {"success": False, "message": "This shop doesn't offer delivery. Please select pickup."}
            if d["long"] is None or d["latt"] is None:
                return {"success": False, "message": "Couldn't verify shop location. Please select pickup."}

            km = _haversine_km(
                float(addr["coordinates"]["latt"]), float(addr["coordinates"]["long"]),
                float(d["latt"]), float(d["long"])
            )
            if km > d["delivery_radius"]:
                return {"success": False, "message": f"Your location is {km:.1f} km away, outside the {d['delivery_radius']} km delivery range. Please change the location or select pickup."}

        # Snapshot (no _id) so it doesn't change if the user edits the address later
        delivery_address = {
            "address": addr.get("address"),
            "adrs_type": addr.get("adrs_type"),
            "phone": addr.get("phone"),
            "coordinates": addr.get("coordinates"),
        }

    current_time = datetime.utcnow()
    # Shared by every seller doc of this checkout; replaces the old parent order _id.
    # Generated once, outside the retry loop, so a retried transaction reuses it.
    checkout_id = str(ObjectId())
    seller_docs = []
    inventory_updates = []
    restaurant_ids = []
    coupon_code = str(coupon_code or "").strip().upper() or None
    coupon_used = False

    for restaurant_id, restaurant in items["cart"].items():
        item_ids = [ObjectId(iid) for iid in restaurant["items"].keys()]

        # authoritative read - never trust cart's stored price/qty limits
        fresh_docs = resturants_items.find(
            {"_id": {"$in": item_ids}},
            {"_id": 1, "price": 1, "available": 1, "item_qty": 1}
        )
        price_map = {str(d["_id"]): d for d in fresh_docs}

        restaurant_ids.append(restaurant_id)
        verified_items = {}

        for item_id, item in restaurant["items"].items():
            fresh = price_map.get(item_id)

            if not fresh:
                return {"success": False, "message": "Item no longer available"}

            if fresh["item_qty"] < item["qty"]:
                return {"success": False, "message": f"{item.get('name', 'Item')} is out of stock"}

            if fresh["price"] != item["price"]:
                # mismatch = tampering or stale-cache signal
                print(f"PRICE MISMATCH user={userid} item={item_id} cart={item['price']} actual={fresh['price']}")
                return {"success": False, "message": f"Price changed for {item.get('name', 'an item')}, please review your cart"}

            # use server price, never the cart's
            verified_item = dict(item)
            verified_item["price"] = fresh["price"]
            verified_items[item_id] = verified_item

            inventory_updates.append(
                UpdateOne(
                    {"_id": ObjectId(item_id), "item_qty": {"$gte": item["qty"]}},
                    {"$inc": {"item_qty": -item["qty"], "sold": item["qty"]}}
                )
            )

        # ---- coupon (server decides the discount, never the client) ----
        subtotal = sum(v["price"] * int(v["qty"]) for v in verified_items.values())
        discount, coupon_snapshot = 0, None

        if coupon_code and not coupon_used:
            offer = offers.find_one({"restaurant_id": restaurant_id, "code": coupon_code})
            if offer:   # a code only belongs to one restaurant
                err = _offer_error(offer, subtotal)
                if err:
                    return {"success": False, "code": "COUPON_INVALID", "message": err}
                discount = _discount_for(offer, subtotal)
                coupon_snapshot = {
                    "code": offer["code"], "type": offer["type"],
                    "value": offer["value"], "min_order": offer.get("min_order", 0),
                }
                coupon_used = True

        seller_docs.append({
            "checkout_id": checkout_id,
            "user_id": userid,
            "token_no": token,
            "restaurant_id": restaurant_id,
            "restaurant_name": restaurant["name"],
            "items": verified_items,
            "status": "placed",
            "time": current_time,
            "pickup_time": pickup_time,
            "order_type": order_type,
            "subtotal": subtotal,
            "discount": discount,
            "coupon": coupon_snapshot,
            "total": round(subtotal - discount, 2),
            "delivery_address": delivery_address
        })

    if coupon_code and not coupon_used:
        return {"success": False, "code": "COUPON_INVALID", "message": "Invalid coupon code"}

    for attempt in range(MAX_RETRIES):

        try:

            with client.start_session() as session:

                with session.start_transaction():

                    t = time.perf_counter()

                    if seller_docs:
                        seller_orders.insert_many(
                            seller_docs,
                            session=session
                        )

                    print("seller insert", time.perf_counter() - t)

                    t = time.perf_counter()

                    if inventory_updates:
                        inventory_result = resturants_items.bulk_write(
                            inventory_updates,
                            session=session
                        )

                        # Stock changed between our read and the write -> abort the whole transaction
                        if inventory_result.modified_count != len(inventory_updates):
                            raise InventoryError("Inventory unavailable")

                    print("inventory", time.perf_counter() - t)

            # Transaction committed here

            t = time.perf_counter()

            delete_cart(userid)

            print("delete cart", time.perf_counter() - t)

            return restaurant_ids

        except InventoryError:
            return {"success": False, "message": "Some items just went out of stock, please review your cart"}

        except OperationFailure as e:

            if "TransientTransactionError" in e.details.get("errorLabels", []):

                time.sleep(0.05)

                # insert_many may have mutated the dicts with an _id; strip it so the retry is clean
                for doc in seller_docs:
                    doc.pop("_id", None)

                continue

            raise

    return False


def _combined_status(statuses):
    """
    A checkout can span several restaurants and each restaurant has its own status.
    Collapse them into one status for the customer's order list:
      all same            -> that status
      any still "placed"  -> "placed"
      otherwise (mix of completed + canceled) -> "completed"
    """
    unique = set(statuses)
    if len(unique) == 1:
        return statuses[0]
    if "placed" in unique:
        return "placed"
    return "completed"


# ---------------------------------------------------------
# Customer edit window: items can be changed until 30 min before the
# scheduled pickup / delivery time.
# pickup_time arrives from the client as a string. Supported formats:
#   "14:30", "2:30 PM", "tomorrow 14:30", "14:00-14:30" (start is used),
#   or a full ISO datetime ("2026-11-04T14:30", naive = India time).
# Orders with no parseable scheduled time (e.g. "deliver now") are NOT editable.
# ---------------------------------------------------------
IST_OFFSET = timedelta(hours=5, minutes=30)
USER_EDIT_CUTOFF = timedelta(minutes=30)


def _parse_scheduled_time(pickup_time, created_at):
    """Returns the scheduled time as a naive UTC datetime, or None."""
    if not pickup_time or not isinstance(created_at, datetime):
        return None
    s = str(pickup_time).strip()
    if not s:
        return None

    # full ISO datetime
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt - IST_OFFSET

    low = s.lower()
    m = re.search(r"(\d{1,2}):(\d{2})\s*([ap]m)?", low)
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3)
    if ap:
        if h < 1 or h > 12:
            return None
        h = h % 12 + (12 if ap == "pm" else 0)
    if h > 23 or mi > 59:
        return None

    created_local = created_at + IST_OFFSET
    sched_local = created_local.replace(hour=h, minute=mi, second=0, microsecond=0)
    if "tomorrow" in low:
        sched_local += timedelta(days=1)
    elif sched_local < created_local - timedelta(minutes=5):
        sched_local += timedelta(days=1)       # time already passed today -> tomorrow
    return sched_local - IST_OFFSET


def _edit_deadline(doc):
    sched = _parse_scheduled_time(doc.get("pickup_time"), doc.get("time"))
    return sched - USER_EDIT_CUTOFF if sched else None


def get_orders(userid):
    """
    Customer order history, rebuilt from seller_orders by grouping on checkout_id.
    Same shape as before: one entry per checkout, "resturants" holds the per-restaurant items.
    Now also returns "edit_deadline" (UTC ISO string or None).
    """
    groups = {}
    for doc in seller_orders.find({"user_id": userid}).sort("time", 1):
        key = doc.get("checkout_id") or str(doc["_id"])   # fallback for un-migrated docs

        group = groups.get(key)
        if group is None:
            deadline = _edit_deadline(doc)
            group = {
                "order_id": key,
                "token_no": doc.get("token_no"),
                "resturants": {"cart": {}},
                "statuses": [],
                "updated_ats": [],
                "date": doc.get("time"),
                "pickup_time": doc.get("pickup_time"),
                "order_type": doc.get("order_type", "pickup"),
                "delivery_address": doc.get("delivery_address"),
                "edit_deadline": (deadline.isoformat() + "Z") if deadline else None
            }
            groups[key] = group

        group["resturants"]["cart"][doc["restaurant_id"]] = {
            "name": doc.get("restaurant_name"),
            "items": doc.get("items", {}),
            "status": doc.get("status"),
            "seller_order_id": str(doc["_id"]),
            "subtotal": doc.get("subtotal"),
            "discount": doc.get("discount", 0),
            "coupon_code": (doc.get("coupon") or {}).get("code"),
            "total": doc.get("total"),
        }
        group["statuses"].append(doc.get("status", "placed"))
        stamp = doc.get("status_updated_at") or doc.get("time")
        if stamp:
            group["updated_ats"].append(stamp)

    final_orders = []
    for group in groups.values():
        group["status"] = _combined_status(group.pop("statuses"))
        stamps = group.pop("updated_ats")
        group["status_updated_at"] = max(stamps) if stamps else group.get("date")
        final_orders.append(group)
    return final_orders


def edit_user_order_items(order_id, user_id, new_qtys):
    """
    Customer changes quantities of a checkout, allowed until 30 min before the
    scheduled time. new_qtys = { item_id: new_qty } (0 removes the item).
    - increases check stock + that the price hasn't changed
    - decreases give stock back
    - a restaurant whose items are all removed gets that part canceled
    - at least one item must remain overall
    - coupon discount is recalculated from the snapshot stored on the order
    One transaction, same stock math as store_orders().
    """
    for attempt in range(MAX_RETRIES):
        try:
            with client.start_session() as session:
                with session.start_transaction():
                    docs = list(seller_orders.find(
                        {"checkout_id": order_id, "user_id": user_id}, session=session
                    ))
                    if not docs:
                        return {"success": False, "message": "Order not found", "status": 404}

                    deadline = _edit_deadline(docs[0])
                    if deadline is None:
                        return {"success": False, "status": 403,
                                "message": "This order has no scheduled time, so it can't be edited"}
                    if datetime.utcnow() > deadline:
                        return {"success": False, "status": 403,
                                "message": "Editing is closed. Items can only be changed up to 30 minutes before your scheduled time."}

                    owner = {}
                    for d in docs:
                        for iid in (d.get("items") or {}):
                            owner[iid] = d
                    for iid in new_qtys:
                        if iid not in owner:
                            return {"success": False, "message": "Unknown item in order", "status": 400}

                    grow_ids = [
                        iid for iid, q in new_qtys.items()
                        if q > int(owner[iid]["items"][iid].get("qty", 0))
                    ]
                    fresh = {}
                    if grow_ids:
                        for f in resturants_items.find(
                            {"_id": {"$in": [ObjectId(i) for i in grow_ids]}},
                            {"price": 1}, session=session
                        ):
                            fresh[str(f["_id"])] = f

                    grow_ops, shrink_ops, plans = [], [], []
                    changed = False

                    for d in docs:
                        old_items = d.get("items") or {}
                        updated = {}
                        doc_changed = False

                        for iid, item in old_items.items():
                            old_qty = int(item.get("qty", 0))
                            new_qty = new_qtys.get(iid, old_qty)

                            if new_qty == old_qty:
                                if new_qty > 0:
                                    updated[iid] = item
                                continue

                            if d.get("status") != "placed":
                                return {"success": False, "status": 409,
                                        "message": "Part of your order is already completed or canceled and can't be edited"}

                            if new_qty > old_qty:
                                f = fresh.get(iid)
                                if not f:
                                    return {"success": False, "status": 400,
                                            "message": f"{item.get('name', 'An item')} is no longer available"}
                                if f["price"] != item.get("price"):
                                    return {"success": False, "status": 409,
                                            "message": f"Price changed for {item.get('name', 'an item')}. Please place a new order for extra quantity."}
                                diff = new_qty - old_qty
                                grow_ops.append(UpdateOne(
                                    {"_id": ObjectId(iid), "item_qty": {"$gte": diff}},
                                    {"$inc": {"item_qty": -diff, "sold": diff}}
                                ))
                            else:
                                diff = old_qty - new_qty
                                shrink_ops.append(UpdateOne(
                                    {"_id": ObjectId(iid)},
                                    {"$inc": {"item_qty": diff, "sold": -diff}}
                                ))

                            doc_changed = True
                            if new_qty > 0:
                                kept = dict(item)
                                kept["qty"] = new_qty
                                updated[iid] = kept

                        plans.append((d, updated, doc_changed))
                        changed = changed or doc_changed

                    # something must remain in a part of the order that is still alive
                    if not any(upd for (d, upd, _) in plans if d.get("status") != "canceled"):
                        return {"success": False, "status": 400,
                                "message": "At least one item must remain. Cancel the order instead."}

                    restaurant_ids = []
                    if changed:
                        if grow_ops:
                            r = resturants_items.bulk_write(grow_ops, session=session)
                            if r.modified_count != len(grow_ops):
                                raise InventoryError("Not enough stock")
                        if shrink_ops:
                            resturants_items.bulk_write(shrink_ops, session=session)

                        now = datetime.utcnow()
                        for d, updated, doc_changed in plans:
                            if not doc_changed:
                                continue
                            set_fields = {"edited": True, "edited_by": "user", "edited_at": now}
                            if "original_items" not in d:
                                set_fields["original_items"] = d.get("items")
                            if updated:
                                set_fields["items"] = updated
                                sub, disc, cpn = _reprice(d, updated, enforce_min=True)
                                set_fields.update({"subtotal": sub, "discount": disc,
                                                   "coupon": cpn, "total": round(sub - disc, 2)})
                            else:
                                set_fields.update({
                                    "status": "canceled",
                                    "status_updated_at": now,
                                    "reason": "All items removed by customer",
                                    "canceled_by": "user"
                                })
                            seller_orders.update_one(
                                {"_id": d["_id"], "status": "placed"},
                                {"$set": set_fields},
                                session=session
                            )
                            restaurant_ids.append(d["restaurant_id"])

            total = 0
            for (d, upd, changed_flag) in plans:
                if not upd or d.get("status") == "canceled":
                    continue
                if changed_flag:
                    sub, disc, _ = _reprice(d, upd, enforce_min=True)
                    total += sub - disc
                elif d.get("total") is not None:
                    total += d["total"]
                else:
                    total += sum(int(i.get("price", 0)) * int(i.get("qty", 0)) for i in upd.values())
            total = round(total, 2)
            return {"success": True, "changed": changed, "restaurant_ids": restaurant_ids, "total": total}

        except InventoryError:
            return {"success": False, "status": 409,
                    "message": "Not enough stock for the extra quantity you asked for"}

        except OperationFailure as e:
            if "TransientTransactionError" in (e.details or {}).get("errorLabels", []):
                time.sleep(0.05)
                continue
            raise

    return {"success": False, "message": "Please try again", "status": 500}


def store_seller_orders(res_id, items, userid):
    seller_orders.insert_one({"res_id": res_id, "items": items, "user_id": userid, "time": datetime.utcnow()})


def get_seller_ordes(res_id):
    orders = seller_orders.find({"restaurant_id": res_id}).sort("time", -1)
    final_orders = []
    for order in orders:
        t = order["time"]
        data = {
            "order_id": str(order["_id"]),
            "token_no": order["token_no"],
            "user_id": order['user_id'],
            "items": order["items"],
            "status": order["status"],
            "subtotal": order.get("subtotal"),
            "discount": order.get("discount", 0),
            "coupon_code": (order.get("coupon") or {}).get("code"),
            "total": order.get("total"),
            "time": t,
            "created_at": t.isoformat() if isinstance(t, datetime) else None,
            "edited": bool(order.get("edited", False)),
            "pickup_time": order.get("pickup_time"),
            "order_type": order.get("order_type", "pickup"),
            "delivery_address": order.get("delivery_address")
        }
        final_orders.append(data)
    return final_orders


def create_new_user(email, username, password, role):
    try:
        print("in create user")
        if (role == "seller"):
            result = owners.insert_one({
                "email": email,
                "username": username,
                "password": password,
                "role": role,
                "is_setup": False,
                "is_verified": False
            })
            return ({"success": True, "id": str(result.inserted_id)})
        else:
            result = users.insert_one({
                "email": email,
                "username": username,
                "password": password,
                "role": role,
                "is_verified": False
            })
            return ({"success": True, "id": str(result.inserted_id)})
    except DuplicateKeyError:
        return {
            "success": False,
            "message": "Email already exists"
        }


def check_existing_user(email, password):
    print("in existing user")
    user = users.find_one({"email": email})
    print(user)
    if (user):
        print("in existing user if block", password)
        if (user["password"] == password):
            if (user["role"] == "seller"):
                return ({"success": True, "userid": str(user["_id"]), "username": user["username"], "is_verified": user["is_verified"], "is_setup": user["is_setup"]})
            else:
                print("in existing user if if block")
                return ({"success": True, "userid": str(user["_id"]), "username": user["username"], "is_verified": user["is_verified"]})
        else:
            return {"success": False}
    else:
        return {"success": 404}


def check_existing_owner(email, password):
    print("in existing user")
    owner = owners.find_one({"email": email})
    if (owner):
        print("in existing user if block", password)
        if (owner["password"] == password):
            if (owner["is_verified"]):
                print("in existing user if if block")
                if (owner["is_setup"]):
                    return ({"success": True, "res_id": owner["resturant_id"], "username": owner["username"], "resturant_name": owner["restaurant_name"], "is_verified": owner["is_verified"], "is_setup": owner["is_setup"]})
                else:
                    return ({"success": True, "id": str(owner["_id"]), "username": owner["username"], "is_verified": owner["is_verified"], "is_setup": owner["is_setup"]})
            else:
                return ({"success": True, "user_id": str(owner["_id"]), "username": owner["username"], "is_verified": owner["is_verified"], "is_setup": owner["is_setup"]})
        else:
            return {"success": False}
    else:
        return {"success": 404}


def update_order_status_seller(order_id, status, userid, res_id, **kwargs):
    """
    order_id is the seller_orders _id. A seller only changes THEIR restaurant's part
    of a checkout; the customer-facing status is derived in get_orders().
    """
    try:
        update_fields = {"status": status, "status_updated_at": datetime.utcnow()}

        if status == "canceled":
            update_fields["reason"] = kwargs.get("reason")

        updated_seller_doc = seller_orders.find_one_and_update(
            {
                "_id": ObjectId(order_id),
                "restaurant_id": res_id
            },
            {"$set": update_fields},
            return_document=ReturnDocument.AFTER
        )
    except Exception:
        return {"success": False, "message": "Order not found or unauthorized"}

    if not updated_seller_doc:
        return {"success": False, "message": "Order not found or unauthorized"}

    return {"success": True}


def update_order_status_user(order_id, status, userid, reason=None):
    """
    order_id is the checkout_id. The customer can only CANCEL, and only the parts
    of the checkout that are still "placed". A reason is stored on every part.
    """
    if status != "canceled":
        return {"success": False, "message": "Invalid status"}

    with client.start_session() as session:
        with session.start_transaction():
            result = seller_orders.update_many(
                {"checkout_id": order_id, "user_id": userid, "status": "placed"},
                {"$set": {
                    "status": "canceled",
                    "status_updated_at": datetime.utcnow(),
                    "reason": reason,
                    "canceled_by": "user"
                }},
                session=session
            )
            if result.matched_count == 0:
                return {
                    "success": False,
                    "message": "Order not found, already processed, or unauthorized"
                }
            return {"success": True}


def resturant_stats(res_id):
    seller_order_stats = seller_orders.find({"restaurant_id": res_id})
    Total_orders = 0
    pending = 0
    completed = 0
    canceled = 0
    for order in seller_order_stats:
        if (order["status"] == "placed"):
            Total_orders += 1
            pending += 1
        elif (order["status"] == "completed"):
            completed += 1
            Total_orders += 1
        else:
            Total_orders += 1
            canceled += 1
    stats = {
        "Total_orders": Total_orders,
        "completed": completed,
        "canceled": canceled,
        "pending": pending
    }
    return stats


def add_subcategory(res_id, category_id, subcat_name):
    try:
        # Increment counter and get previous value
        doc = categories.find_one_and_update(
            {"restaurant_id": res_id},
            {"$inc": {"next_subcat_id": 1}},
            return_document=ReturnDocument.BEFORE
        )

        if doc is None:
            return {
                "success": False,
                "error": "Restaurant not found"
            }

        subcategory = {
            "_id": doc.get("next_subcat_id", 0) + 1,
            "name": subcat_name
        }

        result = categories.update_one(
            {
                "restaurant_id": res_id,
                "categories._id": int(category_id)
            },
            {
                "$push": {
                    "categories.$.subcategories": subcategory
                }
            }
        )

        if result.modified_count == 0:
            return {
                "success": False,
                "error": "Category not found"
            }

        return {
            "success": True,
            "subcategory": subcategory
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def verify_order(res_id, order_id):
    order = seller_orders.find_one({
        "_id": ObjectId(order_id),
        "restaurant_id": res_id
    })

    if order is None:
        return None

    return order["user_id"]


def get_resturantItem_price(res_id, item_id):
    print("in get item price")
    try:
        res = resturants_items.find_one({
            "_id": ObjectId(item_id),
            "resturant_id": res_id
        })

        print(res)

        if res is None:
            return {"success": False, "message": "Item not found"}

        return {
            "success": True,
            "price": res["price"],
            "available_qty": res["item_qty"]
        }

    except Exception as e:
        print("Error:", e)
        raise


def return_res_analytics(res_id):
    resturants_itemsss = resturants_items.find({"resturant_id": res_id})
    print(resturants_itemsss)
    data = []
    print(res_id)
    for items in resturants_itemsss:
        print("items=", items)
        itemss = {
            "item_name": items.get("item_name"),
            "initial_qty": items.get("item_qty", 0),
            "sold": items.get("sold", 0),
            "remaining": items.get("item_qty", 0)
        }
        print(itemss)
        data.append(itemss)
        print(data)
    print("data in res_analytics", data)
    return data


def _order_amount(order: dict, item_index: dict) -> float:
    """
    Amount the seller actually earns for this order (after coupon discount).
    New orders store "total" (price snapshot minus discount), so use that.
    Old orders (before coupons) have no "total": fall back to qty x the item's
    CURRENT price, minus any discount.
    NOTE: the fallback uses *current* price, not the price at time of order.
    """
    if order.get("total") is not None:
        return float(order["total"])

    order_items = order.get("items", {}) or {}
    total = 0
    for item_id, line in order_items.items():
        price = item_index.get(str(item_id), {}).get("price", 0)
        qty = line.get("qty", 0) if isinstance(line, dict) else 0
        total += int(price) * int(qty)
    return max(total - float(order.get("discount") or 0), 0)


def get_preview_items(res_ids, limit=4):
    """Batched preview items for the home-page store cards - a few in-stock
    items per restaurant in one query instead of one call per card."""
    if not res_ids:
        return {}

    pipeline = [
        {"$match": {"resturant_id": {"$in": res_ids}, "available": True}},
        {"$sort": {"sold": -1}},  # popular items first
        {"$group": {
            "_id": "$resturant_id",
            "items": {"$push": {
                "id": {"$toString": "$_id"},
                "name": "$item_name",
                "price": "$price",
                "file_url": "$file_url"
            }}
        }},
        {"$project": {"items": {"$slice": ["$items", limit]}}}
    ]

    preview = {}
    for doc in resturants_items.aggregate(pipeline):
        preview[doc["_id"]] = doc["items"]
    return preview


def get_seller_analytics(seller_id: str) -> dict:
    """
    Returns full analytics payload for the seller dashboard.
    Covers: KPIs, sales chart, top products, stock alerts, recent orders, activity feed.
    """

    # resturants_items uses the (misspelled, but that's the real field) "resturant_id"
    items_cursor = resturants_items.find({"resturant_id": seller_id})
    # seller_orders uses the correctly-spelled "restaurant_id" - different from above!
    orders_cursor = seller_orders.find({"restaurant_id": seller_id})

    items_list = list(items_cursor)
    orders_list = list(orders_cursor)

    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # item index (id -> item doc)
    item_index = {str(item["_id"]): item for item in items_list}

    # KPIs
    total_revenue = 0
    today_revenue = 0
    today_orders = 0
    month_orders = 0
    month_revenue = 0
    active_orders = 0

    for order in orders_list:
        order_time = order.get("time", now)
        status = order.get("status", "")

        # real order statuses are "placed" / "completed" / "canceled"
        if status == "canceled":
            continue
        if status in ("placed", "processing"):
            active_orders += 1

        order_amount = _order_amount(order, item_index)
        total_revenue += order_amount

        if order_time >= today:
            today_revenue += order_amount
            today_orders += 1

        if order_time >= today.replace(day=1):
            month_revenue += order_amount
            month_orders += 1

    # inventory & stock alerts
    low_stock_items = []
    out_of_stock_items = []

    inventory_data = []
    for item in items_list:
        item_id = str(item["_id"])
        initial_qty = int(item.get("item_qty", 0) or 0)
        sold = int(item.get("sold", 0) or 0)
        remaining = max(initial_qty - sold, 0)
        low_at = item.get("lowat", 10)
        price = item.get("price", 0)

        inventory_data.append({
            "item_id": item_id,
            "item_name": item.get("item_name"),
            "sub_id": item.get("sub_id"),
            "unit": item.get("unit"),
            "price": price,
            "initial_qty": initial_qty,
            "sold": sold,
            "remaining": remaining,
            "revenue": round(int(sold) * int(price), 2),
        })

        if remaining == 0:
            out_of_stock_items.append({
                "item_name": item.get("item_name"),
                "sub_id": item.get("sub_id"),
                "stock": 0,
                "status": "out",
            })
        elif remaining <= low_at:
            low_stock_items.append({
                "item_name": item.get("item_name"),
                "sub_id": item.get("sub_id"),
                "stock": remaining,
                "status": "low",
            })

    stock_alerts = out_of_stock_items + low_stock_items  # out-of-stock first

    # top products (by units sold)
    top_products = sorted(inventory_data, key=lambda x: x["sold"], reverse=True)[:5]

    # sales chart (daily revenue, last 30 days)
    daily_revenue = defaultdict(float)
    for order in orders_list:
        if order.get("status") == "canceled":
            continue
        order_time = order.get("time", now)
        if order_time >= today - timedelta(days=30):
            day_key = order_time.strftime("%b %d")
            daily_revenue[day_key] += _order_amount(order, item_index)

    # fill missing days with 0 so the chart has no gaps
    chart_labels = []
    chart_values = []
    for i in range(30, -1, -1):
        day = today - timedelta(days=i)
        day_key = day.strftime("%b %d")
        chart_labels.append(day_key)
        chart_values.append(round(daily_revenue.get(day_key, 0), 2))

    # recent orders (last 10)
    recent_orders = sorted(orders_list, key=lambda x: x.get("time", now), reverse=True)[:10]
    recent_orders_data = []
    for order in recent_orders:
        order_items = order.get("items", {}) or {}
        order_items_summary = ", ".join(
            item_index.get(str(item_id), {}).get("item_name", "Unknown")
            for item_id in list(order_items.keys())[:3]   # show max 3 item names
        )

        recent_orders_data.append({
            "order_id": str(order["_id"]),
            "customer_id": order.get("user_id"),
            "items_summary": order_items_summary,
            "total_amount": round(_order_amount(order, item_index), 2),
            "status": order.get("status"),
            "tokenNo": order.get("token_no"),
            "created_at": order.get("time", now).isoformat(),
        })

    return {
        "kpis": {
            "total_revenue": round(total_revenue, 2),
            "month_revenue": round(month_revenue, 2),
            "month_orders": month_orders,
            "today_revenue": round(today_revenue, 2),
            "today_orders": today_orders,
            "total_items": len(items_list),
            "low_stock_count": len(low_stock_items),
            "out_of_stock_count": len(out_of_stock_items),
        },
        "chart": {
            "labels": chart_labels,
            "values": chart_values,
        },
        "top_products": top_products,
        "stock_alerts": stock_alerts,
        "recent_orders": recent_orders_data,
        "inventory": inventory_data,
        "active_orders": active_orders,
    }


# NOTE: this used to run get_seller_analytics(...) at import time, hitting Mongo on every
# server start. Uncomment only for local debugging.
# reponse = get_seller_analytics("6a48e58dff79b029132edfc2")
# print(reponse)


def serialize_address(addr):
    """Mongo ObjectIds aren't JSON serializable - stringify before sending to the client."""
    if not addr:
        return None
    out = dict(addr)
    out["_id"] = str(out["_id"])
    return out


def update_address(address_id, user_id, address, adrs_type, phone=None, coordinates=None):
    """Update one saved address, scoped to this user."""
    try:
        fields = {
            "addresses.$.address": address,
            "addresses.$.adrs_type": adrs_type,
            "addresses.$.phone": phone,
        }

        if coordinates:
            fields["addresses.$.coordinates"] = coordinates

        doc = users.find_one_and_update(
            {
                "_id": ObjectId(user_id),
                "addresses._id": ObjectId(address_id)
            },
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    except Exception as e:
        print("update_address error:", e)
        return {"success": False, "message": "Invalid address"}

    if not doc:
        return {"success": False, "message": "Address not found"}

    updated_address = next(
        (a for a in doc.get("addresses", [])
         if a["_id"] == ObjectId(address_id)),
        None
    )

    if not updated_address:
        return {"success": False, "message": "Address not found"}

    return {"success": True, "address": updated_address}


def save_address(address, type, uid, cordinates, phone=None):
    user = users.find_one(ObjectId(uid))
    if user:
        result = users.update_one(
            {"_id": ObjectId(uid)},
            {
                "$push": {
                    "addresses": {
                        # explicit _id: Mongo does NOT auto-add one to pushed subdocuments,
                        # and fetch_address / get_user_address / update_address rely on it
                        "_id": ObjectId(),
                        "address": address,
                        "adrs_type": type,
                        "coordinates": cordinates,
                        "phone": phone
                    }
                }
            }
        )
        return ({"success": True})
    else:
        return ({"success": False})


def fetch_address(uid):
    user = users.find_one(ObjectId(uid))

    if (user):
        if "addresses" in user:
            addresses = []
            for address in user["addresses"]:
                addr = {
                    "_id": str(address["_id"]),
                    "address": address["address"],
                    "adrs_type": address["adrs_type"],
                    "coordinates": address["coordinates"],
                    "phone": address.get("phone")
                }
                addresses.append(addr)
            return {"success": True, "address": addresses, "status": 200}
        else:
            return {"success": True, "address": "not_found", "status": 404}
    else:
        return {"success": False}


def set_verified(email, role):
    if (role == "user"):
        users.find_one_and_update({"email": email}, {"$set": {"is_verified": True}})
    else:
        owners.find_one_and_update({"email": email}, {"$set": {"is_verified": True}})


def save_category(res_id, category, subcats):
    try:
        # Reserve IDs atomically
        doc = categories.find_one_and_update(
            {"restaurant_id": res_id},
            {
                "$inc": {
                    "next_category_id": 1,
                    "next_subcat_id": len(subcats)
                }
            },
            upsert=True,
            return_document=ReturnDocument.BEFORE
        )

        # First document case
        if doc is None:
            cat_id = 1
            first_sub_id = 1
        else:
            cat_id = doc.get("next_category_id", 1)
            first_sub_id = doc.get("next_subcat_id", 0) + 1

        category_data = {
            "_id": cat_id,
            "name": category,
            "subcategories": [
                {
                    "_id": first_sub_id + i,
                    "name": subcat
                }
                for i, subcat in enumerate(subcats)
            ]
        }

        categories.update_one(
            {"restaurant_id": res_id},
            {
                "$push": {
                    "categories": category_data
                },
                "$setOnInsert": {
                    "restaurant_id": res_id
                }
            }
        )

        return {"success": True, "category_data": category_data}

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def edit_seller_order_items(order_id, res_id, new_qtys):
    """
    Seller trims an order he can't fully serve.
    new_qtys = { item_id: new_qty }. Rules:
      - order must belong to this restaurant and still be "placed"
      - 0 <= new_qty <= ordered qty (reduce / remove only)
      - at least one item must remain
    Stock removed from the order is given back (item_qty += diff, sold -= diff),
    the exact reverse of store_orders(). Everything runs in one transaction.
    The coupon is kept (even if the order drops below its minimum) because the
    seller made the cut, not the customer; the discount is recalculated.
    """
    try:
        oid = ObjectId(order_id)
    except Exception:
        return {"success": False, "message": "Invalid order id", "status": 400}

    for attempt in range(MAX_RETRIES):
        try:
            with client.start_session() as session:
                with session.start_transaction():
                    order = seller_orders.find_one(
                        {"_id": oid, "restaurant_id": res_id}, session=session
                    )
                    if not order:
                        return {"success": False, "message": "Order not found", "status": 404}
                    if order.get("status") != "placed":
                        return {"success": False, "message": "Only pending orders can be edited", "status": 409}

                    old_items = order.get("items", {}) or {}

                    for item_id in new_qtys:
                        if item_id not in old_items:
                            return {"success": False, "message": "Unknown item in order", "status": 400}

                    updated_items = {}
                    inventory_ops = []
                    changed = False

                    for item_id, item in old_items.items():
                        old_qty = int(item.get("qty", 0))
                        new_qty = new_qtys.get(item_id, old_qty)

                        if new_qty < 0 or new_qty > old_qty:
                            return {"success": False,
                                    "message": f"You can only reduce quantities ({item.get('name', 'item')})",
                                    "status": 400}

                        diff = old_qty - new_qty
                        if diff > 0:
                            changed = True
                            inventory_ops.append(UpdateOne(
                                {"_id": ObjectId(item_id)},
                                {"$inc": {"item_qty": diff, "sold": -diff}}
                            ))
                        if new_qty > 0:
                            kept = dict(item)
                            kept["qty"] = new_qty
                            updated_items[item_id] = kept

                    if not updated_items:
                        return {"success": False,
                                "message": "At least one item must remain. Cancel the order instead.",
                                "status": 400}

                    sub, disc, cpn = _reprice(order, updated_items, enforce_min=False)

                    if changed:
                        set_fields = {
                            "items": updated_items,
                            "edited": True,
                            "edited_at": datetime.utcnow(),
                            "subtotal": sub,
                            "discount": disc,
                            "coupon": cpn,
                            "total": round(sub - disc, 2),
                        }
                        # keep the customer's original order for the first edit only
                        if "original_items" not in order:
                            set_fields["original_items"] = old_items

                        seller_orders.update_one(
                            {"_id": oid, "status": "placed"},
                            {"$set": set_fields},
                            session=session
                        )
                        if inventory_ops:
                            resturants_items.bulk_write(inventory_ops, session=session)

            total = round(sub - disc, 2)
            return {
                "success": True,
                "changed": changed,
                "user_id": order["user_id"],
                "token_no": order.get("token_no"),
                "items": updated_items,
                "total": total
            }

        except OperationFailure as e:
            if "TransientTransactionError" in (e.details or {}).get("errorLabels", []):
                time.sleep(0.05)
                continue
            raise

    return {"success": False, "message": "Please try again", "status": 500}


# =========================================================
# Store settings (stored on the restaurant document)
# =========================================================

def get_store_settings(res_id):
    try:
        doc = restaurants_name.find_one({"_id": ObjectId(res_id)})
    except Exception:
        return None
    if not doc:
        return None
    return {
        "store_name": doc.get("name", ""),
        "phone": doc.get("phone_no", ""),
        "address": doc.get("address", ""),
        "opens": doc.get("opens", ""),
        "closes": doc.get("closes", ""),
        "prep_time": doc.get("prep_time", ""),
        "min_order": doc.get("min_order", ""),
    }


def update_store_settings(res_id, s):
    """s is already validated by the server."""
    try:
        result = restaurants_name.update_one(
            {"_id": ObjectId(res_id)},
            {"$set": {
                "name": s["store_name"],
                "phone_no": s["phone"],
                "address": s["address"],
                "opens": s["opens"],
                "closes": s["closes"],
                "prep_time": s["prep_time"],
                "min_order": s["min_order"],
            }}
        )
    except Exception:
        return False
    if result.matched_count == 0:
        return False
    # keep the owner record's copy of the name in sync
    owners.update_one({"resturant_id": res_id}, {"$set": {"restaurant_name": s["store_name"]}})
    return True


# =========================================================
# Offers & coupons
#   { restaurant_id, code, type: "percent"|"flat", value, min_order,
#     expires: "YYYY-MM-DD" | None, active, created_at }
# =========================================================

def _offer_out(d):
    return {
        "id": str(d["_id"]),
        "code": d["code"],
        "type": d["type"],
        "value": d["value"],
        "min_order": d.get("min_order", 0),
        "expires": d.get("expires"),
        "active": bool(d.get("active", True)),
    }


def list_offers(res_id):
    return [_offer_out(d) for d in offers.find({"restaurant_id": res_id}).sort("created_at", -1)]


def save_offer(res_id, offer_id, fields):
    """offer_id None -> create, otherwise update (scoped to this restaurant)."""
    try:
        if offer_id:
            doc = offers.find_one_and_update(
                {"_id": ObjectId(offer_id), "restaurant_id": res_id},
                {"$set": fields},
                return_document=ReturnDocument.AFTER
            )
            if not doc:
                return {"success": False, "message": "Offer not found", "status": 404}
        else:
            new_doc = dict(fields, restaurant_id=res_id, created_at=datetime.utcnow())
            offers.insert_one(new_doc)
            doc = new_doc
        return {"success": True, "offer": _offer_out(doc)}
    except DuplicateKeyError:
        return {"success": False, "message": "You already have an offer with this code", "status": 409}
    except Exception as e:
        print("save_offer error:", e)
        return {"success": False, "message": "Invalid offer", "status": 400}


def delete_offer(res_id, offer_id):
    try:
        result = offers.delete_one({"_id": ObjectId(offer_id), "restaurant_id": res_id})
    except Exception:
        return False
    return result.deleted_count == 1


def _offer_error(offer, subtotal):
    """None if the offer can be used on this subtotal, else the message to show."""
    if not offer or not offer.get("active", True):
        return "Invalid coupon code"
    today = (datetime.utcnow() + IST_OFFSET).strftime("%Y-%m-%d")   # India date, not UTC
    if offer.get("expires") and offer["expires"] < today:
        return "This coupon has expired"
    min_order = offer.get("min_order", 0) or 0
    if subtotal < min_order:
        return f"Add items worth ₹{min_order} or more to use this coupon"
    return None


def _discount_for(rule, subtotal):
    """rule = offer doc OR the coupon snapshot stored on an order (both have type/value)."""
    raw = subtotal * float(rule["value"]) / 100 if rule["type"] == "percent" else float(rule["value"])
    return round(min(raw, subtotal), 2)


def validate_coupon(res_id, code, subtotal):
    """
    Customer side: check a code against a server-computed subtotal.
    Returns {"success": True, "discount": x, "total": y, ...} or {"success": False, "message": ...}
    """
    code = str(code).strip().upper()
    offer = offers.find_one({"restaurant_id": res_id, "code": code})
    err = _offer_error(offer, subtotal)
    if err:
        return {"success": False, "message": err}
    discount = _discount_for(offer, subtotal)
    return {
        "success": True,
        "code": offer["code"],
        "type": offer["type"],            # the cart uses these to recompute live
        "value": offer["value"],
        "min_order": offer.get("min_order", 0),
        "discount": discount,
        "total": round(subtotal - discount, 2),
    }


def list_public_offers(res_id):
    """Active, non-expired offers a customer can see for a store."""
    today = (datetime.utcnow() + IST_OFFSET).strftime("%Y-%m-%d")
    out = []
    for d in offers.find({"restaurant_id": res_id, "active": {"$ne": False}}).sort("created_at", -1):
        if d.get("expires") and d["expires"] < today:
            continue
        o = _offer_out(d)
        o.pop("id", None)
        out.append(o)
    return out


def _reprice(doc, new_items, enforce_min):
    """After an edit: (subtotal, discount, coupon). Rules come from the snapshot on the order,
    so later changes to the seller's offer don't alter an existing order."""
    subtotal = sum(int(i.get("price", 0)) * int(i.get("qty", 0)) for i in new_items.values())
    coupon = doc.get("coupon")
    if coupon and enforce_min and subtotal < (coupon.get("min_order") or 0):
        coupon = None                      # customer shrank the order below the minimum
    discount = _discount_for(coupon, subtotal) if coupon else 0
    return subtotal, discount, coupon


# =========================================================
# Payouts
#   Earnings = completed orders (price snapshot stored on each order line,
#   minus the coupon discount - the seller funds the discount).
#   seller_payouts docs are created by YOU (admin / script) when you pay a
#   seller: create_payout(res_id, amount). Pending balance = earnings - payouts.
# =========================================================

def _lifetime_earnings(res_id):
    pipeline = [
        {"$match": {"restaurant_id": res_id, "status": "completed"}},
        {"$project": {
            "discount": {"$ifNull": ["$discount", 0]},
            "gross": {"$sum": {"$map": {
                "input": {"$objectToArray": "$items"}, "as": "i",
                "in": {"$multiply": ["$$i.v.price", "$$i.v.qty"]}
            }}},
        }},
        {"$group": {"_id": None, "total": {"$sum": {"$subtract": ["$gross", "$discount"]}}}},
    ]
    rows = list(seller_orders.aggregate(pipeline))
    return float(rows[0]["total"]) if rows else 0.0


def get_payout_summary(res_id):
    docs = list(seller_payouts.find({"restaurant_id": res_id}).sort("date", -1))
    paid_out = sum(float(d.get("amount", 0)) for d in docs if d.get("status") in ("pending", "paid"))
    balance = max(_lifetime_earnings(res_id) - paid_out, 0)
    return {
        "balance": round(balance, 2),
        "payouts": [{
            "id": d.get("ref") or str(d["_id"])[-8:].upper(),
            "date": d["date"].strftime("%d %b %Y"),
            "amount": d.get("amount", 0),
            "status": d.get("status", "pending"),
        } for d in docs],
    }


def create_payout(res_id, amount, status="pending"):
    """Admin helper, e.g.  python -c "import database; database.create_payout('<res_id>', 1500, 'paid')" """
    seller_payouts.insert_one({
        "restaurant_id": res_id,
        "ref": "PO-" + uuid.uuid4().hex[:8].upper(),
        "amount": amount,
        "status": status,
        "date": datetime.utcnow(),
    })


# =========================================================
# Support tickets / complaints
#   Server is the source of truth for duplicates, order status and eligibility.
#   { ticket_id, user_id, checkout_id, category, category_label, message, phone,
#     order_status, order_type, restaurant_ids, restaurant_names, shop_online,
#     priority, status: "open", photo_url, geo, created_at }
# =========================================================

SUPPORT_REPEAT_BLOCK = timedelta(hours=6)    # same order + same reason
SUPPORT_HELP_WINDOW = timedelta(hours=24)    # finished orders only
SUPPORT_DAILY_LIMIT = 10                     # tickets per user per 24h
SUPPORT_SHOP_RADIUS_M = 300                  # how close to the shop a "shop is closed" report must be taken

# Keep in sync with CATEGORIES in support.js.
# when: "active" (pending) | "done" (completed/canceled) | "any"   for: "pickup" | "delivery" | "any"
SUPPORT_CATEGORIES = {
    "shop_closed":         {"label": "Shop is closed", "when": "active", "for": "any", "msg_required": False, "priority": "high"},
    "shop_not_responding": {"label": "Shop isn't responding / not preparing my order", "when": "active", "for": "any", "msg_required": False, "priority": "normal"},
    "not_ready":           {"label": "Order isn't ready at my pickup time", "when": "active", "for": "pickup", "msg_required": False, "priority": "normal"},
    "qr_not_working":      {"label": "QR / token not accepted at the shop", "when": "active", "for": "pickup", "msg_required": False, "priority": "normal"},
    "delivery_late":       {"label": "Delivery is taking too long", "when": "active", "for": "delivery", "msg_required": False, "priority": "normal"},
    "rider_unreachable":   {"label": "Can't reach the delivery person / shop", "when": "active", "for": "delivery", "msg_required": False, "priority": "normal"},
    "wrong_address":       {"label": "I need to fix my address or phone number", "when": "active", "for": "delivery", "msg_required": True, "priority": "normal"},
    "not_received":        {"label": "Marked completed but I didn't get my order", "when": "done", "for": "any", "msg_required": False, "priority": "high"},
    "item":                {"label": "Missing or wrong item", "when": "done", "for": "any", "msg_required": True, "priority": "normal"},
    "quality":             {"label": "Item quality", "when": "done", "for": "any", "msg_required": True, "priority": "normal"},
    "price":               {"label": "Charged more than the listed price", "when": "any", "for": "any", "msg_required": True, "priority": "normal"},
    "payment":             {"label": "Payment or refund", "when": "any", "for": "any", "msg_required": True, "priority": "normal"},
    "other":               {"label": "Something else", "when": "any", "for": "any", "msg_required": True, "priority": "normal"},
}


def _find_checkout_docs(user_id, order_id):
    """All seller_orders docs of one checkout, scoped to this user."""
    docs = list(seller_orders.find({"checkout_id": order_id, "user_id": user_id}))
    if docs:
        return docs
    # un-migrated docs have no checkout_id; get_orders() uses str(_id) as the key for them
    try:
        oid = ObjectId(order_id)
    except Exception:
        return []
    return list(seller_orders.find({"_id": oid, "user_id": user_id, "checkout_id": {"$exists": False}}))


def _normalize_phone(phone):
    cleaned = re.sub(r"[\s-]", "", str(phone or ""))
    return re.sub(r"^(?:\+?91|0)(?=\d{10}$)", "", cleaned)


def get_reported_categories(user_id, order_id):
    """{category_id: ticket_id} reported by this user for this order within the repeat window."""
    since = datetime.utcnow() - SUPPORT_REPEAT_BLOCK
    out = {}
    for t in support_tickets.find(
        {"user_id": user_id, "checkout_id": str(order_id), "created_at": {"$gte": since}},
        {"category": 1, "ticket_id": 1}
    ):
        out[t["category"]] = t["ticket_id"]
    return out


def create_support_ticket(user_id, order_id, category, message, phone, photo_uploader=None, lat=None, lng=None, accuracy=None):
    """
    Returns {"success": True, "ticket_id", "restaurant_ids", "priority", ...}
    or {"success": False, "message", "status", ["ticket_id"]}.
    Order status / type / restaurants always come from the DB, never from the client.
    """
    order_id = str(order_id or "").strip()
    cat = SUPPORT_CATEGORIES.get(category)
    if not order_id:
        return {"success": False, "message": "Order id is required", "status": 400}
    if not cat:
        return {"success": False, "message": "Invalid reason", "status": 400}

    docs = _find_checkout_docs(user_id, order_id)
    if not docs:
        return {"success": False, "message": "Order not found", "status": 404}

    now = datetime.utcnow()
    order_status = _combined_status([d.get("status", "placed") for d in docs])
    order_type = docs[0].get("order_type", "pickup")
    active = order_status == "placed"

    # ---- eligibility (mirrors the UI) ----
    if cat["when"] == "active" and not active:
        return {"success": False, "message": "This can only be reported while the order is pending", "status": 400}
    if cat["when"] == "done" and active:
        return {"success": False, "message": "This can only be reported after the order is finished", "status": 400}
    if cat["for"] != "any" and cat["for"] != order_type:
        return {"success": False, "message": "This reason doesn't apply to this order type", "status": 400}

    if not active:
        stamps = [d.get("status_updated_at") or d.get("time") for d in docs]
        stamps = [s for s in stamps if isinstance(s, datetime)]
        if stamps and now - max(stamps) > SUPPORT_HELP_WINDOW:
            return {"success": False, "message": "Help for this order is no longer available (24 hours after completion)", "status": 403}

    # ---- input ----
    message = str(message or "").strip()[:1000]
    if cat["msg_required"] and len(message) < 10:
        return {"success": False, "message": "Please describe the problem in a few words (at least 10 characters)", "status": 400}
    if not message:
        message = cat["label"]

    phone = _normalize_phone(phone)
    if phone and not re.fullmatch(r"[6-9]\d{9}", phone):
        return {"success": False, "message": "Please enter a valid 10-digit phone number, or leave it empty", "status": 400}

    # ---- shop-closed proof: photo + the user must actually be near the shop ----
    geo = None
    if category == "shop_closed":
        if photo_uploader is None:
            return {"success": False, "message": "A photo of the shop is required", "status": 400}
        try:
            lat, lng = float(lat), float(lng)
            acc = max(float(accuracy or 0), 0.0)
        except (TypeError, ValueError):
            return {"success": False, "message": "Location is required to report a closed shop", "status": 400}
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return {"success": False, "message": "Invalid location", "status": 400}

        dists = []
        for rid in {d["restaurant_id"] for d in docs}:
            s = get_restaurant_delivery(rid)
            if s and s.get("latt") is not None and s.get("long") is not None:
                dists.append(_haversine_km(lat, lng, float(s["latt"]), float(s["long"])) * 1000)
        if not dists:
            return {"success": False, "message": "Couldn't verify the shop location", "status": 400}

        nearest = min(dists)
        if nearest > SUPPORT_SHOP_RADIUS_M + min(acc, 200):   # allow for GPS inaccuracy, capped
            return {"success": False, "status": 400,
                    "message": f"You seem to be about {int(nearest)} m from the shop. Please report from the shop."}
        geo = {"lat": lat, "lng": lng, "accuracy": acc, "distance_m": round(nearest)}

    # ---- abuse guards ----
    existing = support_tickets.find_one({
        "user_id": user_id, "checkout_id": order_id, "category": category,
        "created_at": {"$gte": now - SUPPORT_REPEAT_BLOCK}
    }, {"ticket_id": 1})
    if existing:
        return {"success": False, "status": 409, "ticket_id": existing["ticket_id"],
                "message": f"You already reported this for this order (reference {existing['ticket_id']}). We're looking into it."}

    if support_tickets.count_documents({"user_id": user_id, "created_at": {"$gte": now - timedelta(hours=24)}}) >= SUPPORT_DAILY_LIMIT:
        return {"success": False, "message": "You've sent too many reports today. Please try again tomorrow.", "status": 429}

    # ---- every check passed: only now upload the photo (no orphan files) ----
    photo_url = None
    if photo_uploader:
        file_id = photo_uploader()
        photo_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"

    restaurant_ids = [d["restaurant_id"] for d in docs]
    ticket = {
        "ticket_id": "TK-" + uuid.uuid4().hex[:8].upper(),
        "user_id": user_id,
        "checkout_id": order_id,
        "category": category,
        "category_label": cat["label"],
        "message": message,
        "phone": phone or None,
        "order_status": order_status,
        "order_type": order_type,
        "restaurant_ids": restaurant_ids,
        "restaurant_names": [d.get("restaurant_name") for d in docs],
        # snapshot so "shop is closed" claims can be checked against what we knew
        "shop_online": {rid: is_restaurant_online(rid) for rid in restaurant_ids},
        "priority": cat["priority"],
        "status": "open",
        "photo_url": photo_url,
        "geo": geo,
        "created_at": now,
    }
    try:
        support_tickets.insert_one(ticket)
    except DuplicateKeyError:
        return {"success": False, "message": "Please try again", "status": 500}

    return {
        "success": True,
        "ticket_id": ticket["ticket_id"],
        "restaurant_ids": restaurant_ids,
        "priority": ticket["priority"],
        "category": category,
    }


# =========================================================
# Seller side of support tickets (complaints)
#   status: "open" | "resolved" | "dismissed"
# =========================================================

COMPLAINT_STATUSES = ("open", "resolved", "dismissed")


def get_seller_complaints(res_id, limit=200):
    """All complaints that involve this restaurant, newest first."""
    tickets = list(
        support_tickets.find({"restaurant_ids": res_id})
        .sort("created_at", -1)
        .limit(limit)
    )
    if not tickets:
        return []

    # order info for THIS restaurant's part of each checkout
    checkout_ids = [t["checkout_id"] for t in tickets]
    orders = {}
    for o in seller_orders.find(
        {"restaurant_id": res_id, "checkout_id": {"$in": checkout_ids}},
        {"checkout_id": 1, "token_no": 1, "items": 1, "status": 1, "total": 1}
    ):
        orders[o["checkout_id"]] = o

    out = []
    for t in tickets:
        o = orders.get(t["checkout_id"]) or {}
        items = (o.get("items") or {}).values()
        items_summary = ", ".join(
            f"{i.get('name', 'Item')} x{i.get('qty', 0)}" for i in items
        )
        if o.get("total") is not None:
            total = o["total"]          # already after coupon discount
        else:
            total = sum(int(i.get("price", 0)) * int(i.get("qty", 0)) for i in (o.get("items") or {}).values())
        created = t.get("created_at")
        out.append({
            "ticket_id": t["ticket_id"],
            "category": t.get("category"),
            "category_label": t.get("category_label", ""),
            "message": t.get("message", ""),
            "phone": t.get("phone"),
            "photo_url": t.get("photo_url"),
            "geo": t.get("geo"),
            "priority": t.get("priority", "normal"),
            "status": t.get("status", "open"),
            "seller_note": t.get("seller_note"),
            "order_type": t.get("order_type", "pickup"),
            "order_status": o.get("status") or t.get("order_status"),
            "token_no": o.get("token_no"),
            "items_summary": items_summary,
            "total": total,
            "customer_id": t.get("user_id"),
            "shop_online": (t.get("shop_online") or {}).get(res_id),
            "created_at": created.isoformat() if isinstance(created, datetime) else None,
        })
    return out


def update_complaint(res_id, ticket_id, status, note=None):
    """Seller resolves / dismisses / reopens a complaint (scoped to their restaurant)."""
    if status not in COMPLAINT_STATUSES:
        return {"success": False, "message": "Invalid status", "status": 400}

    fields = {"status": status, "updated_at": datetime.utcnow()}
    if note is not None:
        fields["seller_note"] = note

    doc = support_tickets.find_one_and_update(
        {"ticket_id": ticket_id, "restaurant_ids": res_id},
        {"$set": fields},
        return_document=ReturnDocument.AFTER
    )
    if not doc:
        return {"success": False, "message": "Complaint not found", "status": 404}

    return {
        "success": True,
        "ticket_id": doc["ticket_id"],
        "status": doc["status"],
        "user_id": doc["user_id"],
        "seller_note": doc.get("seller_note"),
    }