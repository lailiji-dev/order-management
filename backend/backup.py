"""Consistent SQLite SQL backup; compatible with Python 3.6."""
import datetime
import gzip
import io
import os
from pathlib import Path
import sqlite3
import sys

def backup(database, destination):
    target = Path(destination)
    target.mkdir(parents=True, exist_ok=True)
    os.chmod(str(target), 0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = target / ('peiliao-' + stamp + '.sql.gz')
    temporary = target / (output.name + '.part')
    connection = sqlite3.connect(database, timeout=30)
    try:
        connection.execute('BEGIN')
        # Protect the file from creation onward; do not leave a readable
        # intermediate SQL dump while a large backup is still being written.
        descriptor = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as raw:
            with gzip.GzipFile(fileobj=raw, mode='wb') as compressed:
                with io.TextIOWrapper(compressed, encoding='utf-8') as stream:
                    for line in connection.iterdump():
                        stream.write(line + '\n')
        os.replace(str(temporary), str(output))
    finally:
        connection.close()
    for old in sorted(target.glob('peiliao-*.sql.gz'), reverse=True)[14:]:
        old.unlink()
    print('SQLite backup complete: ' + output.name)

if __name__ == '__main__':
    backup(sys.argv[1], sys.argv[2])
