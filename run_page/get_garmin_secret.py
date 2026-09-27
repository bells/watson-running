import argparse
import getpass
import os
from pathlib import Path


def write_secret(secret: str, destination: Path) -> None:
    repository_root = Path(__file__).resolve().parent.parent
    destination = destination.expanduser()
    destination = destination.parent.resolve() / destination.name
    if repository_root == destination or repository_root in destination.parents:
        raise ValueError("Credential file must be outside the public repository")
    if not destination.parent.is_dir():
        raise ValueError("Credential file parent directory must already exist")

    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(secret)
        output.write("\n")


if __name__ == "__main__":
    import garth

    parser = argparse.ArgumentParser()
    parser.add_argument("email", help="Garmin account email")
    parser.add_argument(
        "--output", required=True, type=Path, help="new private credential file"
    )
    parser.add_argument(
        "--is-cn",
        dest="is_cn",
        action="store_true",
        help="if garmin account is cn",
    )
    options = parser.parse_args()
    if options.is_cn:
        garth.configure(domain="garmin.cn")
    password = getpass.getpass("Garmin password: ")
    garth.login(options.email, password)
    del password
    write_secret(garth.client.dumps(), options.output)
    print(f"Credential saved to {options.output}; keep this file private")
