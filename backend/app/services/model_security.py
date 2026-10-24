"""Static inspection of PyTorch checkpoints before they are deserialized.

Ultralytics checkpoints are pickles that reference Python classes, so loading
one with ``torch.load(weights_only=False)`` can execute arbitrary code. This
module opens the zip container written by ``torch.save`` and walks the pickle
opcodes *without executing them*, collecting every global the pickle would
import. A file is accepted only if each global is

* one of a small set of known reconstruction helpers and plain data types, or
* a *class* defined in the neural-network modules of ``torch`` or
  ``ultralytics`` (layers, model containers, losses).

Anything else (``os.system``, ``builtins.eval``, ``subprocess.Popen``, helper
functions from ultralytics, ...) causes the upload to be rejected.

This is defence in depth, not a sandbox. A determined attacker may still find
gadgets inside allowed classes, so only load checkpoints from sources you
trust. See the README's "Security" section.
"""

from __future__ import annotations

import enum
import importlib
import inspect
import pickletools
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# Exact "module.name" globals that are always allowed.
SAFE_GLOBALS: frozenset[str] = frozenset(
    {
        "collections.OrderedDict",
        "collections.defaultdict",
        "collections.deque",
        "copyreg._reconstructor",
        "_codecs.encode",
        "torch._utils._rebuild_tensor",
        "torch._utils._rebuild_tensor_v2",
        "torch._utils._rebuild_tensor_v3",
        "torch._utils._rebuild_parameter",
        "torch._utils._rebuild_parameter_with_state",
        "torch._utils._rebuild_qtensor",
        "torch._utils._rebuild_sparse_tensor",
        "torch._utils._rebuild_meta_tensor_no_storage",
        "torch._utils._rebuild_wrapper_subclass",
        "torch._tensor._rebuild_from_type",
        "torch._tensor._rebuild_from_type_v2",
        "torch.Size",
        "torch.device",
        "torch.storage.UntypedStorage",
        "torch.storage.TypedStorage",
        "torch.nn.parameter.Parameter",
        "torch.nn.parameter.Buffer",
        "numpy.ndarray",
        "numpy.dtype",
        "numpy.core.multiarray._reconstruct",
        "numpy.core.multiarray.scalar",
        "numpy._core.multiarray._reconstruct",
        "numpy._core.multiarray.scalar",
        "builtins.set",
        "builtins.frozenset",
        "builtins.slice",
        "builtins.range",
        "builtins.complex",
        "builtins.bytearray",
        "builtins.dict",
        "builtins.list",
        "builtins.tuple",
        "builtins.int",
        "builtins.float",
        "builtins.bool",
        "builtins.str",
        "builtins.bytes",
        "builtins.object",
        "__builtin__.set",
        "datetime.datetime",
        "datetime.date",
        "datetime.time",
        "datetime.timedelta",
        "datetime.timezone",
        "pathlib.Path",
        "pathlib.PosixPath",
        "pathlib.WindowsPath",
        "pathlib.PurePath",
        "pathlib.PurePosixPath",
        "pathlib.PureWindowsPath",
        "types.SimpleNamespace",
        "argparse.Namespace",
        "ultralytics.utils.IterableSimpleNamespace",
    }
)

# Modules whose *classes* may be referenced (functions are still refused).
CLASS_MODULES: tuple[str, ...] = (
    "torch.nn.modules",
    "ultralytics.nn.modules",
    "ultralytics.nn.tasks",
    "ultralytics.utils.loss",
    "ultralytics.utils.tal",
    "numpy.dtypes",
    # Classification checkpoints pickle their preprocessing transforms.
    "torchvision.transforms",
)

# Modules that are never allowed, even for classes: their constructors can
# download files or install packages.
BLOCKED_MODULES: tuple[str, ...] = (
    "ultralytics.nn.autobackend",
    "ultralytics.nn.text_model",
    "ultralytics.hub",
)

MAX_PICKLE_BYTES = 256 * 1024 * 1024

_STRING_OPS = {
    "STRING",
    "BINSTRING",
    "SHORT_BINSTRING",
    "UNICODE",
    "BINUNICODE",
    "SHORT_BINUNICODE",
    "BINUNICODE8",
}
_MEMO_PUT_OPS = {"PUT", "BINPUT", "LONG_BINPUT"}
_MEMO_GET_OPS = {"GET", "BINGET", "LONG_BINGET"}
_UNRESOLVED = object()


class CheckpointRejected(Exception):
    def __init__(self, message: str, *, reason: str, offending: list[str] | None = None) -> None:
        super().__init__(message)
        self.reason = reason
        self.offending = offending or []


@dataclass
class ScanReport:
    globals: set[str] = field(default_factory=set)
    pickles_scanned: int = 0


def _matches(module: str, prefixes: tuple[str, ...]) -> bool:
    return any(module == p or module.startswith(p + ".") for p in prefixes)


def _resolve(module: str, qualname: str) -> object | None:
    try:
        obj: object = importlib.import_module(module)
    except Exception:  # noqa: BLE001 - missing module is reported by the caller
        return None
    for part in qualname.split("."):
        obj = getattr(obj, part, None)
        if obj is None:
            return None
    return obj


def _is_allowed(global_name: str) -> tuple[bool, str | None]:
    """Return (allowed, problem) for a "module.qualname" pair."""
    module, _, qualname = global_name.partition(" ")
    full = f"{module}.{qualname}"
    if full in SAFE_GLOBALS:
        return True, None
    if _matches(module, BLOCKED_MODULES):
        return False, None
    if module == "torch":
        # Storage classes (torch.FloatStorage, ...) and dtypes (torch.float16).
        if qualname.endswith("Storage"):
            return True, None
        import torch

        if isinstance(getattr(torch, qualname, None), torch.dtype):
            return True, None
        return False, None
    if _matches(module, CLASS_MODULES):
        obj = _resolve(module, qualname)
        if obj is None:
            return False, f"{full} is not available in the installed packages"
        return inspect.isclass(obj), None
    return False, None


def _collect_globals(data: bytes) -> set[str]:
    """Return every "module qualname" global referenced by a pickle stream.

    The only call that is inspected beyond its import is ``getattr``. It is
    accepted solely as ``getattr(<model layer class>, "forward")`` (method
    references in segmentation, pose and OBB heads) or as an enum member lookup
    on an allowed class (classification preprocessing transforms).
    """
    found: set[str] = set()
    memo: dict[int, object] = {}
    last_pushed: object = _UNRESOLVED
    recent: list[object] = []  # values of the most recent stack pushes
    # Significant (non-memo) ops, with values resolved where possible.
    stream: list[tuple[str, object]] = []

    for opcode, arg, _pos in pickletools.genops(data):
        name = opcode.name
        if name in ("GLOBAL", "INST"):
            module, _, qualname = str(arg).partition(" ")
            ref = _GlobalRef(f"{module} {qualname}")
            found.add(ref.name)
            last_pushed = ref
            recent.append(ref)
            stream.append((name, ref))
        elif name == "STACK_GLOBAL":
            if len(recent) < 2 or not all(isinstance(v, str) for v in recent[-2:]):
                raise CheckpointRejected(
                    "The checkpoint contains an import that cannot be verified statically.",
                    reason="unresolvable_global",
                )
            ref = _GlobalRef(f"{recent[-2]} {recent[-1]}")
            found.add(ref.name)
            last_pushed = ref
            recent = recent[:-2] + [ref]
            stream = stream[:-2] + [("GLOBAL", ref)]
        elif name in ("EXT1", "EXT2", "EXT4"):
            raise CheckpointRejected(
                "The checkpoint uses the pickle extension registry, which is not allowed.",
                reason="extension_registry",
            )
        elif name == "MEMOIZE":
            memo[len(memo)] = last_pushed
        elif name in _MEMO_PUT_OPS:
            memo[int(arg)] = last_pushed
        elif name in _MEMO_GET_OPS:
            last_pushed = memo.get(int(arg), _UNRESOLVED)
            recent.append(last_pushed)
            stream.append(("GET", last_pushed))
        elif name in _STRING_OPS:
            value = arg.decode("utf-8", "replace") if isinstance(arg, bytes) else arg
            last_pushed = value
            recent.append(value)
            stream.append(("STRING", value))
        else:
            if opcode.stack_after:
                last_pushed = _UNRESOLVED
                recent.append(_UNRESOLVED)
            stream.append((name, None))
        if len(recent) > 8:
            recent = recent[-8:]

    for index, (_op, value) in enumerate(stream):
        if isinstance(value, _GlobalRef) and value.name in _GETATTR_NAMES:
            _check_getattr_call(stream, index)
    return {g for g in found if g not in _GETATTR_NAMES}


class _GlobalRef:
    __slots__ = ("name",)

    def __init__(self, name: str) -> None:
        self.name = name


_GETATTR_NAMES = {"__builtin__ getattr", "builtins getattr"}
SAFE_GETATTR_ATTRIBUTES = frozenset({"forward"})
GETATTR_CLASS_MODULES: tuple[str, ...] = ("ultralytics.nn.modules",)


def _check_getattr_call(stream: list[tuple[str, object]], index: int) -> None:
    """Require ``getattr(<ultralytics layer class>, "<safe name>")`` exactly."""
    window = stream[index + 1 : index + 5]
    ops = [op for op, _ in window]
    if len(window) == 4 and ops[2:] == ["TUPLE2", "REDUCE"]:
        target, attribute = window[0][1], window[1][1]
        if isinstance(target, _GlobalRef) and isinstance(attribute, str):
            module, _, qualname = target.name.partition(" ")
            obj = _resolve(module, qualname)
            # Method references on model layers, e.g. getattr(Detect, "forward").
            if (
                attribute in SAFE_GETATTR_ATTRIBUTES
                and _matches(module, GETATTR_CLASS_MODULES)
                and inspect.isclass(obj)
            ):
                return
            # Enum members of allowed classes, e.g. getattr(InterpolationMode, "BILINEAR").
            if (
                _matches(module, CLASS_MODULES)
                and inspect.isclass(obj)
                and issubclass(obj, enum.Enum)
                and attribute in obj.__members__
            ):
                return
    raise CheckpointRejected(
        "The checkpoint uses getattr() in a way that is not part of a standard YOLO model.",
        reason="unsafe_getattr",
        offending=["builtins.getattr"],
    )


def scan_checkpoint(path: Path) -> ScanReport:
    """Inspect ``path`` and raise :class:`CheckpointRejected` if it is not acceptable."""
    if not zipfile.is_zipfile(path):
        raise CheckpointRejected(
            "This file is not a PyTorch zip checkpoint. Ultralytics .pt files are saved in "
            "the zip format; re-export the model with a recent version of Ultralytics.",
            reason="not_zip",
        )

    report = ScanReport()
    try:
        with zipfile.ZipFile(path) as archive:
            members = [m for m in archive.infolist() if m.filename.endswith(".pkl")]
            if not members:
                raise CheckpointRejected(
                    "The archive does not contain a PyTorch pickle (data.pkl).",
                    reason="no_pickle",
                )
            for member in members:
                if member.file_size > MAX_PICKLE_BYTES:
                    raise CheckpointRejected(
                        "The checkpoint's pickle stream is unexpectedly large.",
                        reason="pickle_too_large",
                    )
                data = archive.read(member)
                report.globals |= _collect_globals(data)
                report.pickles_scanned += 1
    except CheckpointRejected:
        raise
    except (zipfile.BadZipFile, ValueError, EOFError, KeyError) as exc:
        raise CheckpointRejected(
            f"The checkpoint is corrupted or truncated ({type(exc).__name__}).",
            reason="corrupted",
        ) from exc

    pretty = sorted(g.replace(" ", ".") for g in report.globals)

    # Checkpoints from the original yolov5 repository pickle `models.yolo.*`.
    if any(g.startswith(("models.", "utils.")) for g in pretty):
        raise CheckpointRejected(
            "This looks like a checkpoint from the original YOLOv5 repository (it references "
            "the `models` package). Ultralytics cannot load these files directly; export or "
            "retrain with the `ultralytics` package (YOLOv5u, YOLOv8, YOLO11, ...).",
            reason="yolov5_repo",
            offending=[g for g in pretty if g.startswith(("models.", "utils."))][:10],
        )

    rejected: list[str] = []
    problems: list[str] = []
    for global_name in sorted(report.globals):
        allowed, problem = _is_allowed(global_name)
        if problem:
            problems.append(problem)
        elif not allowed:
            rejected.append(global_name.replace(" ", "."))

    if problems:
        raise CheckpointRejected(
            "The checkpoint needs classes that are not available in the installed Ultralytics "
            "version. Upgrade Ultralytics (pip install -U ultralytics) or re-export the model. "
            + "; ".join(problems[:5]),
            reason="missing_classes",
            offending=problems[:10],
        )
    if rejected:
        raise CheckpointRejected(
            "The checkpoint references Python objects that are not part of a YOLO model, so "
            "it was not loaded: " + ", ".join(rejected[:5]),
            reason="unsafe_globals",
            offending=rejected[:20],
        )
    return report
