import redis

# Replace with your Redis Cloud credentials
HOST = "redis-15710.crce281.ap-south-1-3.ec2.cloud.redislabs.com"
PORT = 15710
USERNAME = "default"   # optional depending on config
PASSWORD = "9EaR55kom1p9DAAtx1T3uEahpLfIYEQ3"

# Create connection
r = redis.Redis(
    host=HOST,
    port=PORT,
    username=USERNAME,
    password=PASSWORD,
    decode_responses=True, 
    db=0# returns strings instead of bytes
)

# Test connection
try:
    print("Ping:", r.ping())
except Exception as e:
    print("Connection error:", e)


import json

def add_json(userid,key, data, expiry=None):
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
# def add_cart(uid, item, res_name,qty, price):
#     key = f"cart:{uid}"

#     # 🔹 Check if cart exists
#     existing = r.get(key)

#     if existing:
#         cart = json.loads(existing)
#     else:
#         cart = {
#             "uid": uid,
#             "ress_name":res_name,
#             "cart": {}
#         }

#     # 🔹 If item already in cart → increase qty
#     if item in cart["cart"]:
#         cart["cart"][item]["qty"] += qty
#     else:
#         cart["cart"][item] = {
#             "qty": qty,
#             "price": price
#         }

#     # 🔹 Save back to Redis
#     r.set(key, json.dumps(cart))
# add_json("name","saad")
print("Keys:", r.keys("*"))
import json

def get_cart(uid):
    print("uid",uid)
    key = f"cart:{uid}"

    data = r.get(key)
    print(data)
    if not data:
        return None

    return json.loads(data)
def delete_cart(uid):
    key = f"cart:{uid}"
    r.delete(key)
# delete_cart("69a959defa10620eb63cf31d")
# def add_cart(uid, item, res_name, qty, price):
#     key = f"cart:{uid}"

#     existing = r.get(key)

#     if existing:
#         cart = json.loads(existing)
#     else:
#         cart = {
#             "uid": uid,
#             "cart": {}
#         }

#     # Ensure restaurant exists
#     if res_name not in cart["cart"]:
#         cart["cart"][res_name] = {}

#     # Add/update item
#     if item in cart["cart"][res_name]:
#         cart["cart"][res_name][item]["qty"] += qty
#     else:
#         cart["cart"][res_name][item] = {
#             "qty": qty,
#             "price": price
#         }

#     r.set(key, json.dumps(cart))
def add_cart(resid, uid, item, res_name, qty, price):
    key = f"cart:{uid}"

    existing = r.get(key)

    if existing:
        cart = json.loads(existing)
    else:
        cart = {
            "uid": uid,
            "cart": {}
        }

    # Ensure restaurant exists using resid
    if resid not in cart["cart"]:
        cart["cart"][resid] = {
            "name": res_name,   # store name for UI
            "items": {}
        }

    # Add/update item
    if item in cart["cart"][resid]["items"]:
        cart["cart"][resid]["items"][item]["qty"] += qty
    else:
        cart["cart"][resid]["items"][item] = {
            "qty": qty,
            "price": price
        }

    r.set(key, json.dumps(cart))
# delete_cart(None)