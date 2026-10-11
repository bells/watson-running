"""Private SQLite maintenance: immutable preview, shared locks and verified backup."""

import hashlib
import json
import os
import sqlite3
import stat
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def snapshot(database):
    database = Path(database)
    sidecars = {}
    for suffix in ("-wal", "-shm", "-journal"):
        path = Path(str(database) + suffix)
        if path.exists():
            sidecars[suffix] = {"size": path.stat().st_size, "sha256": digest(path)}
    return {"sha256": digest(database), "sidecars": sidecars}


@contextmanager
def preview_connection(database):
    database = Path(database).resolve()
    before = snapshot(database)
    if any(
        info["size"] > 0
        for suffix, info in before["sidecars"].items()
        if suffix in ("-wal", "-journal")
    ):
        raise ValueError("maintenance_window_required")
    connection = sqlite3.connect(
        f"file:{quote(str(database), safe='/')}?mode=ro&immutable=1", uri=True
    )
    try:
        connection.execute("PRAGMA query_only=ON")
        yield connection
    finally:
        connection.close()
        if snapshot(database) != before:
            raise ValueError("preview_input_changed")


def require_private_path(database):
    database = Path(database)
    root = database.parent.resolve()
    if (
        database.is_symlink()
        or not database.is_file()
        or root.is_relative_to(REPOSITORY_ROOT)
    ):
        raise ValueError("database_must_be_private")
    if (
        stat.S_IMODE(root.stat().st_mode) != 0o700
        or stat.S_IMODE(database.stat().st_mode) != 0o600
    ):
        raise ValueError("private_permissions_required")
    if root.stat().st_uid != os.getuid() or database.stat().st_uid != os.getuid():
        raise ValueError("private_owner_required")
    return database.resolve()


@contextmanager
def write_lock(private_root):
    import fcntl

    path = Path(private_root) / ".running-data.lock"
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if stat.S_IMODE(os.fstat(descriptor).st_mode) != 0o600:
            raise ValueError("unsafe_lock_permissions")
        if os.fstat(descriptor).st_uid != os.getuid():
            raise ValueError("unsafe_lock_owner")
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("writer_busy") from None
        yield
    finally:
        os.close(descriptor)


def backup_database(connection, database):
    root = Path(database).parent / "geography" / "backups"
    private_root = Path(database).parent.resolve()
    geography_root = private_root / "geography"
    for directory in (geography_root, root):
        if directory.is_symlink() or not directory.resolve().is_relative_to(
            private_root
        ):
            raise ValueError("unsafe_backup_path")
        directory.mkdir(mode=0o700, exist_ok=True)
        if (
            stat.S_IMODE(directory.stat().st_mode) != 0o700
            or directory.stat().st_uid != os.getuid()
        ):
            raise ValueError("unsafe_backup_permissions")
    if stat.S_IMODE(root.stat().st_mode) != 0o700:
        raise ValueError("unsafe_backup_permissions")
    path = root / f"{uuid.uuid4()}.db"
    target = sqlite3.connect(path)
    try:
        connection.backup(target)
        if target.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise ValueError("backup_integrity_failed")
    finally:
        target.close()
    path.chmod(0o600)
    metadata = {"file": str(path), "sha256": digest(path), "quickCheck": "ok"}
    Path(str(path) + ".json").write_text(json.dumps(metadata, indent=2) + "\n")
    Path(str(path) + ".json").chmod(0o600)
    return metadata
