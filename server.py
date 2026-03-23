from database import add_resturant_items,add_resturants,list_resturant_items,list_resturants,add_customer_items,update_resturant_item,remove_itemss
from flask import Flask,request,render_template
from redis_db import add_cart,get_cart
app=Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def home():
    return render_template('home.html')

@app.post("/add_res_items")
def add_itemss():
    data=request.get_json()
    res_id=data["res_id"]
    itm_name=data["itm_name"]
    itm_qty=data["itm_qty"]
    price=data["price"]
    # print(res_id,itm)
    add_resturant_items(res_id,itm_name,itm_qty,price)
    return ({"success":True})

@app.post("/add_resturant")
def add_resturant():
    data=request.get_json()
    name=data["name"]
    latt=data["latt"]
    long=data["long"]
    add_resturants(name,long,latt)
    return ({"success":True})
@app.post("/remove_items")
def remove_item():
    data=request.get_json()
    item_id=data["item_id"]
    remove_itemss(item_id)
    return({"success":True})

@app.post("/list_resturants")
def list_resturantss():
    data=request.get_json()
    latt=data["latt"]
    long=data["long"]
    res=list_resturants(long,latt)
    return ({"success":True,"results":res})

@app.post("/list_items")
def list_item():
    data=request.get_json()
    res_id=data["res_id"]
    res=list_resturant_items(res_id)
    return ({"success":True,"res":res})
@app.post("/update_item_details")
def update_items():
    data=request.get_json()
    print("data==",data)
    item_id=data["item_id"]
    item_name=data["name"]
    item_price=data["price"]
    update_resturant_item(item_id,item_name,item_price)
    return ({"success":True})
@app.post("/add_item_carts")
def carts():
    data=request.get_json()
    itm_name=data["itm_name"]
    itm_id=data["itm_id"]
    res_id=data["res_id"]
    add_customer_items(itm_name,res_id,itm_id)
    return({"success":True})

@app.get("/menu/<name>/<res_id>")
def list_items(name,res_id):
    # data=request.get_json()
    # res_id=data["res_id"]
    # res=list_resturant_items(res_id)
    # return ({"success":True,"res":res})
    return render_template("menu.html")

@app.get("/cart/<userid>")
def cartss(userid):
    return render_template("cart.html")
@app.post("/get_cart_items")
def list_cart_items():
    data=request.get_json()
    userid=data["userid"]
    res=get_cart(userid)
    return ({"success":True,"results":res})
@app.post("/add_to_cart")
def addToCart():
    data=request.get_json()
    userid=data["userid"]
    name=data["item"]
    qty=data["qty"]
    res_name=data["ress_name"]
    price=data["price"]
    add_cart(userid,name,res_name,qty,price)
    return({"success":True})
@app.get("/seller_items")
def seller_page():
    return render_template("seller_items.html")
if __name__=="__main__":
    app.run(debug=True)