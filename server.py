from database import add_resturant_items,add_resturants,list_resturant_items,list_resturants,add_customer_items,update_resturant_item,remove_itemss,store_orders,get_orders,store_seller_orders,get_seller_ordes,check_existing_user,create_new_user,update_order_status_seller,update_order_status_user,resturant_stats,return_res_analytics
from flask import Flask,request,render_template
from flask_socketio import SocketIO, emit,join_room
from redis_db import add_cart,get_cart,update_cart_qty
app=Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# @app.route("/", methods=["GET", "POST"])
# def home():
#     return render_template('home.html')
@app.route("/user/<userid>", methods=["GET", "POST"])
def home(userid):
    try:
        return render_template('home.html')
    except:
        return({"success":False})

@app.post("/add_res_items")
def add_itemss():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        itm_name=data["itm_name"]
        itm_qty=data["itm_qty"]
        price=data["price"]
        # print(res_id,itm)
        add_resturant_items(res_id,itm_name,itm_qty,price)
        return ({"success":True})
    except:
        return({"success":False})

@app.post("/add_resturant")
def add_resturant():
    try:
        data=request.get_json()
        name=data["name"]
        address=data["address"]
        phone=data["phone"]
        latt = round(float(data["lat"]), 4)
        long = round(float(data["lng"]), 4)
        owner_id=data["owner_id"]
        id=add_resturants(name,address,phone,owner_id,long,latt)
        return ({"success":True,"res_id":id})
    except:
        return({"success":False})
@app.post("/remove_items")
def remove_item():
    try:
        data=request.get_json()
        item_id=data["item_id"]
        remove_itemss(item_id)
        return({"success":True})
    except:
        return({"success":False})

@app.post("/list_resturants")
def list_resturantss():
    try:
        data=request.get_json()
        latt=data["latt"]
        long=data["long"]
        res=list_resturants(long,latt)
        return ({"success":True,"results":res})
    except:
        return({"success":False})

@app.post("/list_items")
def list_item():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        res=list_resturant_items(res_id)
        return ({"success":True,"res":res})
    except:
        return({"success":False})
@app.post("/update_item_details")
def update_items():
    try:
        data=request.get_json()
        print("data==",data)
        item_id=data["item_id"]
        item_name=data["name"]
        item_price=data["price"]
        update_resturant_item(item_id,item_name,item_price)
        return ({"success":True})
    except:
        return({"success":False})
@app.post("/add_item_carts")
def carts():
    try:
        data=request.get_json()
        itm_name=data["itm_name"]
        itm_id=data["itm_id"]
        res_id=data["res_id"]
        add_customer_items(itm_name,res_id,itm_id)
        return({"success":True})
    except:
        return({"success":False})

@app.get("/menu/<name>/<address>/<res_id>")
def list_items(name,address,res_id):
    try:
        # data=request.get_json()
        # res_id=data["res_id"]
        # res=list_resturant_items(res_id)
        # return ({"success":True,"res":res})
        return render_template("menu.html")
    except:
        return({"success":False})

@app.get("/cart/<userid>")
def cartss(userid):
    try:
        return render_template("cart.html")
    except:
        return({"success":False})
@app.post("/get_cart_items")
def list_cart_items():
    try:
        data=request.get_json()
        userid=data["userid"]
        res=get_cart(userid)
        return ({"success":True,"results":res})
    except:
        return({"success":False})
@app.post("/add_to_cart")
def addToCart():
    try:
        data=request.get_json()
        userid=data["userid"]
        resid=data["resid"]
        name=data["item"]
        qty=data["qty"]
        item_id=data["item_id"]
        res_name=data["ress_name"]
        price=data["price"]
        add_cart(resid,userid,name,res_name,item_id,qty,price)
        return({"success":True})
    except:
        return({"success":False})
@app.get("/seller/menu/<name>/<seller_id>")
def seller_page(name,seller_id):
    try:
        return render_template("seller_items.html")
    except:
        return({"success":False})
@app.post("/store_orders")
def store_order():
    try:
        data=request.get_json()
        user_id=data["user_id"]
        items=data["items"]
        resids=store_orders(user_id,items)
        for resid in resids:
            socketio.emit("new_order", {"msg": "refresh"}, room=resid)
        return ({"success":True})
    except:
        return({"success":False})
@app.get("/orders/<userid>")
def renderOrders(userid):
    try:
        return render_template("orders.html")
    except:
        return({"success":False})
@app.post("/get_orders/<userid>")
def getOrders(userid):
    try:
        orders=get_orders(userid)
        print("oorders in server",orders)
        return({"success":True,"orders":orders})
    except:
        return({"success":False})
@app.route("/seller/orders",methods=["POST","GET"])
def getsellerOrders():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        print(res_id)
        orders=get_seller_ordes(res_id)
        print("orders in server",orders)
        return({"success":True,"orders":orders})
    except:
        return({"success":False})
@app.post("/seller_orders")
def store_seller_orde():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        items=data["items"]
        user_id=data["user_id"]
        store_seller_orders(res_id,items,user_id)
        return({"success":True})
    except:
        return({"success":False})
@app.get("/seller/orders/<res_id>")
def renderSellerOrders(res_id):
    try:
        return render_template("seller_orders.html")
    except:
        return({"success":False})
@socketio.on('join_seller_room')
def handle_join(data):
    try:
        seller_id = data['seller_id']
        join_room(seller_id)
    except:
        return({"success":False})
def notify_new_order(seller_id, order):
    try:
        socketio.emit('new_order', order, room=seller_id)
    except:
        return({"success":False})
@socketio.on('join_user_room')
def handle_user_join(data):
    try:
        user_id = data['user_id']
        join_room(user_id)
        print(f"User joined: {user_id}")
    except:
        return({"success":False})
@socketio.on("order_completed")
def handle_order_completed(data):
    try:
        print("Order completed:", data)

        token_no = data.get("token_no")
        user_id=data.get("userid")
        order_id = data.get("order_id")
        res_id=data.get("res_id")
        status=data.get("status")

        # send update to USER
        socketio.emit(
            "order_status_updated",
            {
                "order_id": order_id,
                "token_no":token_no,
                "res_id":res_id,
                "status": status
            },
            room=user_id
        )
    except:
        return({"success":False})
@app.post("/validate_user")
def validate():
    try:
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
    except:
        return({"success":False})
@app.post("/signup_user")
def signup_user():
    try:
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
    except:
        return({"success":False})
@app.get("/seller/resturantSetup/<seller_id>")
def renderSetup(seller_id):
    try:
        return render_template("resturant_setup.html")
    except:
        return({"success":False})
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
@app.get("/seller/<name>/<seller_id>")
def sellerTemplate(name,seller_id):
    try:
        return render_template("seller.html")
    except:
        return({"success":False})
@app.get("/landing")
def renderLanding():
    try:
        return render_template("landing.html")
    except:
        return({"success":False})
@app.post("/update_order")
def update_status():
    try:
        data=request.get_json()
        order_id=data["order_id"]
        status=data["status"]
        userid=data["user_id"]
        update_order_status_seller(order_id,status,userid)
        return ({"success":True})
    except:
        return({"success":False})
@app.post("/update_order_user")
def update_status_user():
    try:
        data=request.get_json()
        order_id=data["order_id"]
        status=data["status"]
        userid=data["user_id"]
        update_order_status_user(order_id,status,userid)
        return ({"success":True})
    except:
        return({"success":False})
@app.post("/stats")
def returnstats():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        res=resturant_stats(res_id)
        return({"success":True,"stats":res})
    except:
        return({"success":False})
@app.get("/seller/analytics/<res_id>")
def render_analytics_template(res_id):
    try:
        print("seller_anlytics")
        return render_template("analytics.html")
    except:
        return({"success":False})
@app.post("/seller/analytics")
def return_seller_stats():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        stats=return_res_analytics(res_id)
        return({"success":True,"stats":stats})
    except:
        return({"success":False})
@app.post("/update_cart")
def update_cart():
    try:
        data=request.get_json()
        userid=data["user_id"]
        item_name=data["item_name"]
        qty=data["qty"]
        update_cart_qty(userid,item_name,qty)
        return ({"success":True})
    except:
        return({"success":False})
@socketio.on("user_cancelled_order")
def handle_user_cancel(data):
    try:
        # data['res_ids'] is now a LIST: ["res1", "res2"]
        res_list = data.get("res_ids", [])
        
        for res_id in res_list:
            emit("seller_order_cancelled", data, room=res_id)
    except:
        return({"success":False})
if __name__ == "__main__":
    socketio.run(app, debug=True)