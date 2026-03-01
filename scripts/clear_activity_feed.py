#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[1]

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clear stored activity feed rows.")
    parser.add_argument("--dry-run", action="store_true", help="Show how many rows would be deleted")
    parser.add_argument(
        "--i-understand-this-will-modify-db",
        action="store_true",
        help="Allow deletes outside ENV=development",
    )
    return parser.parse_args()


def require_safe_mode(args: argparse.Namespace) -> None:
    env_name = str(os.getenv("ENV", "development")).strip().lower()
    if env_name == "development" or args.dry_run or args.i_understand_this_will_modify_db:
        return
    raise SystemExit(
        "Refusing to modify the database outside ENV=development. "
        "Use --i-understand-this-will-modify-db if this is intentional."
    )


async def clear_feed() -> int:
    args = parse_args()
    require_safe_mode(args)

    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    database_name = os.getenv("DATABASE_NAME", "vantage")
    client = AsyncIOMotorClient(mongo_uri)

    try:
        await client.admin.command("ping")
        feed = client[database_name]["activity_feed"]
        total = await feed.count_documents({})

        if args.dry_run:
            print(f"dry_run=1 total={total} deleted=0 collection=activity_feed")
            return 0

        result = await feed.delete_many({})
        print(
            f"dry_run=0 total={total} deleted={result.deleted_count} "
            "collection=activity_feed"
        )
        return 0
    finally:
        client.close()


def main() -> int:
    try:
        return asyncio.run(clear_feed())
    except KeyboardInterrupt:
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
