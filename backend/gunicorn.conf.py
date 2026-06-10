import os

workers = int(os.environ.get("WEB_CONCURRENCY", "4"))
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:8000"
preload_app = True
timeout = 120
keepalive = 5
max_requests = 500
max_requests_jitter = 50


def post_fork(server, worker):
    from core.database import engine
    engine.dispose(close=False)
