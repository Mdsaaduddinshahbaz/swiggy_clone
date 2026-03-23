from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
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