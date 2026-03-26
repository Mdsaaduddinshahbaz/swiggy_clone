from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime
import os
load_dotenv(override=True)
api=os.getenv("MONGO_URI",None)
client = MongoClient(api)
try:
    client.admin.command('ping')
    print("Connected successfullyto MongoDB Atlas!")
except Exception as e:
    print("Connection failed:", e)

db=client["restaurants"]
# db.restaurants_name.create_index([("location", "2dsphere")])
# print(db.restaurants.index_information())
restaurants_name=db["restaurants_name"]
resturants_items=db["resturants_items"]
owners=db["owners"]
customers=db["customers"]
customer_carts=db["customer_carts"]
orders=db["Orders"]
seller_orders=db["seller_orders"]
users=db["users"]
def add_resturant_owner(username,password):
    owners.insert_one({"username":username,"password":password})
def add_resturants(name,long,latt):
    restaurants_name.insert_one({"name":name,"location":{"type":"Point","coordinates":[long,latt]}})
def add_resturant_items(resturant_id,item_name,item_qty,price):
    resturants_items.insert_one({"resturant_id":resturant_id,"item_name":item_name,"item_qty":item_qty,"price":price})
def list_resturant_items(resturant_id):
    res=resturants_items.find({"resturant_id":resturant_id})
    item_name={}
    for r in res:
       item_name[ r["item_name"]]={
            "price": r["price"],
            "id": str(r["_id"])   # convert ObjectId to string
        }
    return item_name
def update_resturant_item(item_id,name,price):
    resturants_items.find_one_and_update({"_id":ObjectId(item_id)},{"$set":{"item_name":name,"price":int(price)}})
def list_resturants(long,latt):
    restaurants = restaurants_name.find({
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [long,latt]
                },
                "$maxDistance": 1000
            }
        }
    })
    res_names={}
    for r in restaurants:
        print(r["name"])
        res_names[r["name"]]=str(r["_id"])
        # res_names.append(r["name"])
    return res_names
def add_new_customer(username,password):
    customers.insert_one({"username":username,"password":password})
def add_customer_items(item_name,resturant_id,item_id):
    customer_carts.insert_one({"item_name":item_name,"resturant_id":resturant_id,"item_id":item_id})
def remove_itemss(item_id):
    resturants_items.find_one_and_delete({"_id":ObjectId(item_id)})
# def store_orders(userid,items):
#     # orders.insert_one({"user_id":userid,"items":items,"time":datetime.utcnow()})
#     # for order in items:
#     #     print("order=",order)
#     print(items)
from datetime import datetime
import uuid

def generate_token():
    while True:
        token = str(uuid.uuid4())[:6].upper()
        
        if not orders.find_one({"token": token}):
            return token
def store_orders(userid, items):
    token = generate_token()
    # order_id = "ORD_" + str(int(datetime.utcnow().timestamp()))

    # ✅ 1. Insert into user_orders
    orders.insert_one({"user_id":userid,"token_no":token,"items":items,"time":datetime.utcnow()})

    # ✅ 2. Prepare seller_orders
    seller_docs = []
    res_ids=[]
    for res_id, data in items.items():

        seller_doc = {
            # "order_id": order_id,
            "user_id": userid,
            "token_no":token,
            "restaurant_id": res_id,
            "restaurant_name": data["name"],

            "items": data["items"],

            "status": "placed",
            "time": datetime.utcnow()
        }
        res_ids.append(res_id)


        seller_docs.append(seller_doc)

    # ✅ 3. Insert all at once (FAST)
    if seller_docs:
        seller_orders.insert_many(seller_docs)

    print("Order stored successfully")
    return res_ids
def get_orders(userid):
    final_orders=[]
    orderss=orders.find({"user_id":userid})
    for order in orderss:
        data={
            "order_id":str(order["_id"]),
            "token_no":order["token_no"],
            "resturants":order["items"],
            "date":order["time"]
        }

        final_orders.append(data)
    return final_orders
def store_seller_orders(res_id,items,userid):
    seller_orders.insert_one({"res_id":res_id,"items":items,"user_id":userid,"time":datetime.utcnow()})
def get_seller_ordes(res_id):
    print(res_id)
    orders=seller_orders.find({"restaurant_id":res_id})
    final_orders=[]
    print("seller_orders=",orders)
    for order in orders:
        data={
            "order_id":str(order["_id"]),
            "token_no":order["token_no"],
            "user_id":order['user_id'],
            "items":order["items"],
            "status":order["status"],
            "time":order["time"]
        }
        final_orders.append(data)
    return final_orders
def create_new_user(email,username, password):
    print("in create user")
    user = users.find_one({"email": email})
    print(user)
    if user is None:
        users.insert_one({
            "email": email,
            "username":username,
            "password": password
        })
        return True
    else:
        return False
def check_existing_user(email,password):
    print("in existing user")
    user=users.find_one({"email":email})
    print(user)
    if(user): 
        print("in existing user if block",password)
        if(user["password"]==password):
            print("in existing user if if block")
            return ({"success":True,"userid":user["_id"],"username":user["username"]})
        else:
            return {"success":False}
    else: return {"success":404}
# get_orders("69a959defa10620eb63cf31d")
