from fastapi import APIRouter

from routers import admin, agent, analytics, applications, auth, contact, documents, farms, forum, market, support, tasks, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(farms.router)
api_router.include_router(tasks.router)
api_router.include_router(documents.router)
api_router.include_router(agent.router)
api_router.include_router(contact.router)
api_router.include_router(auth.router)
api_router.include_router(forum.router)
api_router.include_router(market.router)
api_router.include_router(applications.router)
api_router.include_router(support.router)
api_router.include_router(admin.router)
api_router.include_router(users.router)
api_router.include_router(analytics.router)
