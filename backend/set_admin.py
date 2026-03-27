import asyncio
import sys
import os

# Add the current directory to sys.path to make imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import db
from app.models.user import User, UserRole

async def set_admin(email: str):
    print(f"Connecting to database...")
    await db.connect()
    
    print(f"Looking for user {email}...")
    user = await User.find_one(User.email == email)
    
    if not user:
        print(f"User with email {email} not found.")
        await db.disconnect()
        return
    
    print(f"Found user: {user.name} ({user.id})")
    print(f"Current role: {user.role}")
    
    if user.role == UserRole.ADMIN:
        print("User is already an admin.")
    else:
        user.role = UserRole.ADMIN
        await user.save()
        print(f"User role updated to {UserRole.ADMIN}.")
        
    await db.disconnect()
    print("Done.")

if __name__ == "__main__":
    email = "ujwalv098@gmail.com"
    asyncio.run(set_admin(email))
