"""Inference device discovery and resolution."""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.errors import DeviceUnavailable
from app.schemas.health import DeviceInfo

logger = logging.getLogger(__name__)


@lru_cache
def _probe() -> tuple[bool, bool, tuple[str, ...]]:
    try:
        import torch
    except Exception:  # noqa: BLE001
        return False, False, ()
    cuda = False
    names: tuple[str, ...] = ()
    try:
        cuda = bool(torch.cuda.is_available())
        if cuda:
            names = tuple(torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count()))
    except Exception as exc:  # noqa: BLE001 - broken drivers should not crash the app
        logger.warning("CUDA probe failed: %s", exc)
        cuda = False
    mps = False
    try:
        mps = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    except Exception:  # noqa: BLE001
        mps = False
    return cuda, mps, names


class DeviceManager:
    def __init__(self, allow_cuda: bool = True) -> None:
        self.allow_cuda = allow_cuda

    @property
    def cuda_available(self) -> bool:
        return self.allow_cuda and _probe()[0]

    @property
    def mps_available(self) -> bool:
        return _probe()[1]

    def devices(self) -> list[DeviceInfo]:
        result = [DeviceInfo(id="cpu", name="CPU", type="cpu")]
        if self.cuda_available:
            for index, name in enumerate(_probe()[2]):
                result.append(DeviceInfo(id=f"cuda:{index}", name=name, type="cuda"))
        if self.mps_available:
            result.append(DeviceInfo(id="mps", name="Apple Metal (MPS)", type="mps"))
        return result

    def default_device(self) -> str:
        if self.cuda_available:
            return "cuda:0"
        return "cpu"

    def resolve(self, preference: str | None) -> str:
        """Translate a user preference (auto/cpu/cuda/mps) into a torch device string."""
        pref = (preference or "auto").lower()
        if pref == "auto":
            return self.default_device()
        if pref == "cpu":
            return "cpu"
        if pref.startswith("cuda"):
            if not self.cuda_available:
                raise DeviceUnavailable(
                    "CUDA was requested but no CUDA-capable GPU is available to the backend. "
                    "Select CPU or Auto, or install a CUDA build of PyTorch.",
                    details={"requested": preference},
                )
            return "cuda:0" if pref == "cuda" else pref
        if pref == "mps":
            if not self.mps_available:
                raise DeviceUnavailable(
                    "Apple MPS was requested but is not available on this machine.",
                    details={"requested": preference},
                )
            return "mps"
        raise DeviceUnavailable(f"Unknown device '{preference}'.", details={"requested": preference})
