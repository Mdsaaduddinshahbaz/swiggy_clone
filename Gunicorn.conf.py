# Run with:   gunicorn -c gunicorn.conf.py server:app
# (replace "server" with your file name, without .py)
#
# Do NOT use --preload: PyMongo / Redis clients must be created per worker.
import os

bind = "0.0.0.0:5000"
worker_class = "gthread"

# CPU-bound parts (JSON, JWT, Lua call overhead) scale with workers, Mongo waits scale with threads.
# Start at "number of physical cores" and benchmark; leave a core free if k6/Redis share the box.
workers = int(os.getenv("WEB_CONCURRENCY", "8"))
threads = int(os.getenv("WEB_THREADS", "8"))

backlog = 2048          # queue for connection bursts
keepalive = 5           # reuse client connections
timeout = 60
graceful_timeout = 30

max_requests = 20000    # recycle workers occasionally (guards against slow leaks)
max_requests_jitter = 2000

accesslog = None        # no per-request log lines on the hot path
errorlog = "-"
loglevel = "warning"