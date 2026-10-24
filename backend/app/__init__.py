"""YOLO Vision Studio backend."""

import importlib.util
import os

# Ultralytics reads these at import time. Keep the backend self-contained:
# never let a checkpoint trigger automatic `pip install` calls, skip online
# checks/telemetry (the app never needs Ultralytics' downloads) and keep the
# library quiet in server logs. Export a different value to override.
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
os.environ.setdefault("YOLO_OFFLINE", "true")
os.environ.setdefault("YOLO_VERBOSE", "false")

# Fail fast with an actionable message instead of a deep ImportError.
_REQUIRED = {
    "fastapi": "fastapi",
    "pydantic_settings": "pydantic-settings",
    "multipart": "python-multipart",
    "numpy": "numpy",
    "cv2": "opencv-python",
    "PIL": "pillow",
    "torch": "torch",
    "ultralytics": "ultralytics",
}
_missing = [package for module, package in _REQUIRED.items() if importlib.util.find_spec(module) is None]
if _missing:
    raise RuntimeError(
        "YOLO Vision Studio is missing Python dependencies: "
        + ", ".join(_missing)
        + ". Activate the backend virtual environment and run: pip install -r requirements.txt "
        "(see README for PyTorch CPU/CUDA installation)."
    )
