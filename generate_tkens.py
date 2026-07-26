from database import create_new_user
import jwt
from datetime import datetime,timedelta
li=[]
for i in range(51,1001):
    email=f"user{i}@gmail.com"
    password="sadistic123"
    res=create_new_user(email,"new",password,"user")
    print(res)
    userid=str(res["id"])
    username="new"
    print(userid)
    token = jwt.encode(
        {   
            "type":"user",
            "user_id": str(userid),
            "username":username,
            "exp": datetime.utcnow() + timedelta(days=7)
        },
        "bdanbfuwetwnnfju327832y8932uhjfhdj",
        algorithm="HS256"
    )
    li.append(token)
with open("tokens.py", "w", encoding="utf-8") as f:
    f.write("tokens = [\n")
    for token in li:
        f.write(f'    "{token}",\n')
    f.write("]\n")