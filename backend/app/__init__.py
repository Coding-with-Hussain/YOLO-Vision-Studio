"""YOLO Vision Studio backend."""

import os

# Ultralytics reads these at import time. Keep the backend self-contained:
# never let a checkpoint trigger automatic `pip install` calls, skip online
# checks/telemetry (the app never needs Ultralytics' downloads) and keep the
# library quiet in server logs. Export a different value to override.
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
os.environ.setdefault("YOLO_OFFLINE", "true")
os.environ.setdefault("YOLO_VERBOSE", "false")
