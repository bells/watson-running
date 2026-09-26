import os
from collections import namedtuple

# getting content root directory
current = os.path.dirname(os.path.realpath(__file__))
parent = os.path.dirname(current)
private_data_dir = os.getenv("RUNNING_DATA_DIR")
data_root = (
    os.path.realpath(os.path.expanduser(private_data_dir))
    if private_data_dir
    else parent
)

OUTPUT_DIR = os.path.join(data_root, "activities")
GPX_FOLDER = os.path.join(data_root, "GPX_OUT")
TCX_FOLDER = os.path.join(data_root, "TCX_OUT")
FIT_FOLDER = os.path.join(data_root, "FIT_OUT")
PNG_FOLDER = os.path.join(data_root, "PNG_OUT")
ENDOMONDO_FILE_DIR = os.path.join(data_root, "Workouts")
FOLDER_DICT = {
    "gpx": GPX_FOLDER,
    "tcx": TCX_FOLDER,
    "fit": FIT_FOLDER,
}
SQL_FILE = (
    os.path.join(data_root, "data.db")
    if private_data_dir
    else os.path.join(current, "data.db")
)
JSON_FILE = os.path.join(parent, "src", "static", "activities.json")
SYNCED_FILE = os.path.join(data_root, "imported.json")


BASE_TIMEZONE = "Asia/Shanghai"
UTC_TIMEZONE = "UTC"

start_point = namedtuple("start_point", "lat lon")
run_map = namedtuple("polyline", "summary_polyline")
