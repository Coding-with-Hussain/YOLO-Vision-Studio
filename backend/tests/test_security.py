import os
import pickle

import pytest

from app.services.model_security import CheckpointRejected, scan_checkpoint
from tests.conftest import zipped_pickle


def _scan(tmp_path, payload: bytes):
    path = tmp_path / "candidate.pt"
    path.write_bytes(zipped_pickle(payload))
    return scan_checkpoint(path)


def test_real_checkpoint_passes(tiny_model_path):
    report = scan_checkpoint(tiny_model_path)
    assert any("DetectionModel" in g for g in report.globals)


class _Evil:
    def __reduce__(self):
        return (os.system, ("echo pwned",))


@pytest.mark.parametrize("protocol", [2, 4])
def test_os_system_is_rejected(tmp_path, protocol):
    with pytest.raises(CheckpointRejected) as exc:
        _scan(tmp_path, pickle.dumps({"model": _Evil()}, protocol=protocol))
    assert exc.value.reason == "unsafe_globals"
    assert any("system" in g for g in exc.value.offending)


@pytest.mark.parametrize(
    "payload, reason",
    [
        # getattr(os, "system")
        (b"\x80\x02c__builtin__\ngetattr\ncos\nsystem\nX\x06\x00\x00\x00system\x86R.", "unsafe_getattr"),
        # getattr(Detect, "__init__") - only "forward" is allowed
        (b"\x80\x02c__builtin__\ngetattr\ncultralytics.nn.modules.head\nDetect\nX\x08\x00\x00\x00__init__\x86R.",
         "unsafe_getattr"),
        # A function (not a class) from an allowed module
        (b"\x80\x02cultralytics.nn.tasks\ntorch_safe_load\nX\x01\x00\x00\x00a\x85R.", "unsafe_globals"),
        # Blocked module even though it holds nn.Module classes
        (b"\x80\x02cultralytics.nn.autobackend\nAutoBackend\nX\x01\x00\x00\x00a\x85R.", "unsafe_globals"),
        # STACK_GLOBAL via memo references
        (b"\x80\x04\x8c\x08builtins\x94\x8c\x04eval\x94h\x00h\x01\x93\x8c\x011\x94\x85R.", "unsafe_globals"),
        (b"\x80\x02ctorch.hub\nload\nX\x01\x00\x00\x00a\x85R.", "unsafe_globals"),
        # Original yolov5 repository checkpoints
        (b"\x80\x02cmodels.yolo\nModel\nq\x00.", "yolov5_repo"),
    ],
)
def test_dangerous_patterns_are_rejected(tmp_path, payload, reason):
    with pytest.raises(CheckpointRejected) as exc:
        _scan(tmp_path, payload)
    assert exc.value.reason == reason


def test_method_reference_on_layer_is_allowed(tmp_path):
    payload = b"\x80\x02c__builtin__\ngetattr\ncultralytics.nn.modules.head\nDetect\nX\x07\x00\x00\x00forward\x86R."
    _scan(tmp_path, payload)


def test_non_zip_file_is_rejected(tmp_path):
    path = tmp_path / "junk.pt"
    path.write_bytes(b"definitely not a checkpoint" * 20)
    with pytest.raises(CheckpointRejected) as exc:
        scan_checkpoint(path)
    assert exc.value.reason == "not_zip"
