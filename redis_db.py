import redis
import os
from dotenv import load_dotenv
load_dotenv(override=True)
# Replace with your Redis Cloud credentials
HOST=os.getenv("Redis_uri",None)
PORT=os.getenv("Redis_port",None)
USERNAME=os.getenv("Redis_USERNAME",None)
PASSWORD=os.getenv("Redis_PASSWORD",None)

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
    print(type(data))
    print(data)
    if not data:
        return None

    return json.loads(data)
def delete_cart(uid,session=None):
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
# def add_cart(resid, uid, item, res_name,item_id, qty, price):
#     key = f"cart:{uid}"

#     existing = r.get(key)

#     if existing:
#         cart = json.loads(existing)
#     else:
#         cart = {
#             "uid": uid,
#             "cart": {}
#         }

#     # Ensure restaurant exists using resid
#     if resid not in cart["cart"]:
#         cart["cart"][resid] = {
#             "name": res_name,   # store name for UI
#             "items": {}
#         }

#     # Add/update item
#     if item in cart["cart"][resid]["items"]:
#         cart["cart"][resid]["items"][item]["qty"] += qty
#     else:
#         cart["cart"][resid]["items"][item] = {
#             "qty": qty,
#             "price": price,
#             "item_id":item_id
#         }

#     r.set(key, json.dumps(cart))
import json

# def update_cart_qty(uid, item_name, change):
#     key = f"cart:{uid}"
    
#     # 1. Get the cart from Redis
#     existing = r.get(key)
#     if not existing:
#         return {"success": False, "message": "No cart found for this user"}

#     cart_data = json.loads(existing)
#     found = False

#     # 2. Iterate through restaurants to find the item
#     # We use list(dict.keys()) because we might delete keys during the loop
#     for res_id in list(cart_data["cart"].keys()):
#         if item_name in cart_data["cart"][res_id]["items"]:
#             print("cart_Data=",cart_data["cart"][res_id]["items"])
#             item_ref = cart_data["cart"][res_id]["items"][item_name]
            
#             # 3. Update the quantity
#             item_ref["qty"] += change
#             found = True

#             # 4. Remove item if it hits 0
#             if item_ref["qty"] <= 0:
#                 del cart_data["cart"][res_id]["items"][item_name]
                
#                 # 5. Remove restaurant if it's now empty
#                 if not cart_data["cart"][res_id]["items"]:
#                     del cart_data["cart"][res_id]
            
#             break # Stop searching once we find and update the item

#     if not found:
#         return {"success": False, "message": "Item not found in any restaurant in your cart"}

#     # 6. Save the updated cart back to Redis
#     r.set(key, json.dumps(cart_data))
#     print("Updated Cart:")
#     for res_id, res_data in cart_data["cart"].items():
#         print(f"\nRestaurant ID: {res_id}")
#         for item, details in res_data["items"].items():
#             print(f"  Item: {item}, Qty: {details['qty']}")
#     return {"success": True, "updated_cart": cart_data}
# delete_cart("None")
get_cart("69dc9a0e830ee0aee697bda0")
# def add_cart(resid, uid, item_name, res_name, item_id, qty, price):
#     price=get_resturantItem_price(resid,item_id)
#     key = f"cart:{uid}"

#     existing = r.get(key)

#     if existing:
#         cart = json.loads(existing)
#     else:
#         cart = {
#             "uid": uid,
#             "total":0,
#             "cart": {}
#         }

#     # Ensure restaurant exists
#     if resid not in cart["cart"]:
#         cart["cart"][resid] = {
#             "name": res_name,
#             "items": {}
#         }

#     items = cart["cart"][resid]["items"]

#     # Add/update item using item_id as key
#     if item_id in items:
#         items[item_id]["qty"] += qty
#     else:
#         items[item_id] = {
#             "name": item_name,
#             "qty": qty,
#             "price": price
#         }
#     cart["total"] += (int(qty) * int(price))
#     r.set(key, json.dumps(cart))
#     return ({"success":True,"total":cart["total"]})

# def add_cart(resid, uid, item_name, res_name, item_id, qty,price): ############## working (best)
#     resid = str(resid)
#     item_id = str(item_id)
#     qty = int(qty)
#     if qty <= 0:
#         return {"success": False, "message": "Quantity must be positive"}
#     key = f"cart:{uid}"

#     existing = r.get(key)

#     if existing:
#         cart = json.loads(existing)
#     else:
#         cart = {
#             "uid": uid,
#             "total": 0,
#             "cart": {}
#         }

#     if resid not in cart["cart"]:
#         cart["cart"][resid] = {
#             "name": res_name,
#             "items": {}
#         }

#     items = cart["cart"][resid]["items"]

#     if item_id in items:
#         # Price already stored in Redis
#         price = items[item_id]["price"]
#         items[item_id]["qty"] += qty
#     else:
#         # First time adding -> fetch from MongoDB
        

#         if price is None:
#             return {
#                 "success": False,
#                 "message": "Item not found"
#             }

#         price = int(price)

#         items[item_id] = {
#             "name": item_name,
#             "qty": qty,
#             "price": price
#         }

#     cart["total"] += qty * price

#     r.set(key, json.dumps(cart))

#     return {
#         "success": True,
#         "total": cart["total"]
#     }
def add_cart(resid, uid, item_name, res_name, item_id, qty, price,available_qty):
    # if(available_qty<qty)
    resid = str(resid)
    item_id = str(item_id)

    try:
        qty = int(qty)
    except ValueError:
        return {
            "success": False,
            "message": "Invalid quantity"
        }
    try:
        available_qty = int(available_qty)
    except ValueError:
        return {
            "success": False,
            "message": "Invalid quantity available value"
        }
    # if(available_qty<qty):
    #     return {
    #         "success":False,
    #         "message": "Item is Out of Stock"
    #     }
    if qty <= 0:
        return {
            "success": False,
            "message": "Quantity must be positive"
        }

    if price is None:
        return {
            "success": False,
            "message": "Item not found"
        }

    try:
        price = int(price)
    except ValueError:
        return {
            "success": False,
            "message": "Invalid price"
        }

    key = f"cart:{uid}"

    # while True:
    for _ in range(5):
        try:
            with r.pipeline() as pipe:

                pipe.watch(key)

                existing = pipe.get(key)

                if existing:
                    try:
                        cart = json.loads(existing)
                    except json.JSONDecodeError:
                        pipe.unwatch()
                        return {
                            "success": False,
                            "message": "Corrupted cart data"
                        }
                else:
                    cart = {
                        "uid": uid,
                        "total": 0,
                        "cart": {}
                    }

                if resid not in cart["cart"]:
                    cart["cart"][resid] = {
                        "name": res_name,
                        "items": {}
                    }

                items = cart["cart"][resid]["items"]

                if item_id in items:
                    # Keep the original price already stored in cart
                    existing_qty = items[item_id]["qty"]

                    new_total = existing_qty + qty

                    if new_total > available_qty:
                        return {
                            "success": False,
                            "message": f"Only {available_qty} items available."
                        }
                    item_price = items[item_id]["price"]
                    items[item_id]["qty"] += qty
                    items[item_id]["available_qty"] = available_qty
                else:
                    if qty > available_qty:
                        return {
                            "success": False,
                            "message": f"Only {available_qty} items available."
                        }
                    item_price = price
                    items[item_id] = {
                        "name": item_name,
                        "qty": qty,
                        "price": item_price,
                        "available_qty":available_qty
                    }

                cart["total"] += qty * item_price

                pipe.multi()
                pipe.set(key, json.dumps(cart))
                pipe.execute()

                return {
                    "success": True,
                    "updated_cart": cart,
                    "total": cart["total"]
                }

        except redis.WatchError:
            # Another request modified the cart.
            # Retry with the latest version.
            continue
        except (redis.ConnectionError, redis.TimeoutError):
            return {
                "success": False,
                "message": "Unable to access cart. Please try again."
            }
    return {
    "success": False,
    "message": "Please retry"
    }

# def update_cart_qty(uid, item_id, change):  ###### working (best)
#     key = f"cart:{uid}"
#     if change not in (-1, 1):
#         return {
#             "success": False,
#             "message": "The value must be 1 or -1"
#         }
#     item_id=str(item_id)
#     existing = r.get(key)
#     if not existing:
#         return {
#             "success": False,
#             "message": "No cart found for this user"
#         }

#     cart_data = json.loads(existing)

#     for res_id in list(cart_data["cart"].keys()):
#         items = cart_data["cart"][res_id]["items"]

#         if item_id in items:
#             price = items[item_id]["price"]
#             # items[item_id]["qty"] += change
#             # cart_data["total"] += change * price
#             old_qty = items[item_id]["qty"]

#             if change < 0 and abs(change) >= old_qty:
#                 cart_data["total"] -= old_qty * price
#                 del items[item_id]
#             else:
#                 items[item_id]["qty"] += change
#                 cart_data["total"] += change * price
#             if items[item_id]["qty"] <= 0:
#                 del items[item_id]

#                 # Remove restaurant if empty
#                 if not items:
#                     del cart_data["cart"][res_id]

#             r.set(key, json.dumps(cart_data))
#             return {
#                 "success": True,
#                 "updated_cart": cart_data,
#                 "total":cart_data["total"]
#             }

#     return {
#         "success": False,
#         "message": "Item not found in cart"
#     }

import redis
import json

def update_cart_qty(uid, item_id, change):
    if change not in (-1, 1):
        return {
            "success": False,
            "message": "change must be +1 or -1"
        }
    key = f"cart:{uid}"
    item_id = str(item_id)

    # while True:
    for _ in range(5):
        try:
            with r.pipeline() as pipe:

                # Watch the key
                pipe.watch(key)

                existing = pipe.get(key)
                if not existing:
                    pipe.unwatch()
                    return {
                        "success": False,
                        "message": "Cart not found"
                    }
                try:
                    cart = json.loads(existing)
                except json.JSONDecodeError:
                    pipe.unwatch()
                    return {
                        "success": False,
                        "message": "Corrupted cart data"
                    }

                found = False

                for res_id in list(cart["cart"].keys()):
                    items = cart["cart"][res_id]["items"]

                    if item_id in items:
                        available = items[item_id]["available_qty"]
                        price = items[item_id]["price"]
                        old_qty = items[item_id]["qty"]

                        if change > 0 and old_qty + change > available:
                            pipe.unwatch()
                            return {
                                "success": False,
                                "message": f"Only {available} items available."
                            }
                        found = True


                        new_qty = old_qty + change

                        if new_qty <= 0:
                            cart["total"] -= old_qty * price
                            del items[item_id]

                            if not items:
                                del cart["cart"][res_id]

                        else:
                            items[item_id]["qty"] = new_qty
                            cart["total"] += change * price

                        break

                if not found:
                    pipe.unwatch()
                    return {
                        "success": False,
                        "message": "Item not found"
                    }

                # Begin transaction
                pipe.multi()

                pipe.set(key, json.dumps(cart))

                pipe.execute()

                return {
                    "success": True,
                    "updated_cart": cart,
                    "total": cart["total"]
                }

        except redis.WatchError:
            # Someone modified the cart
            # Retry automatically
            continue
        except (redis.ConnectionError, redis.TimeoutError):
            return {
                "success": False,
                "message": "Unable to access cart. Please try again."
            }
    return {
    "success": False,
    "message": "Please retry"
}

# delete_cart("6a30e1bccfbdcefd495d5246")