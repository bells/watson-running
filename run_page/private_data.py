from pathlib import Path


def validate_joyrun_export(
    private_data_dir: str | None,
    repository_root: Path,
    start_end_range: str | None,
    ignore_before_saving: str | None,
) -> Path:
    if not private_data_dir:
        raise ValueError("Set RUNNING_DATA_DIR to an existing private data directory")

    private_root = Path(private_data_dir).expanduser().resolve()
    repository_root = repository_root.resolve()
    if private_root == repository_root or repository_root in private_root.parents:
        raise ValueError("RUNNING_DATA_DIR must be outside the public repository")
    if (
        not (private_root / "data.db").is_file()
        or not (private_root / "GPX_OUT").is_dir()
    ):
        raise ValueError("Private data directory must contain data.db and GPX_OUT")
    if ignore_before_saving:
        raise ValueError(
            "Unset IGNORE_BEFORE_SAVING before exporting historical activities"
        )

    try:
        radius = int(start_end_range or "0")
    except ValueError as error:
        raise ValueError(
            "IGNORE_START_END_RANGE must be an integer number of meters"
        ) from error
    if radius < 500:
        raise ValueError(
            "Set IGNORE_START_END_RANGE to at least 500 meters before exporting public data"
        )
    return private_root
