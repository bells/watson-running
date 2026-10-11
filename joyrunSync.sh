#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

PYTHON_BIN=${JOYRUN_PYTHON:-"$SCRIPT_DIR/.venv/bin/python"}
if [ ! -x "$PYTHON_BIN" ]; then
    printf '%s\n' '未找到 .venv/bin/python；请先准备虚拟环境，或设置 JOYRUN_PYTHON。' >&2
    exit 1
fi

case "${1:-}" in
    -h|--help) exec "$PYTHON_BIN" run_page/joyrun_sync.py --help ;;
esac

: "${RUNNING_DATA_DIR:=$HOME/work/watson-running-data}"
: "${IGNORE_START_END_RANGE:=500}"
export RUNNING_DATA_DIR IGNORE_START_END_RANGE
unset IGNORE_BEFORE_SAVING

if [ -z "${JOYRUN_PHONE:-}" ]; then
    printf '%s' '请输入悦跑圈手机号: '
    IFS= read -r JOYRUN_PHONE
fi
if [ -z "$JOYRUN_PHONE" ]; then
    printf '%s\n' '手机号不能为空，同步已停止。' >&2
    exit 1
fi

exec "$PYTHON_BIN" run_page/joyrun_sync.py --phone "$JOYRUN_PHONE" \
    --with-gpx --athlete "${JOYRUN_ATHLETE:-watson}" "$@"
