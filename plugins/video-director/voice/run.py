"""Entry point: python -I -X utf8 run.py <command> ...

Isolated mode (-I) leaves the script folder off sys.path, so the package next
to this file is added explicitly, and only that folder.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vdvoice.cli import main  # noqa: E402

if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    sys.exit(main())
