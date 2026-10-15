from pymongo import MongoClient, UpdateOne, ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime, timedelta
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
owners = db["owners"]
customers = db["customers"]
customer_carts = db["customer_carts"]
orders = db["Orders"]
seller_orders = db["seller_orders"]
users = db["users"]
categories = db["categories"]
MAX_RETRIES = 5
users.create_index("email", unique=True)
owners.create_index("email", unique=True)


class InventoryError(Exception):
    """Raised inside the order transaction when stock changed under us."""
    pass


def add_resturant_owner(username, password):
    owners.insert_one({"username": username, "password": password})


def add_resturants(name, shop_type, address, phone, owner_id, long, latt, delivery_available=False, delivery_radius=0, file_id="1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"):
    with client.start_session() as session:
        with session.start_transaction():

            result = restaurants_name.insert_one({"name": name, "type": shop_type, "address": address, "phone_no": phone, "ownerId": owner_id, "location": {"type": "Point", "coordinates": [long, latt]}, "file_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000", "delivery_available": delivery_available, "delivery_radius": delivery_radius}, session=session)

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
        res_names[str(r["_id"])] = {"res_name": r["name"], "address": r["address"], "file_url": r["file_url"], "type": r.get("type", "restaurant"), "distance_km": f"{r['distanceMeters'] / 1000:.1f}", "delivery_available": r.get("delivery_available"), "delivery_radius": r.get("delivery_radius", 0)}
    return res_names


# =========================================================
# Restaurant delivery details (cached in Redis)
# =========================================================

def _to_bool(v):
    return str(v).lower() in ("true", "1")


def get_restaurant_delivery(res_id):
    cached = get_cached_delivery(res_id)
    if cached:
        return cached

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
    set_cached_delivery(res_id, data)
    return data


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


def store_orderss(userid):
    try:
        start = time.perf_counter()
        token = generate_token()

        items = get_cart(userid)
        print("cart", time.perf_counter() - start)
        print("items=", items)
        if (items == None or not items.get("cart")):
            return 404

        seller_docs = []
        res_ids = []
        seller_inventory = []
        current_time = datetime.utcnow()
        print("items in store_orders", items["cart"])
        cart = items["cart"]
        print("cart=", cart)
        for res_id, data in cart.items():
            print(res_id, data)
            seller_doc = {
                "user_id": userid,
                "token_no": token,
                "restaurant_id": res_id,
                "restaurant_name": data["name"],

                "items": data["items"],

                "status": "placed",
                "time": current_time
            }
            res_ids.append(res_id)
            for item_id, item in data["items"].items():
                print(item)
                seller_inventory.append(
                    UpdateOne(
                        {
                            "_id": ObjectId(item_id),
                            "available": {"$gte": item["qty"]}
                        },
                        {
                            "$inc": {
                                "available": -item["qty"],
                                "sold": item["qty"]
                            }
                        }
                    )
                )

            seller_docs.append(seller_doc)

        for attempt in range(MAX_RETRIES):
            try:
                start_trasac = time.perf_counter()
                with client.start_session() as session:
                    with session.start_transaction():

                        result = orders.insert_one({"user_id": userid, "token_no": token, "status": "placed", "items": items, "time": current_time}, session=session)
                        parent_id = result.inserted_id

                        for doc in seller_docs:
                            doc["parent_order_id"] = str(parent_id)
                        if seller_docs:
                            seller_orders.insert_many(seller_docs, session=session)

                        if seller_inventory:
                            result = resturants_items.bulk_write(seller_inventory, session=session)
                        start = time.perf_counter()
                        delete_cart(userid, session=session)
                        print("delete", time.perf_counter() - start)
                        print("Order stored successfully")
                print("txn", time.perf_counter() - start_trasac)
                return res_ids
            except OperationFailure as e:

                if "TransientTransactionError" in e.details.get("errorLabels", []):

                    print(f"Retrying transaction ({attempt+1})")

                    time.sleep(0.05)

                    continue

                raise
    except Exception as e:
        print(e)
        return False


def store_ordersss(userid):

    token = generate_token()

    items = get_cart(userid)

    if not items or not items.get("cart"):
        return 404

    current_time = datetime.utcnow()

    seller_docs = []
    inventory_updates = []
    restaurant_ids = []

    for restaurant_id, restaurant in items["cart"].items():

        restaurant_ids.append(restaurant_id)

        seller_docs.append({
            "user_id": userid,
            "token_no": token,
            "restaurant_id": restaurant_id,
            "restaurant_name": restaurant["name"],
            "items": restaurant["items"],
            "status": "placed",
            "time": current_time
        })

        for item_id, item in restaurant["items"].items():

            inventory_updates.append(
                UpdateOne(
                    {
                        "_id": ObjectId(item_id),
                        "available": {"$gte": item["qty"]}
                    },
                    {
                        "$inc": {
                            "available": -item["qty"],
                            "sold": item["qty"]
                        }
                    }
                )
            )

    for attempt in range(MAX_RETRIES):

        try:

            with client.start_session() as session:

                with session.start_transaction():

                    t = time.perf_counter()

                    result = orders.insert_one(
                        {
                            "user_id": userid,
                            "token_no": token,
                            "status": "placed",
                            "items": items,
                            "time": current_time
                        },
                        session=session
                    )

                    print("order insert", time.perf_counter() - t)

                    parent = str(result.inserted_id)

                    for doc in seller_docs:
                        doc["parent_order_id"] = parent

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

                    print("inventory", time.perf_counter() - t)

            t = time.perf_counter()

            delete_cart(userid)

            print("delete cart", time.perf_counter() - t)

            return restaurant_ids

        except OperationFailure as e:

            if "TransientTransactionError" in e.details.get("errorLabels", []):

                time.sleep(0.05)

                continue

            raise

    return False


def store_orders(userid, pickup_time=None, order_type="pickup", address_id=None):
    token = generate_token()
    items = get_cart(userid)

    if not items or not items.get("cart"):
        return 404

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
    seller_docs = []
    inventory_updates = []
    restaurant_ids = []

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

        seller_docs.append({
            "user_id": userid,
            "token_no": token,
            "restaurant_id": restaurant_id,
            "restaurant_name": restaurant["name"],
            "items": verified_items,
            "status": "placed",
            "time": current_time,
            "pickup_time": pickup_time,
            "order_type": order_type,
            "delivery_address": delivery_address
        })

    for attempt in range(MAX_RETRIES):

        try:

            with client.start_session() as session:

                with session.start_transaction():

                    t = time.perf_counter()

                    result = orders.insert_one(
                        {
                            "user_id": userid,
                            "token_no": token,
                            "status": "placed",
                            "items": items,
                            "time": current_time,
                            "pickup_time": pickup_time,
                            "order_type": order_type,
                            "delivery_address": delivery_address
                        },
                        session=session
                    )

                    print("order insert", time.perf_counter() - t)

                    parent = str(result.inserted_id)

                    for doc in seller_docs:
                        doc["parent_order_id"] = parent

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

                continue

            raise

    return False


def get_orders(userid):
    final_orders = []
    orderss = orders.find({"user_id": userid})
    for order in orderss:
        data = {
            "order_id": str(order["_id"]),
            "token_no": order["token_no"],
            "resturants": order["items"],
            "status": order["status"],
            "date": order["time"],
            "pickup_time": order.get("pickup_time"),
            "order_type": order.get("order_type", "pickup"),
            "delivery_address": order.get("delivery_address")
        }

        final_orders.append(data)
    return final_orders


def store_seller_orders(res_id, items, userid):
    seller_orders.insert_one({"res_id": res_id, "items": items, "user_id": userid, "time": datetime.utcnow()})


def get_seller_ordes(res_id):
    print(res_id)
    orders = seller_orders.find({"restaurant_id": res_id})
    final_orders = []
    print("seller_orders=", orders)
    for order in orders:
        data = {
            "order_id": str(order["_id"]),
            "token_no": order["token_no"],
            "user_id": order['user_id'],
            "items": order["items"],
            "status": order["status"],
            "time": order["time"],
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


def update_order_status_seller(order_id, status, userid, res_id):
    with client.start_session() as session:
        with session.start_transaction():
            updated_seller_doc = seller_orders.find_one_and_update(
                {"_id": ObjectId(order_id),
                 "restaurant_id": res_id},
                {"$set": {"status": status}},
                session=session,
                return_document=ReturnDocument.AFTER
            )
            if not updated_seller_doc:
                return ({"success": False, "message": "Order not found or unauthorized"})
            if updated_seller_doc:
                # Grab the parent_id stored at order time
                parent_id = updated_seller_doc.get("parent_order_id")
                parent_result = None

                # Update the main order using that specific ID
                if parent_id:
                    parent_result = orders.find_one_and_update(
                        {
                            "_id": ObjectId(parent_id),
                            "user_id": updated_seller_doc["user_id"]
                        },
                        {"$set": {"status": status}},
                        session=session
                    )
                if not parent_result:
                    return {"success": False, "message": "Parent order not found"}
                return ({"success": True})


def update_order_status_user(order_id, status, userid):
    with client.start_session() as session:
        with session.start_transaction():

            updated_order = orders.find_one_and_update({"_id": ObjectId(order_id), "user_id": userid}, {"$set": {"status": status}}, session=session, return_document=ReturnDocument.AFTER)
            if not updated_order:
                return {
                    "success": False,
                    "message": "Order not found or unauthorized"
                }
            seller_orders.update_many({"parent_order_id": str(updated_order["_id"])}, {"$set": {"status": status}}, session=session)
            return ({"success": True})


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
    seller_orders docs don't store a total_amount field - "items" is a dict
    keyed by item_id (see store_orders: data["items"].items()), e.g.
    {"<item_id>": {"qty": 2, ...}}. Price isn't guaranteed to be in the cart
    snapshot, so we look it up from the item's current price in resturants_items.
    NOTE: this uses *current* price, not the price at time of order - if you
    ever change a price after orders exist, historical revenue will drift.
    """
    order_items = order.get("items", {}) or {}
    total = 0
    for item_id, line in order_items.items():
        price = item_index.get(str(item_id), {}).get("price", 0)
        qty = line.get("qty", 0) if isinstance(line, dict) else 0
        total += int(price) * int(qty)
    return total


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