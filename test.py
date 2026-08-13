from redis_db import search_driver

result = search_driver.delay({"lat":  
17.388879, "lng": 78.428223},"saad",{"long":78.470354,"latt":17.452852},"6a6f3511d9808c816b5d9930")

print("Task ID:", result.id)

# #"celery -A redis_db.celery worker --loglevel=info --pool=solo"

# from database import accept_delivery_order

# accept_delivery_order("6a6f3511d9808c816b5d9930","6a7b39442f2f1da998fb0928",{"amount":10})

