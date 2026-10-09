from pathlib import Path
import os
import re
import subprocess
import json

config = Path("config.yml")
original = config.read_text()
root = Path("/tmp/running-refresh-build")
root.mkdir(exist_ok=True)
results = []
try:
    for theme in ("classic", "dashboard"):
        config.write_text(
            re.sub(r"^theme_preset:.*$", f"theme_preset: {theme}", original, flags=re.M)
        )
        for prefix, name in [("/", "root"), ("/watson-running", "sub")]:
            target = root / f"{theme}-{name}"
            with (root / f"{theme}-{name}.log").open("w") as log:
                r = subprocess.run(
                    ["pnpm", "exec", "vite", "build", "--outDir", str(target)],
                    env={**os.environ, "PATH_PREFIX": prefix},
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
            manifest = (
                json.loads((target / ".vite/manifest.json").read_text())
                if r.returncode == 0
                else {}
            )
            chat = any(
                "ChatAssistant" in key or "ChatAssistant" in value.get("file", "")
                for key, value in manifest.items()
            )
            result = {
                "theme": theme,
                "prefix": prefix,
                "exit": r.returncode,
                "chatChunkPresent": chat,
                "output": str(target),
            }
            results.append(result)
            print(json.dumps(result), flush=True)
            if r.returncode or chat:
                raise RuntimeError("build or development-only contract failed")
finally:
    config.write_text(original)
    (root / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    print("User config restored byte-for-byte", flush=True)
