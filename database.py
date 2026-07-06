from pymongo import MongoClient,UpdateOne,ReturnDocument
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime
import os
from redis_db import delete_cart,get_cart
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
categories=db["categories"]

def add_resturant_owner(username,password):
    owners.insert_one({"username":username,"password":password})
def add_resturants(name,address,phone,owner_id,long,latt,file_id="1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"):
    # res=restaurants_name.insert_one({"name":name,"address":address,"phone_no":phone,"ownerId":owner_id,"location":{"type":"Point","coordinates":[long,latt]}})
    with client.start_session() as session:
        with session.start_transaction():

            result=restaurants_name.insert_one({"name":name,"address":address,"phone_no":phone,"ownerId":owner_id,"location":{"type":"Point","coordinates":[long,latt]},"file_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"})
            # parent_id = result.inserted_id 
            
            # 3. Add that parent_id to every seller doc before inserting
            owners.update_one(
                {"_id": ObjectId(owner_id)},
                {
                    "$set": {
                        "is_setup":True,
                        "restaurant_name": name,
                        "resturant_id":str(result.inserted_id)
                    }
                    # OR use $push if one owner can have multiple restaurants
                },
                session=session
            )
    return str(result.inserted_id )
def add_resturant_items(resturant_id,item_name,item_qty,price,sub_id,desc,unit,lowat,available,sold=0,file_id="1nR05-X2jjSDUdZNbVmpYBr-bsqv5UhVz"):
    ret=resturants_items.insert_one({"resturant_id":resturant_id,"item_name":item_name,"item_qty":item_qty,"price":price,"sub_id":sub_id,"desc":desc,"unit":unit,"lowat":lowat,"available":available,"sold":sold,"file_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"})
    return ({"id":str(ret.inserted_id),"url":f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"})
def list_resturant_items(resturant_id,types):
    if(types=="seller"):
        res=resturants_items.find({"resturant_id":resturant_id})
        cat=categories.find_one({"restaurant_id":resturant_id}, {"_id": 0})
        for c in cat:
            print("c=",c)
        # print("cat",cat)
        item_name={}
        for r in res:
            item_name[ r["item_name"]]={
                    "price": r["price"],
                    "id": str(r["_id"]),   # convert ObjectId to string
                    "item_qty":r["item_qty"],
                    "sold":r["sold"],
                    "sub_id":r["sub_id"],
                    "desc":r["desc"],
                    "unit":r["unit"],
                    "lowat":r["lowat"],
                    "available":r["available"],
                    "file_url":r["file_url"]
                }
        return ({"item_name":item_name,"categories":cat})
    else:
        res=resturants_items.find({"resturant_id":resturant_id})
        item_name={}
        for r in res:
            item_name[ r["item_name"]]={
                    "price": r["price"],
                    "id": str(r["_id"]),
                    "file_url":r["file_url"]
                }
        return ({"item_name":item_name})
def update_resturant_item(item_id,name,price,unit,lowAt,desc,subId,stock,available):
    resturants_items.find_one_and_update({"_id":ObjectId(item_id)},{"$set":
                                                                    {"item_name":name,
                                                                     "price":int(price),
                                                                     "unit":unit,"lowAt":lowAt,
                                                                     "desc":desc,
                                                                     "subId":subId,
                                                                     "stock":stock,
                                                                     "available":available}})
# def list_resturants(long,latt):
#     restaurants = restaurants_name.find({
#         "location": {
#             "$near": {
#                 "$geometry": {
#                     "type": "Point",
#                     "coordinates": [long,latt]
#                 },
#                 "$maxDistance": 1000
#             }
#         }
#     })
#     res_names={}
#     for r in restaurants:
#         print(r["name"])
#         res_names[r["name"]]=str(r["_id"])
#         # res_names.append(r["name"])
#     return res_names
def list_resturants(long,latt,dist:int=5):
    restaurants = restaurants_name.find({
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [long,latt]
                },
                "$maxDistance": dist*1000
            }
        }
    })
    res_names={}
    for r in restaurants:
        print(r["name"])
        res_names[r["name"]]={"res_id":str(r["_id"]),"address":r["address"],"file_url":r["file_url"]}
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
def normalize_cart(items):
    print("items in normalize",items)
    normalized = {}

    for res_id, data in items.items():
        res_name = data.get("name", "unknown")

        # If items is already dict → OK
        if isinstance(data["items"], dict):
            normalized[res_id] = data

        # If items is list → convert to dict
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
        
        if not orders.find_one({"token": token}):
            return token
def store_orders(userid):
    token = generate_token()
    # order_id = "ORD_" + str(int(datetime.utcnow().timestamp()))

    # ✅ 1. Insert into user_orders
    items = get_cart(userid)
    print("items=",items)
    if(items==None):
        return 404
    # ✅ normalize structure
    # items = normalize_cart(items)

    # ✅ 2. Prepare seller_orders
    seller_docs = []
    res_ids=[]
    seller_inventory=[]
    current_time=datetime.utcnow()
    print("items in store_orders",items["cart"])
    cart=items["cart"]
    print("cart=",cart)
    for res_id, data in cart.items():
        # print(res_id,data)
        print(res_id,data)
        seller_doc = {
            # "order_id": order_id,
            "user_id": userid,
            "token_no":token,
            "restaurant_id": res_id,
            "restaurant_name": data["name"],

            "items": data["items"],

            "status": "placed",
            "time": current_time
        }
        res_ids.append(res_id)
        for item_id,item in data["items"].items():
            print(item)
            seller_inventory.append(
                UpdateOne(
                    {
                        "_id": ObjectId(item_id)
                        # "restaurant_id": res_id   # ✅ safer
                    },
                    {
                        "$inc": {"sold": item["qty"]}
                    }
                )
            )


        seller_docs.append(seller_doc)

    # ✅ 3. Insert all at once (FAST)
    # if seller_docs:
    #     seller_orders.insert_many(seller_docs)
    # if seller_inventory:
    #     resturants_items.bulk_write(seller_inventory)
    with client.start_session() as session:
        with session.start_transaction():

            result=orders.insert_one({"user_id":userid,"token_no":token,"status":"placed","items":items,"time":current_time}, session=session)
            parent_id = result.inserted_id 

            # 3. Add that parent_id to every seller doc before inserting
            for doc in seller_docs:
                doc["parent_order_id"] = str(parent_id)
            if seller_docs:
                seller_orders.insert_many(seller_docs, session=session)

            if seller_inventory:
                resturants_items.bulk_write(seller_inventory, session=session)
    delete_cart(userid)
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
            "status":order["status"],
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
def create_new_user(email,username, password,role):
    print("in create user")
    if(role=="seller"):
        owner=owners.find_one({"email":email})
        if owner is None:
            result =owners.insert_one({
                    "email": email,
                    "username":username,
                    "password": password,
                    "role":role,
                    "is_setup":False,
                    "is_verified":False
                })
            return ({"success":True,"id":str(result.inserted_id)})
        else:
            print(owner)
            return ({"success":False})
    else:
        user = users.find_one({"email": email})
        if user is None:
            result =users.insert_one({
                    "email": email,
                    "username":username,
                    "password": password,
                    "role":role,
                    "is_verified":False
                })
            return ({"success":True,"id":str(result.inserted_id)})
        else:
            return ({"success":False})
    # return({"success":False})
def check_existing_user(email,password):
    print("in existing user")
    user=users.find_one({"email":email})
    print(user)
    if(user): 
        print("in existing user if block",password)
        if(user["password"]==password):
            if(user["role"]=="seller"):
                return ({"success":True,"userid":str(user["_id"]),"username":user["username"],"is_verified":user["is_verified"],"is_setup":user["is_setup"]})
            else:
                print("in existing user if if block")
                return ({"success":True,"userid":str(user["_id"]),"username":user["username"],"is_verified":user["is_verified"]})
        else:
            return {"success":False}
    else: return {"success":404}
def check_existing_owner(email,password):
    print("in existing user")
    owner=owners.find_one({"email":email})
    if(owner): 
        print("in existing user if block",password)
        if(owner["password"]==password):
            if(owner["is_verified"]):
                print("in existing user if if block")
                return ({"success":True,"res_id":owner["resturant_id"],"resturant_name":owner["restaurant_name"],"is_verified":owner["is_verified"],"is_setup":owner["is_setup"]})
            else:
                return ({"success":True,"user_id":str(owner["_id"]),"username":owner["username"],"is_verified":owner["is_verified"],"is_setup":owner["is_setup"]})
        else:
            return {"success":False}
    else: return {"success":404}
# def update_order_status_seller(order_id,status,userid):
#     with client.start_session() as session:
#         with session.start_transaction():
#             seller_orders.find_one_and_update({"_id":ObjectId(order_id)},{"$set":{"status":status}},session=session)
#             orders.find_one_and_update({"user_id":userid},{"$set":{"status":status}},session=session)
def update_order_status_seller(order_id,status,userid):
    with client.start_session() as session:
        with session.start_transaction():
            updated_seller_doc = seller_orders.find_one_and_update(
                {"_id": ObjectId(order_id)},
                {"$set": {"status": status}},
                session=session,
                return_document=ReturnDocument.AFTER 
            )

            if updated_seller_doc:
                # 2. Grab that parent_id you stored earlier
                parent_id = updated_seller_doc.get("parent_order_id")

                # 3. Update the Main Order using that specific ID
                if parent_id:
                    orders.find_one_and_update(
                        {
                            "_id": ObjectId(parent_id), 
                            "user_id": userid
                        },
                        {"$set": {"status": status}},
                        session=session
                    )
def update_order_status_user(order_id,status,use):
    with client.start_session() as session:
        with session.start_transaction():

            
            orders.find_one_and_update({"_id":ObjectId(order_id)},{"$set":{"status":status}},session=session)
            seller_orders.update_many({"parent_order_id":order_id},{"$set":{"status":status}},session=session)
def resturant_stats(res_id):
    seller_order_stats=seller_orders.find({"restaurant_id":res_id})
    Total_orders=0
    pending=0
    completed=0
    canceled=0
    for order in seller_order_stats:
        if(order["status"]=="placed"):
            Total_orders+=1
            pending+=1
        elif(order["status"]=="completed"):
            completed+=1
            Total_orders+=1
        else:
            Total_orders+=1
            canceled+=1
    stats={
        "Total_orders":Total_orders,
        "completed":completed,
        "canceled":canceled,
        "pending":pending
    }
    return stats
from pymongo import ReturnDocument

from pymongo import ReturnDocument

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
def return_res_analytics(res_id):
    # seller_orders.find({"restaurant_id":res_id})
    resturants_itemsss=resturants_items.find({"resturant_id":res_id})
    print(resturants_itemsss)
    data=[]
    print(res_id)
    for items in resturants_itemsss:
        print("items=",items)
        itemss = {
        "item_name": items.get("item_name"),
        "initial_qty": items.get("item_qty", 0),
        "sold": items.get("sold", 0),
        "remaining": items.get("item_qty", 0)
    }
        print(itemss)
        data.append(itemss)
        print(data)
    print("data in res_analytics",data)
    return data

# get_orders("69a959defa10620eb63cf31d")
def save_address(address,type,uid,cordinates):
    user=users.find_one(ObjectId(uid))
    if user :
        result = users.update_one(
        {"_id": ObjectId(uid)},
        {
            "$push": {
                "addresses": {
                    "address": address,
                    "adrs_type": type,
                    "coordinates": cordinates
                }
            }
        }
    )
        return ({"success":True})
    else:
        return ({"success":False})
    
def fetch_address(uid):
    user=users.find_one(ObjectId(uid))

    if(user):
        # print("addd",user["addresses"])
        if "addresses" in user:
            return {"success":True,"address":user["addresses"]}
        else:
            return {"success":False,"address":"not_found"}
    else:
        return {"success":False}

def set_verified(email,role):
    if(role=="user"):
        users.find_one_and_update({"email":email},{"$set":{"is_verified":True}})
    else:
        owners.find_one_and_update({"email":email},{"$set":{"is_verified":True}})

from pymongo import ReturnDocument

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
            first_sub_id = doc.get("next_subcat_id", 0)+1

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

        return {"success": True,"category_data": category_data}

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }