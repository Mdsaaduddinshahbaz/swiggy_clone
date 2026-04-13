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
def add_cart(resid, uid, item, res_name,item_id, qty, price):
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
            "price": price,
            "item_id":item_id
        }

    r.set(key, json.dumps(cart))
import json

def update_cart_qty(uid, item_name, change):
    key = f"cart:{uid}"
    
    # 1. Get the cart from Redis
    existing = r.get(key)
    if not existing:
        return {"success": False, "message": "No cart found for this user"}

    cart_data = json.loads(existing)
    found = False

    # 2. Iterate through restaurants to find the item
    # We use list(dict.keys()) because we might delete keys during the loop
    for res_id in list(cart_data["cart"].keys()):
        if item_name in cart_data["cart"][res_id]["items"]:
            item_ref = cart_data["cart"][res_id]["items"][item_name]
            
            # 3. Update the quantity
            item_ref["qty"] += change
            found = True

            # 4. Remove item if it hits 0
            if item_ref["qty"] <= 0:
                del cart_data["cart"][res_id]["items"][item_name]
                
                # 5. Remove restaurant if it's now empty
                if not cart_data["cart"][res_id]["items"]:
                    del cart_data["cart"][res_id]
            
            break # Stop searching once we find and update the item

    if not found:
        return {"success": False, "message": "Item not found in any restaurant in your cart"}

    # 6. Save the updated cart back to Redis
    r.set(key, json.dumps(cart_data))
    print("Updated Cart:")
    for res_id, res_data in cart_data["cart"].items():
        print(f"\nRestaurant ID: {res_id}")
        for item, details in res_data["items"].items():
            print(f"  Item: {item}, Qty: {details['qty']}")
    return {"success": True, "updated_cart": cart_data}
# delete_cart("None")
get_cart("69dc9a0e830ee0aee697bda0")