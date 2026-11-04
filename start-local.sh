#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
export PATH="$PWD/.tools/bin:$PWD/.venv/bin:$PATH"
export UV_CACHE_DIR="$PWD/.tools/cache"
export UV_PYTHON_INSTALL_DIR="$PWD/.tools/python"
export PYTHONUNBUFFERED=1
export LITELLM_LOCAL_MODEL_COST_MAP=True

# Optional local overrides, such as AI_API_KEY and AI_ANALYSIS_ENABLED.
if [[ -f .env.local ]]; then
    set -a
    source .env.local
    set +a
fi

if [[ ! -x .venv/bin/python ]]; then
    echo "未找到虚拟环境，请先运行 uv sync --locked --python 3.12" >&2
    exit 1
fi

case "${1:-web}" in
    crawl)
        exec .venv/bin/python -m trendradar
        ;;
    doctor)
        exec .venv/bin/python -m trendradar --doctor
        ;;
    web|start)
        exec .venv/bin/python -m trendradar.workbench start --port "${WEB_PORT:-8787}" --root "$PWD"
        ;;
    stop|status|worker|import|update)
        exec .venv/bin/python -m trendradar.workbench "$1" --port "${WEB_PORT:-8787}" --root "$PWD"
        ;;
    report)
        echo "历史报告：http://127.0.0.1:${REPORT_PORT:-8081}"
        exec .venv/bin/python -m http.server "${REPORT_PORT:-8081}" --bind 127.0.0.1 --directory output/html
        ;;
    mcp)
        exec .venv/bin/python -m mcp_server.server --transport http --host 127.0.0.1 --port "${MCP_PORT:-3333}" --project-root "$PWD"
        ;;
    *)
        echo "用法：bash start-local.sh [web|start|stop|status|update|import|worker|report|crawl|mcp|doctor]" >&2
        exit 2
        ;;
esac
