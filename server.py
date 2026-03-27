from database import add_resturant_items,add_resturants,list_resturant_items,list_resturants,add_customer_items,update_resturant_item,remove_itemss,store_orders,get_orders,store_seller_orders,get_seller_ordes,check_existing_user,create_new_user
from flask import Flask,request,render_template
from flask_socketio import SocketIO, emit,join_room
from redis_db import add_cart,get_cart
app=Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# @app.route("/", methods=["GET", "POST"])
# def home():
#     return render_template('home.html')
@app.route("/user/<userid>", methods=["GET", "POST"])
def home(userid):
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
    address=data["address"]
    phone=data["phone"]
    latt = round(float(data["lat"]), 4)
    long = round(float(data["lng"]), 4)
    owner_id=data["owner_id"]
    id=add_resturants(name,long,latt)
    return ({"success":True,"res_id":id})
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
    resid=data["resid"]
    name=data["item"]
    qty=data["qty"]
    res_name=data["ress_name"]
    price=data["price"]
    add_cart(resid,userid,name,res_name,qty,price)
    return({"success":True})
@app.get("/seller/menu/<seller_id>")
def seller_page(seller_id):
    return render_template("seller_items.html")
@app.post("/store_orders")
def store_order():
    data=request.get_json()
    user_id=data["user_id"]
    items=data["items"]
    resids=store_orders(user_id,items)
    for resid in resids:
        socketio.emit("new_order", {"msg": "refresh"}, room=resid)
    return ({"success":True})
@app.get("/orders/<userid>")
def renderOrders(userid):
    return render_template("orders.html")
@app.post("/get_orders/<userid>")
def getOrders(userid):
    orders=get_orders(userid)
    print("oorders in server",orders)
    return({"success":True,"orders":orders})
@app.route("/seller/orders",methods=["POST","GET"])
def getsellerOrders():
    data=request.get_json()
    res_id=data["res_id"]
    print(res_id)
    orders=get_seller_ordes(res_id)
    print("orders in server",orders)
    return({"success":True,"orders":orders})
@app.post("/seller_orders")
def store_seller_orde():
    data=request.get_json()
    res_id=data["res_id"]
    items=data["items"]
    user_id=data["user_id"]
    store_seller_orders(res_id,items,user_id)
    return({"success":True})
@app.get("/seller/orders/<res_id>")
def renderSellerOrders(res_id):
    return render_template("seller_orders.html")
@socketio.on('join_seller_room')
def handle_join(data):
    seller_id = data['seller_id']
    join_room(seller_id)
def notify_new_order(seller_id, order):
    socketio.emit('new_order', order, room=seller_id)
@app.post("/validate_user")
def validate():
        data=request.get_json()
        if not data:
            return ({"success":False})
        print("data in login",data)
        res=check_existing_user(data["email"],data["password"])
        print("res",res)
        if(res["success"]==False): return({"success":False})
        elif(res["success"]==True): 
            userid=str(res["userid"])
            username=res["username"]
            print(userid)
            return ({"success":True,"user_id":userid,"username":username})
        else: return({"success":"Not_found"})
@app.post("/signup_user")
def signup_user():
        # print(signup)
        data=request.get_json()
        print("data in signup",data)
        email=data["email"]
        username=data["username"]
        password=data["password"]
        # print(email)
        res=create_new_user(email,username,password)
        print(res)
        if(res["success"]):
            return ({"success":True,"user_id":res["id"]})
        else:
            return ({"success":False})
@app.get("/seller/resturantSetup/<seller_id>")
def renderSetup(seller_id):
    return render_template("resturant_setup.html")
@app.route("/login/<role>")
def login(role):
    try:
        return render_template("auth.html")
    except:
        return({"success":False})
@app.route("/signup/<role>")
def signup(role):
    try:
        return render_template("signup.html")
    except:
        return({"success":False})
@app.get("/seller/<seller_id>")
def sellerTemplate(seller_id):
    return render_template("seller.html")
@app.get("/landing")
def renderLanding():
    return render_template("landing.html")
if __name__ == "__main__":
    socketio.run(app, debug=True)