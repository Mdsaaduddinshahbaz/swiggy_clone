from database import save_category,add_subcategory,add_resturant_items,check_existing_owner,set_verified,fetch_address,add_resturants,list_resturant_items,list_resturants,add_customer_items,update_resturant_item,remove_itemss,store_orders,get_orders,store_seller_orders,get_seller_ordes,check_existing_user,create_new_user,update_order_status_seller,update_order_status_user,resturant_stats,return_res_analytics,check_existing_owner,save_address
from flask import Flask,request,render_template,redirect,url_for,jsonify,g
from flask_socketio import SocketIO, emit,join_room
from redis_db import add_cart,get_cart,update_cart_qty
from flask_cors import CORS
from flask_mail import Mail
from dotenv import load_dotenv
from itsdangerous import URLSafeTimedSerializer
# from verify import upload_image
from verifpy1 import upload_image
from functools import wraps
import jwt
from datetime import datetime,timedelta
import requests
import os
load_dotenv(override=True)
mail_sever_name=os.getenv("Mail_server")
mail_port=int(os.getenv("Mail_port"))
mail_use_tls = os.getenv("Mail_use_tls", "False").lower() == "true"
mail_use_ssl = os.getenv("Mail_use_ssl", "True").lower() == "true"
mail_username=os.getenv("Mail")
mail_password=os.getenv("Mail_password")
secret_key=os.getenv("Mail_secret_key")
brevo_api=os.getenv("brevo_api_email")
app=Flask(__name__)
CORS(app)

app.config["MAIL_SERVER"] = mail_sever_name
app.config["MAIL_PORT"] = mail_port
app.config["MAIL_USE_TLS"] = mail_use_tls
app.config["MAIL_USE_SSL"]=mail_use_ssl
app.config["MAIL_USERNAME"] = mail_username
app.config["MAIL_PASSWORD"] = mail_password
app.config["SECRET_KEY"]=secret_key

print("SERVER:", mail_sever_name, flush=True)
print("PORT:", mail_port, flush=True)
print("TLS:", mail_use_tls, flush=True)
print("SSL:", mail_use_ssl, flush=True)
print("USER:", mail_username, flush=True)
print("PASS EXISTS:", bool(mail_password), flush=True)

brevo_api=os.getenv("brevo_api_email")
socketio = SocketIO(app, cors_allowed_origins="*")
# mail=Mail(app)


from itsdangerous import URLSafeTimedSerializer

serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # token = request.cookies.get("token")
        token = (
            request.cookies.get("user_token") or
            request.cookies.get("seller_token")
        )
        if not token:
            return jsonify({"success": False}), 401

        try:
            payload = jwt.decode(
                token,
                app.config["SECRET_KEY"],
                algorithms=["HS256"]
            )
            print(payload)
            g.type = payload["type"]
            if(g.type == "user"):
                g.user_id = payload["user_id"]
            elif(g.type == "seller"):
                g.res_id=payload["res_id"]

        except jwt.InvalidTokenError:
            return jsonify({"success": False}), 401

        return f(*args, **kwargs)

    return wrapper
def generate_verification_token(email,role):
    return serializer.dumps({
            "email": email,
            "role": role
        }, salt="email-verification")

def send_verification_email(user_email,role):
    print("in send varification")
    print("generating token")
    token = generate_verification_token(user_email,role)
    print("verify url")
    verify_url = url_for(
        "verify_email",
        token=token,
        _external=True
    )
    print("msg")
    # msg = Message(
    #     subject="Verify Your Email",
    #     sender=app.config["MAIL_USERNAME"],
    #     recipients=[user_email]
    # )

    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "api-key": brevo_api,
            "content-type": "application/json"
        },
        json={
            "sender": {"email": "dummy.mail.saad@gmail.com"},
            "to": [{"email": user_email}],
            "subject": "Verify Email",
            "htmlContent": f"""
            <p>Click below to verify:</p>
            <a href="{verify_url}">{verify_url}</a>
            """
        }
    )
    print(response.status_code,flush=True)
    print(response.text,flush=True)
    if(response.status_code==201):
        print("done sending email")
        return 1
    else:
        return 0


# print("Email sent")

@app.route("/", methods=["GET", "POST"])
def land():
    return redirect(url_for('renderLanding'))
import os
from flask import send_from_directory

@app.route("/.well-known/assetlinks.json", methods=["GET"])
def serve_asset_links_file():
    # Assumes your assetlinks.json file is inside your 'static' folder
    static_file_dir = os.path.join(app.root_path, 'static')
    return send_from_directory(static_file_dir, 'assetlinks.json', mimetype='application/json')
@app.route("/user/<userid>", methods=["GET", "POST"])
def home(userid):
    try:
        return render_template('home.html')
    except:
        return({"success":False})

# @app.post("/add_res_items")
# def add_itemss():
#     try:
#         data=request.get_json()
#         res_id=data["res_id"]
#         itm_name=data["itm_name"]
#         itm_qty=data["itm_qty"]
#         price=data["price"]
#         sub_id=data["sub_id"]
#         desc=data["description"]
#         unit=data["unit"]
#         lowat=data["lowAt"]
#         available=data["available"]

#         # print(res_id,itm)
#         res=add_resturant_items(res_id,itm_name,itm_qty,price,sub_id,desc,unit,lowat,available)
#         return ({"success":True,"id":res})
#     except:
#         return({"success":False})
@app.post("/add_res_items")
def add_itemss():
    try:
        itm_name = request.form.get("itm_name")
        res_id = request.form.get("res_id")
        itm_qty = request.form.get("itm_qty")
        price = request.form.get("price")
        sub_id = request.form.get("sub_id")
        desc = request.form.get("desc")
        unit = request.form.get("unit")
        lowat = request.form.get("lowat")
        available=request.form.get("available")
        photo = request.files.get("photo")
        if (photo):
            file_id=upload_image(photo)
            print(file_id)
            res=add_resturant_items(res_id,itm_name,itm_qty,price,sub_id,desc,unit,lowat,available,file_id)
            return ({"success":True,"id":res["id"],"img_url":res["url"]})
        else:
            res=add_resturant_items(res_id,itm_name,itm_qty,price,sub_id,desc,unit,lowat,available)
            return ({"success":True,"id":res["id"],"img_url":res["url"]})
        # print(res_id,itm)
        # res=add_resturant_items(res_id,itm_name,itm_qty,price,sub_id,desc,unit,lowat,available)
        # return ({"success":True,"id":res})
    except: 
        return({"success":False})

@app.post("/add_resturant")
def add_resturant():
    try:
        name = request.form.get("name")
        address = request.form.get("address")
        phone = request.form.get("phone")
        latt = round(float(request.form.get("lat")),4)
        long = round(float(request.form.get("lng")),4)
        owner_id = request.form.get("owner_id")
        photo = request.files.get("photo")
        if (photo):
            file_id=upload_image(photo)
            print(file_id)
            id=add_resturants(name,address,phone,owner_id,long,latt,file_id)
            return ({"success":True,"res_id":id})
        else:
            id=add_resturants(name,address,phone,owner_id,long,latt)
            return ({"success":True,"res_id":id})
    except Exception as e:
        print(e)
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
        dist=data["dist"]
        dist=int(dist)
        res=list_resturants(long,latt,dist)
        return ({"success":True,"results":res})
    except:
        return({"success":False})
@app.post("/list_items")
@login_required
def list_item():
    data=request.get_json()
    types=g.type
    if(types=="seller"):
        res_id=g.res_id
    else:
        res_id=data["res_id"]
    res=list_resturant_items(res_id,types)
    if(types=="seller"):
        return ({"success":True,"res":res["item_name"],"categories":res["categories"]})
    else:
        return ({"success":True,"res":res["item_name"]})
    # try:
    # except Exception as e:
    #     print(e)
    #     return({"success":False})
@app.post("/update_item_details")
def update_items():
    try:
        data=request.get_json()
        print("data==",data)
        item_id=data["item_id"]
        item_name=data["name"]
        item_price=data["price"]
        unit=data["unit"]
        lowAt=data["lowAt"]
        desc=data["desc"]
        subId=data["subId"]
        stock=data["stock"],
        available=data["available"]
        update_resturant_item(item_id,item_name,item_price,unit,lowAt,desc,subId,stock,available)
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

@app.get("/menu/<name>/<address>/<res_id>/<user_id>")
def list_items(name,address,res_id,user_id):
    try:
        # data=request.get_json()
        # res_id=data["res_id"]
        # res=list_resturant_items(res_id)
        # return ({"success":True,"res":res})
        return render_template("menu.html")
    except:
        return({"success":False})
@app.get("/menu/sel/<id>")
def s_me(id):
    print("running s_me")
    try:
        return render_template("menu_seller.html")
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
@login_required
def addToCart():
    try:
        print("in addTOCart")
        print("userid in add to cart",g.__dict__)
        data=request.get_json()
        
        userid=data["userid"]
        resid=data["resid"]
        name=data["item"]
        qty=data["qty"]
        item_id=data["item_id"]
        res_name=data["ress_name"]
        price=data["price"]
        res=add_cart(resid,userid,name,res_name,item_id,qty,price)
        if(res["success"]):
            return({"success":True,"Total":res["total"]})
    except Exception as e:
        return({"success":False ,"error":str(e)})
@app.get("/seller/menu/<name>/<seller_id>")
def seller_page(name,seller_id):
    try:
        return render_template("menu_seller.html")
    except:
        return({"success":False})
@app.post("/store_orders")
@login_required
def store_order():
    try:
        data=request.get_json()
        user_id=g.user_id
        resids=store_orders(user_id)
        if(resids==404):
            return({"success":False})
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
@login_required
def getOrders(userid):
    try:
        userid=g.user_id
        orders=get_orders(userid)
        print("oorders in server",orders)
        return({"success":True,"orders":orders})
    except:
        return({"success":False})
@app.route("/seller/orders",methods=["POST","GET"])
@login_required
def getsellerOrders():
    try:
        data=request.get_json()
        res_id=data["res_id"]
        res_id=g.res_id
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
            if(res["is_verified"]): 
                userid=str(res["userid"])
                username=res["username"]
                print(userid)
                token = jwt.encode(
                    {   
                        "type":"user",
                        "user_id": str(userid),
                        "username":username,
                        "exp": datetime.utcnow() + timedelta(days=7)
                    },
                    app.config["SECRET_KEY"],
                    algorithm="HS256"
                )
                response=jsonify({"success":True,"user_id":userid,"username":username})
                response.delete_cookie("seller_token")
                response.set_cookie(
                    "user_token",
                    token,
                    httponly=True,
                    secure=False,      # True in production with HTTPS
                    samesite="Lax",
                    max_age=7 * 24 * 60 * 60
                )
                return response
            else:
                res_email=send_verification_email(data["email"],"user")
                if(res_email == 1): return({"success":False,"msg":"Not_verified"})
                else: return ({"success":False,"msg":"Internal Server occured Please Try Again"})
        else: return({"success":False,"msg":"Not_found"})
    except:
        return({"success":False})
@app.post("/validate_owner")
def validate_owner():
    try:
        data=request.get_json()
        if not data:
            return ({"success":False})
        print("data in login",data)
        res=check_existing_owner(data["email"],data["password"])
        print("res",res)
        if(res["success"]==False): return({"success":False})
        elif(res["success"]==True):
            if(res["is_verified"]): 
                res_id=str(res["res_id"])
                res_name=res["resturant_name"]
                is_setup=res["is_setup"]
                token = jwt.encode(
                    {
                        "type":"seller",
                        "res_id": str(res_id),
                        "res_name":res_name,
                        "exp": datetime.utcnow() + timedelta(days=7)
                    },
                    app.config["SECRET_KEY"],
                    algorithm="HS256"
                )
                response=jsonify({"success":True,"res_id":res_id,"res_name":res_name,"is_setup":is_setup})
                response.delete_cookie("user_token")
                response.set_cookie(
                    "seller_token",
                    token,
                    httponly=True,
                    secure=False,      # True in production with HTTPS
                    samesite="Lax",
                    max_age=7 * 24 * 60 * 60
                )
                return response
                # return ({"success":True,"user_id":userid,"username":username,"is_setup":is_setup})
            else:
                res_email=send_verification_email(data["email"],"owner")
                if(res_email==1): return({"success":False,"msg":"not_verified"})
                else: return({"success":False,"msg":"Internal Server occured Please Try again"})
        else: return({"success":False,"msg":"Not_found"})
    except Exception as e:
        print("in exception validate owner")
        print(e)
        return {"success": False}
@app.post("/signup_user")
def signup_user():
    try:
        # print(signup)
        data=request.get_json()
        print("data in signup",data)
        email=data["email"]
        username=data["username"]
        password=data["password"]
        role=data["role"]
        # print(email)
        print("mail sent",role)
        res=create_new_user(email,username,password,role)
        # if(verify)
        print(res)
        if(res["success"]):
            res_email=send_verification_email(email,role)
            if (res_email==1):return ({"success":True,"user_id":res["id"]})
            else: return({"success":False,"msg":"Internal Server Occured Please Try Again"})
        else:
            return ({"success":False,"msg":"user already exists!"})
    except :
        print("in exception signup user")
        return({"success":False,"msg":"Internal Error occured Please Try Again"})

@app.route("/verify/<token>")
def verify_email(token):
    try:
        data = serializer.loads(
        token,
        salt="email-verification",
        max_age=3600
    )
        email = data["email"]
        role = data["role"]
    except Exception:
        return "Invalid or expired link."

    userid=set_verified(email,role)

    return f"""
        <h1>Email verified successfully ✅</h1>
        <p>Redirecting to login page in 3 seconds...</p>

        <script>
        const role = "{role}";

        setTimeout(() => {{
            if(role === "user")
                window.location.href = "/login/user";
            else
                window.location.href = "/login/seller";
        }}, 3000);
        </script>
        """

@app.post("/save_subcategory")
def save_subcats():
    data=request.get_json()
    res_id=data["res_id"]
    cat_id=data["category_id"]
    subcat_name=data["name"]
    res=add_subcategory(res_id,cat_id,subcat_name)
    if(res["success"]):
        return {"success": True,"subcategory": res["subcategory"]}
    else:
        return {"success":False}
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
@login_required
def update_cart():
    try:
        data=request.get_json()
        # userid=data["user_id"]
        userid=g.user_id
        item_id=data["item_id"]
        qty=data["qty"]
        res=update_cart_qty(userid,item_id,qty)
        return ({"success":True,"total":res["total"]})
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
@app.post("/save_address")
def save_address_type():
    data=request.get_json()
    address=data["address"]
    types=data["address_type"]
    uid=data["userId"]
    cordinates=data["cordinates"]
    result=save_address(address,types,uid,cordinates)
    if(result["success"]):
        return ({"success":True})
    else:
        return ({"success":False})
@app.post("/fetch_address")
def fetch_addresss():
    data=request.get_json()
    uid=data["user_id"]
    address=fetch_address(uid)
    if(address["success"]):
        return({"success":True,"address":address["address"]})
    else:
        return({"success":False})
    
@app.post("/save_categories")
def sve_cate():
    data=request.get_json()
    res_id=data["res_id"]
    cat_name=data["cat_name"]
    sub_cats=data["subcats"]
    res=save_category(res_id,cat_name,sub_cats)
    if(res["success"]):
        print(res)
        return({"success":True,"category":res["category_data"]})
    else:
        print(res)
        return({"success":False,"error":res["error"]})
if __name__ == "__main__":
    socketio.run(app, debug=True)