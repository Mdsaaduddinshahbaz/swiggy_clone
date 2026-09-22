"""
Redis: shopping carts and the checkout lock.

Cart per user (both keys expire after CART_TTL_SECONDS without activity):
  cart:{uid}:meta   hash  {uid, restaurant, restaurant_name, total}
  cart:{uid}:items  hash  {item_id: json {name, qty, price, available_qty}}
A cart holds items from one restaurant only.
"""
import json
import logging
import os
import uuid
from urllib.parse import quote

import redis
from dotenv import load_dotenv

load_dotenv(override=True)
log = logging.getLogger(__name__)

_host = os.getenv("Redis_uri")
_port = os.getenv("Redis_port")
_user = os.getenv("Redis_USERNAME") or ""
_password = os.getenv("Redis_PASSWORD") or ""
_auth = f"{quote(_user, safe='')}:{quote(_password, safe='')}@" if (_user or _password) else ""
REDIS_URL = f"redis://{_auth}{_host}:{_port}"     # also used by Socket.IO in server.py

CART_TTL_SECONDS = 7 * 24 * 3600

pool = redis.ConnectionPool.from_url(
    REDIS_URL,
    decode_responses=True,
    # socket_timeout=5,
    # socket_connect_timeout=5,
    # health_check_interval=30,
)
r = redis.Redis(connection_pool=pool)

try:
    r.ping()
except redis.RedisError as e:
    log.error("Redis connection failed: %s", e)


# ------------------------------------------------------------------ Lua scripts
# Each script runs inside Redis in one step, so two requests can't mix up a cart.

_ADD_CART_LUA = """
local meta_key, items_key = KEYS[1], KEYS[2]
local uid, resid, res_name = ARGV[1], ARGV[2], ARGV[3]
local item_id, item_name = ARGV[4], ARGV[5]
local qty_delta = tonumber(ARGV[6])
local price = tonumber(ARGV[7])
local available_qty = tonumber(ARGV[8])
local replace = ARGV[9]
local ttl = tonumber(ARGV[10])

local restaurant = redis.call('HGET', meta_key, 'restaurant')
if restaurant and restaurant ~= resid then
    if replace ~= '1' then
        return cjson.encode({success = false,
            message = "Items with different store exists, Would you like to replace it?"})
    end
    redis.call('DEL', meta_key, items_key)
    restaurant = nil
end

local item, total_delta
local existing = redis.call('HGET', items_key, item_id)
if existing then
    item = cjson.decode(existing)
    local new_qty = item.qty + qty_delta
    if new_qty > available_qty then
        return cjson.encode({success = false, message = "Only " .. available_qty .. " items available."})
    end
    -- re-price the whole line at today's price so the cart total stays right
    total_delta = new_qty * price - item.qty * item.price
    item.qty = new_qty
    item.price = price
    item.name = item_name
    item.available_qty = available_qty
else
    if qty_delta > available_qty then
        return cjson.encode({success = false, message = "Only " .. available_qty .. " items available."})
    end
    item = {name = item_name, qty = qty_delta, price = price, available_qty = available_qty}
    total_delta = qty_delta * price
end

if not restaurant then
    redis.call('HSET', meta_key, 'uid', uid, 'restaurant', resid, 'restaurant_name', res_name, 'total', 0)
end
redis.call('HSET', items_key, item_id, cjson.encode(item))
local total = redis.call('HINCRBY', meta_key, 'total', total_delta)
redis.call('EXPIRE', meta_key, ttl)
redis.call('EXPIRE', items_key, ttl)
return cjson.encode({success = true, total = total, item = item})
"""

_UPDATE_QTY_LUA = """
local meta_key, items_key = KEYS[1], KEYS[2]
local item_id = ARGV[1]
local change = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local existing = redis.call('HGET', items_key, item_id)
if not existing then
    return cjson.encode({success = false, message = "Item not found"})
end

local item = cjson.decode(existing)
if change > 0 and (item.qty + change) > item.available_qty then
    return cjson.encode({success = false, message = "Only " .. item.available_qty .. " items available."})
end

local new_qty = item.qty + change
if new_qty <= 0 then
    redis.call('HDEL', items_key, item_id)
    local total = redis.call('HINCRBY', meta_key, 'total', -(item.qty * item.price))
    if redis.call('HLEN', items_key) == 0 then
        redis.call('DEL', meta_key, items_key)
    else
        redis.call('EXPIRE', meta_key, ttl)
        redis.call('EXPIRE', items_key, ttl)
    end
    return cjson.encode({success = true, total = total, removed = true})
end

item.qty = new_qty
redis.call('HSET', items_key, item_id, cjson.encode(item))
local total = redis.call('HINCRBY', meta_key, 'total', change * item.price)
redis.call('EXPIRE', meta_key, ttl)
redis.call('EXPIRE', items_key, ttl)
return cjson.encode({success = true, total = total, removed = false})
"""

_RELEASE_LOCK_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""

_add_script = r.register_script(_ADD_CART_LUA)
_update_script = r.register_script(_UPDATE_QTY_LUA)
_release_script = r.register_script(_RELEASE_LOCK_LUA)


def _cart_keys(uid):
    uid = str(uid)
    return [f"cart:{uid}:meta", f"cart:{uid}:items"]


# ------------------------------------------------------------------------ carts

def add_cart(resid, uid, item_name, res_name, item_id, qty, price, available_qty, replace=False):
    try:
        qty, price, available_qty = int(qty), int(price), int(available_qty)
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid input"}
    if qty <= 0:
        return {"success": False, "message": "Quantity must be positive"}
    result = _add_script(
        keys=_cart_keys(uid),
        args=[str(uid), str(resid), res_name, str(item_id), item_name, qty, price, available_qty,
              "1" if replace else "0", CART_TTL_SECONDS],
    )
    return json.loads(result)


def update_cart_qty(uid, item_id, change):
    """change is +n / -n. The line is removed when it reaches 0."""
    try:
        change = int(change)
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid change value"}
    if change == 0:
        return {"success": False, "message": "No change to apply"}
    result = _update_script(keys=_cart_keys(uid), args=[str(item_id), change, CART_TTL_SECONDS])
    return json.loads(result)


def get_cart(uid):
    meta_key, items_key = _cart_keys(uid)
    pipe = r.pipeline()
    pipe.hgetall(meta_key)
    pipe.hgetall(items_key)
    meta, raw_items = pipe.execute()
    if not meta or not raw_items:
        return None
    for i in meta.keys():
        print("key=",i)
    print(raw_items)
    return {
        "uid": str(uid),
        "total": int(meta.get("total", 0)),
        "cart": {
            meta["restaurant"]: {
                "name": meta.get("restaurant_name"),
                "items": {item_id: json.loads(value) for item_id, value in raw_items.items()},
            }
        },
    }


def delete_cart(uid):
    r.delete(*_cart_keys(uid))


def add_json(userid, key, data, expiry=None):
    try:
        r.set(key, json.dumps(data), ex=expiry)
        return True
    except (redis.RedisError, TypeError, ValueError) as e:
        log.error("add_json failed for %s: %s", key, e)
        return False


# ------------------------------------------------------------------------ locks

def acquire_lock(key, ttl_seconds=15):
    """Returns a token if the lock was taken, None if someone else holds it."""
    token = str(uuid.uuid4())
    return token if r.set(key, token, nx=True, ex=ttl_seconds) else None


def release_lock(key, token):
    """Only releases the lock if we still own it."""
    try:
        _release_script(keys=[key], args=[token])
    except redis.RedisError as e:
        log.error("release_lock failed for %s: %s", key, e)
