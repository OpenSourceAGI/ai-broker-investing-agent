#!/usr/bin/env bash
set -euo pipefail
task=${1:?usage: run.sh install|test|test-root|tsc|build|coverage|demo|dev|pack|shell}
shift
root=$(cd "$(dirname "$0")/../../.." && pwd)
local_dir="$root/devdocs/third-party-integration/local"
stage="$local_dir/repo"
image=aibroker-bun:1.3.11
if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker build -t "$image" -f "$root/devdocs/third-party-integration/harness/Dockerfile" "$root/devdocs/third-party-integration/harness"
fi
name="aibroker-${task}-$$"
mkdir -p "$stage" "$local_dir/logs"
# Parallel tracks share the dependency volumes and staging tree. Serialize this
# wrapper; assessment runs have independent work folders and remain parallel.
exec 9>"$local_dir/harness.lock"
flock 9
# A clean staging tree also excludes secrets from bind mounts, including dev runs.
# Never read credentials merely to mask them; exclude them during traversal.
if [[ ${HARNESS_SNAPSHOT:-0} != 1 ]]; then
  rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='.env*' --exclude='.dev.vars*' --exclude='*.pem' --exclude='*.key' --exclude='*.p12' --exclude='id_*' --exclude='credentials*' --exclude='secrets*' --exclude='auth.json' --exclude='devdocs/third-party-integration/local' --exclude='dist' --exclude='coverage' --exclude='.next' --exclude='.turbo' "$root/" "$stage/"
fi
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
volumes=(-v aibroker-nm-root:/repo/node_modules)
for workspace in "$stage"/packages/* "$stage"/apps/*; do
  [[ -f "$workspace/package.json" ]] || continue
  rel=${workspace#"$stage/"}
  volume="aibroker-nm-${rel//\//-}"
  volumes+=(-v "$volume:/repo/$rel/node_modules")
done
# Docker creates named volumes as root. Initialize only these empty dependency
# directories before the unprivileged install; the host modules are never mounted.
docker run --rm --network=none --cap-drop=ALL --cap-add=CHOWN --security-opt no-new-privileges "${volumes[@]}" "$image" sh -c 'find /repo -type d -name node_modules -prune -exec chown 1000:1000 {} \;'
flags=(--user 1000:1000 --cap-drop=ALL --security-opt no-new-privileges -v "$stage:/repo" "${volumes[@]}" -v "$local_dir:/results" -w /repo -e HOME=/tmp -e XDG_CACHE_HOME=/tmp/cache -e SKIP_LLM_TESTS=1 -e SKIP_LIVE_PRICE_TESTS=1 -e TURBO_TELEMETRY_DISABLED=1 -e CI=1)
docker run --rm --network=none "${flags[@]}" "$image" sh -c 'id && touch /repo/.harness-ok && rm /repo/.harness-ok'
network=(--network=none)
case "$task" in
  install) network=(); command='bun install --no-save' ;;
  test) command='cd packages/investing && bun run test "$@"' ;;
  test-root) command='bun run test "$@"' ;;
  build) command='cd packages/investing && bun run build "$@"' ;;
  coverage) command='cd packages/investing && bun run test:coverage --coverage.include="src/strategy-signals/**/*.ts" --coverage.include="src/trading-agents/graph/**/*.ts" --coverage.include="src/trading-agents/agents/risk-judge.ts" "$@"' ;;
  demo) command='cd packages/investing && bun run demo:strategy-signals "$@"' ;;
  pack) command='cd packages/investing && bun pm pack --dry-run' ;;
  shell) command="$1"; shift ;;
  tsc) command='cd packages/investing; code=0; for config in tsconfig.json tsconfig.test.json; do [ -f "$config" ] || continue; bunx --no-install tsc --noEmit --pretty false -p "$config" > "/results/logs/$config.tsc.log" 2>&1; result=$?; cat "/results/logs/$config.tsc.log"; echo "tsc $config exit: $result"; bash ../../devdocs/third-party-integration/harness/tsc-diff.sh "/results/logs/$config.tsc.log" "$result" "$config" || code=1; done; exit "$code"' ;;
  dev) network=(-p 127.0.0.1::3000 --env-file /dev/null); command='bun run dev' ;;
  *) echo "Unknown task: $task" >&2; exit 2 ;;
esac
if [[ "$task" == dev ]]; then
  docker run -d --name "$name" "${network[@]}" "${flags[@]}" "$image" sh -c "$command" >/dev/null
  address=$(docker port "$name" 3000/tcp)
  probe=failed
  for ((i=0;i<180;i++)); do
    if curl --silent --fail --max-time 1 "http://$address/" > "$local_dir/dev-server-response.txt"; then
      probe=passed
      # Give sibling tasks time to report startup errors; an early 200 can come
      # from fin-data-api, which also defaults to port 3000, rather than the app.
      [[ $i -ge 20 ]] && break
    fi
    [[ $(docker inspect -f '{{.State.Running}}' "$name") == true ]] || break
    sleep 1
  done
  docker logs "$name" 2>&1 | sed -E 's/((API[_-]?KEY|TOKEN|SECRET|PASSWORD|Authorization)[=: ]+)[^ ,;]+/\1[REDACTED]/Ig;s/(sk-|pk-)[A-Za-z0-9_-]+/[REDACTED]/g' > "$local_dir/dev-server.log"
  docker inspect --format '{{json .State}}' "$name" > "$local_dir/dev-server-state.json"
  if [[ $(docker inspect -f '{{.State.Running}}' "$name") == true ]]; then docker stop -t 3 "$name" >/dev/null; fi
  docker wait "$name" > "$local_dir/dev-server-exit.txt"
  echo "URL: http://$address/; probe: $probe; exit: $(cat "$local_dir/dev-server-exit.txt")"
  cat "$local_dir/dev-server.log"
else
  set +e
  timeout 1800 docker run --rm --name "$name" "${network[@]}" "${flags[@]}" "$image" sh -c "$command" -- "$@" 2>&1 | tee "$local_dir/logs/$task.log"
  result=${PIPESTATUS[0]}
  set -e
  echo "$result" > "$local_dir/logs/$task.exit"
  exit "$result"
fi
