"""
r2_archive.py

Keep the previous version of every file a rebuild replaces. Before an apply
overwrites a live key, archive() copies it (server side, no download) to

    archive/<YYYY-MM-DD>-<label>/<original key>

next to <original key>.row.json, the catalogue row as it was. Nothing in the
site reads archive/, so these copies are never served. To revert, copy the
file back to its key and restore the row from the JSON.

If the copy fails the apply stops for that file, so a live file is never
replaced without its former version being kept.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from boto3.s3.transfer import TransferConfig

_RUN = datetime.now(timezone.utc).strftime('%Y-%m-%d')


def archive(s3, bucket, key, label, row=None):
    """Copy the live object at key into archive/; return the archive key, or None if key does not exist."""
    try:
        s3.head_object(Bucket=bucket, Key=key)
    except Exception:  # noqa: BLE001 - nothing live to keep
        return None
    dest = f'archive/{_RUN}-{label}/{key}'
    s3.copy({'Bucket': bucket, 'Key': key}, bucket, dest,
            Config=TransferConfig(multipart_threshold=256 * 1024 * 1024, multipart_chunksize=256 * 1024 * 1024))
    s3.head_object(Bucket=bucket, Key=dest)  # raises if the copy is not there
    if row is not None:
        s3.put_object(Bucket=bucket, Key=dest + '.row.json', ContentType='application/json',
                      Body=json.dumps(row, indent=2, default=str).encode())
    print(f'  archived {key} -> {dest}', flush=True)
    return dest
