from __future__ import annotations

import argparse
import json
from typing import Any


def health_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "pricing-engine",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Pricing engine shell")
    parser.add_argument("--healthz", action="store_true", help="print health payload")
    args = parser.parse_args()

    if args.healthz:
        print(json.dumps(health_payload(), sort_keys=True))
        return

    parser.print_help()


if __name__ == "__main__":
    main()

