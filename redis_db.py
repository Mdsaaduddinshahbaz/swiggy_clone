# import os
# import json
# import redis
# from dotenv import load_dotenv

# load_dotenv(override=True)

# HOST = os.getenv("Redis_uri")
# PORT = os.getenv("Redis_port")
# USERNAME = os.getenv("Redis_USERNAME")
# PASSWORD = os.getenv("Redis_PASSWORD")

# # -------------------------
# # Pooled connection (create once, reuse everywhere)
# # -------------------------
# pool = redis.ConnectionPool(
#     host=HOST,
#     port=PORT,
#     username=USERNAME,
#     password=PASSWORD,
#     decode_responses=True,
#     db=0,
# )
# r = redis.Redis(connection_pool=pool)

# try:
#     r.ping()
# except Exception as e:
#     print("Redis connection error:", e)


# # =========================================================
# # Lua scripts (registered once at import time)
# # Data model per user:
# #   cart:{uid}:meta   -> hash { uid, restaurant, restaurant_name, total }
# #   cart:{uid}:items  -> hash { item_id: json({name, qty, price, available_qty}) }
# # =========================================================

# _ADD_CART_LUA = """
# local meta_key = KEYS[1]
# local items_key = KEYS[2]

# local uid = ARGV[1]
# local resid = ARGV[2]
# local res_name = ARGV[3]
# local item_id = ARGV[4]
# local item_name = ARGV[5]
# local qty_delta = tonumber(ARGV[6])
# local price = tonumber(ARGV[7])
# local available_qty = tonumber(ARGV[8])
# local replace = ARGV[9]

# local restaurant = redis.call('HGET', meta_key, 'restaurant')

# if restaurant and restaurant ~= resid then
#     if replace == '1' then
#         redis.call('DEL', meta_key)
#         redis.call('DEL', items_key)
#         restaurant = nil
#     else
#         return cjson.encode({
#             success = false,
#             message = "Items with different store exists, Would you like to replace it?"
#         })
#     end
# end

# if not restaurant then
#     redis.call('HSET', meta_key, 'uid', uid, 'restaurant', resid, 'restaurant_name', res_name, 'total', 0)
# end

# local existing = redis.call('HGET', items_key, item_id)
# local item

# if existing then
#     item = cjson.decode(existing)
#     local new_qty = item.qty + qty_delta
#     if new_qty > available_qty then
#         return cjson.encode({
#             success = false,
#             message = "Only " .. available_qty .. " items available."
#         })
#     end
#     item.qty = new_qty
#     item.available_qty = available_qty
# else
#     if qty_delta > available_qty then
#         return cjson.encode({
#             success = false,
#             message = "Only " .. available_qty .. " items available."
#         })
#     end
#     item = { name = item_name, qty = qty_delta, price = price, available_qty = available_qty }
# end

# redis.call('HSET', items_key, item_id, cjson.encode(item))
# local total = redis.call('HINCRBY', meta_key, 'total', qty_delta * item.price)

# return cjson.encode({ success = true, total = total, item = item })
# """

# _UPDATE_QTY_LUA = """
# local meta_key = KEYS[1]
# local items_key = KEYS[2]

# local item_id = ARGV[1]
# local change = tonumber(ARGV[2])

# local existing = redis.call('HGET', items_key, item_id)
# if not existing then
#     return cjson.encode({ success = false, message = "Item not found" })
# end

# local item = cjson.decode(existing)
# local old_qty = item.qty
# local price = item.price
# local available = item.available_qty

# if change > 0 and (old_qty + change) > available then
#     return cjson.encode({
#         success = false,
#         message = "Only " .. available .. " items available."
#     })
# end

# local new_qty = old_qty + change
# local total
# local removed = false

# if new_qty <= 0 then
#     redis.call('HDEL', items_key, item_id)
#     total = redis.call('HINCRBY', meta_key, 'total', -(old_qty * price))
#     removed = true

#     if redis.call('HLEN', items_key) == 0 then
#         redis.call('DEL', meta_key)
#         redis.call('DEL', items_key)
#     end
# else
#     item.qty = new_qty
#     redis.call('HSET', items_key, item_id, cjson.encode(item))
#     total = redis.call('HINCRBY', meta_key, 'total', change * price)
# end

# return cjson.encode({ success = true, total = total, removed = removed })
# """

# add_cart_script = r.register_script(_ADD_CART_LUA)
# update_qty_script = r.register_script(_UPDATE_QTY_LUA)


# # =========================================================
# # Public API
# # =========================================================

# def add_cart(resid, uid, item_name, res_name, item_id, qty, price, available_qty, replace=False):
#     resid = str(resid)
#     uid = str(uid)
#     item_id = str(item_id)

#     try:
#         qty = int(qty)
#         price = int(price)
#         available_qty = int(available_qty)
#     except (TypeError, ValueError):
#         return {"success": False, "message": "Invalid input"}

#     if qty <= 0:
#         return {"success": False, "message": "Quantity must be positive"}

#     meta_key = f"cart:{uid}:meta"
#     items_key = f"cart:{uid}:items"

#     result = add_cart_script(
#         keys=[meta_key, items_key],
#         args=[uid, resid, res_name, item_id, item_name, qty, price, available_qty, "1" if replace else "0"],
#     )
#     return json.loads(result)


# def update_cart_qty(uid, item_id, change):
#     if change not in (-1, 1):
#         return {"success": False, "message": "change must be +1 or -1"}

#     uid = str(uid)
#     item_id = str(item_id)

#     meta_key = f"cart:{uid}:meta"
#     items_key = f"cart:{uid}:items"

#     result = update_qty_script(
#         keys=[meta_key, items_key],
#         args=[item_id, change],
#     )
#     return json.loads(result)


# def get_cart(uid):
#     uid = str(uid)
#     meta_key = f"cart:{uid}:meta"
#     items_key = f"cart:{uid}:items"

#     meta = r.hgetall(meta_key)
#     if not meta:
#         return None

#     raw_items = r.hgetall(items_key)
#     items = {item_id: json.loads(value) for item_id, value in raw_items.items()}

#     return {
#         "uid": uid,
#         "total": int(meta.get("total", 0)),
#         "cart": {
#             meta.get("restaurant"): {
#                 "name": meta.get("restaurant_name"),
#                 "items": items,
#             }
#         },
#     }


# def delete_cart(uid, session=None):
#     uid = str(uid)
#     r.delete(f"cart:{uid}:meta")
#     r.delete(f"cart:{uid}:items")


# def add_json(userid, key, data, expiry=None):
#     try:
#         value = json.dumps(data)
#         if expiry:
#             r.set(key, value, ex=expiry)
#         else:
#             r.set(key, value)
#         return True
#     except Exception as e:
#         print("Error:", e)
#         return False

import os
import json
import redis
from dotenv import load_dotenv

load_dotenv(override=True)

HOST = os.getenv("Redis_uri")
PORT = os.getenv("Redis_port")
USERNAME = os.getenv("Redis_USERNAME")
PASSWORD = os.getenv("Redis_PASSWORD")

# -------------------------
# Pooled connection (create once, reuse everywhere)
# -------------------------
pool = redis.ConnectionPool(
    host=HOST,
    port=PORT,
    username=USERNAME,
    password=PASSWORD,
    decode_responses=True,
    db=0,
)
r = redis.Redis(connection_pool=pool)

try:
    r.ping()
except Exception as e:
    print("Redis connection error:", e)


# =========================================================
# Lua scripts (registered once at import time)
# Data model per user:
#   cart:{uid}:meta   -> hash { uid, restaurant, restaurant_name, total }
#   cart:{uid}:items  -> hash { item_id: json({name, qty, price, available_qty}) }
# =========================================================

_ADD_CART_LUA = """
local meta_key = KEYS[1]
local items_key = KEYS[2]

local uid = ARGV[1]
local resid = ARGV[2]
local res_name = ARGV[3]
local item_id = ARGV[4]
local item_name = ARGV[5]
local qty_delta = tonumber(ARGV[6])
local price = tonumber(ARGV[7])
local available_qty = tonumber(ARGV[8])
local replace = ARGV[9]

local restaurant = redis.call('HGET', meta_key, 'restaurant')

if restaurant and restaurant ~= resid then
    if replace == '1' then
        redis.call('DEL', meta_key)
        redis.call('DEL', items_key)
        restaurant = nil
    else
        return cjson.encode({
            success = false,
            message = "Items with different store exists, Would you like to replace it?"
        })
    end
end

if not restaurant then
    redis.call('HSET', meta_key, 'uid', uid, 'restaurant', resid, 'restaurant_name', res_name, 'total', 0)
end

local existing = redis.call('HGET', items_key, item_id)
local item

if existing then
    item = cjson.decode(existing)
    local new_qty = item.qty + qty_delta
    if new_qty > available_qty then
        return cjson.encode({
            success = false,
            message = "Only " .. available_qty .. " items available."
        })
    end
    item.qty = new_qty
    item.available_qty = available_qty
else
    if qty_delta > available_qty then
        return cjson.encode({
            success = false,
            message = "Only " .. available_qty .. " items available."
        })
    end
    item = { name = item_name, qty = qty_delta, price = price, available_qty = available_qty }
end

redis.call('HSET', items_key, item_id, cjson.encode(item))
local total = redis.call('HINCRBY', meta_key, 'total', qty_delta * item.price)

return cjson.encode({ success = true, total = total, item = item })
"""

_UPDATE_QTY_LUA = """
local meta_key = KEYS[1]
local items_key = KEYS[2]

local item_id = ARGV[1]
local change = tonumber(ARGV[2])

local existing = redis.call('HGET', items_key, item_id)
if not existing then
    return cjson.encode({ success = false, message = "Item not found" })
end

local item = cjson.decode(existing)
local old_qty = item.qty
local price = item.price
local available = item.available_qty

if change > 0 and (old_qty + change) > available then
    return cjson.encode({
        success = false,
        message = "Only " .. available .. " items available."
    })
end

local new_qty = old_qty + change
local total
local removed = false

if new_qty <= 0 then
    redis.call('HDEL', items_key, item_id)
    total = redis.call('HINCRBY', meta_key, 'total', -(old_qty * price))
    removed = true

    if redis.call('HLEN', items_key) == 0 then
        redis.call('DEL', meta_key)
        redis.call('DEL', items_key)
    end
else
    item.qty = new_qty
    redis.call('HSET', items_key, item_id, cjson.encode(item))
    total = redis.call('HINCRBY', meta_key, 'total', change * price)
end

return cjson.encode({ success = true, total = total, removed = removed })
"""

add_cart_script = r.register_script(_ADD_CART_LUA)
update_qty_script = r.register_script(_UPDATE_QTY_LUA)


# =========================================================
# Public API
# =========================================================

def add_cart(resid, uid, item_name, res_name, item_id, qty, price, available_qty, replace=False):
    resid = str(resid)
    uid = str(uid)
    item_id = str(item_id)

    try:
        qty = int(qty)
        price = int(price)
        available_qty = int(available_qty)
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid input"}

    if qty <= 0:
        return {"success": False, "message": "Quantity must be positive"}

    meta_key = f"cart:{uid}:meta"
    items_key = f"cart:{uid}:items"

    result = add_cart_script(
        keys=[meta_key, items_key],
        args=[uid, resid, res_name, item_id, item_name, qty, price, available_qty, "1" if replace else "0"],
    )
    return json.loads(result)


def update_cart_qty(uid, item_id, change):
    try:
        change = int(change)
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid change value"}

    if change == 0:
        return {"success": False, "message": "No change to apply"}

    uid = str(uid)
    item_id = str(item_id)

    meta_key = f"cart:{uid}:meta"
    items_key = f"cart:{uid}:items"

    result = update_qty_script(
        keys=[meta_key, items_key],
        args=[item_id, change],
    )
    return json.loads(result)


def get_cart(uid):
    uid = str(uid)
    meta_key = f"cart:{uid}:meta"
    items_key = f"cart:{uid}:items"

    meta = r.hgetall(meta_key)
    if not meta:
        return None

    raw_items = r.hgetall(items_key)
    items = {item_id: json.loads(value) for item_id, value in raw_items.items()}

    return {
        "uid": uid,
        "total": int(meta.get("total", 0)),
        "cart": {
            meta.get("restaurant"): {
                "name": meta.get("restaurant_name"),
                "items": items,
            }
        },
    }


def delete_cart(uid, session=None):
    uid = str(uid)
    r.delete(f"cart:{uid}:meta")
    r.delete(f"cart:{uid}:items")


def add_json(userid, key, data, expiry=None):
    try:
        value = json.dumps(data)
        if expiry:
            r.set(key, value, ex=expiry)
        else:
            r.set(key, value)
        return True
    except Exception as e:
        print("Error:", e)
        return False
    
import uuid

_RELEASE_LOCK_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
"""
release_lock_script = r.register_script(_RELEASE_LOCK_LUA)

def acquire_lock(key, ttl_seconds=15):
    """Returns a token if lock acquired, None if already locked."""
    token = str(uuid.uuid4())
    acquired = r.set(key, token, nx=True, ex=ttl_seconds)
    return token if acquired else None

def release_lock(key, token):
    """Only releases the lock if we're still the owner (didn't expire + get re-grabbed)."""
    try:
        release_lock_script(keys=[key], args=[token])
    except Exception as e:
        print("release_lock error:", e)