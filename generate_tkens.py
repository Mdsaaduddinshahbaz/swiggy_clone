from database import create_new_driver, create_new_user
import jwt
from datetime import datetime,timedelta
li=[]
for i in range(1,1001):
    email=f"driver{i}@gmail.com"
    password="sadistic123"
    res=create_new_driver(email,"new",password,"driver")
    print(res)
    userid=str(res["id"])
    username="new"
    print(userid)
    token = jwt.encode(
        {   
            "type":"driver",
            "driver_id": str(userid),
            "username":username,
            "exp": datetime.utcnow() + timedelta(days=7)
        },
        "bdanbfuwetwnnfju327832y8932uhjfhdj",
        algorithm="HS256"
    )
    li.append(token)
with open("driver_tokens.py", "w", encoding="utf-8") as f:
    f.write("tokens = [\n")
    for token in li:
        f.write(f'    "{token}",\n')
    f.write("]\n")



    from database import seller_orders
orderIds=[]
orderIds = [str(doc["_id"]) for doc in seller_orders.find({})]

with open("orderIds.py", "w", encoding="utf-8") as f:
    f.write("orderIds = [\n")
    for order_id in orderIds:
        f.write(f'    "{order_id}",\n')
    f.write("]\n")



from redis_db import r
from orderIds import orderIds
import jwt,json
from driver_tokens import tokens
for i in range(len(tokens)):
    payload=jwt.decode(
        tokens[i],
        "bdanbfuwetwnnfju327832y8932uhjfhdj",
        algorithms="HS256"
    )
    driver_id= payload["driver_id"]
    order_id=orderIds[i]
    request_data = {
        "order_id": order_id,
        "driver_id": driver_id,
        "warehouse_km": 1.0,
        "customer_km": 2.0,
        "base_pay": 20,
        "pickup_rate": 3,
        "delivery_rate": 8,
        "amount": 39.0,
        "customer_name": "load_test",
        "warehouse_lng": 78.4,
        "warehouse_lat": 17.4,
        "customer_lng": 78.41,
        "customer_lat": 17.41,
        "status": "pending"
    }

    r.set(
        f"order_request:{order_id}:{driver_id}",
        json.dumps(request_data),
        ex=7200
    )
print(f"Seeded {len(tokens)} order requests")