#!/usr/bin/env bash
set -euo pipefail
folder=${1:?folder required}
id=${2:?source ID required}
[[ "$folder" != */* && "$folder" != .* && "$id" =~ ^[a-z0-9-]+$ ]] || { echo 'invalid assessment target' >&2; exit 2; }
image=${3:?image required (e.g. python:3.11-slim)}
install=${4:?install command required}
run=${5:?offline demo/import command required}
root=$(cd "$(dirname "$0")/../../.." && pwd)
source="$root/third-party-trading-bots/$folder"
[[ -d "$source" ]] || { echo 'folder not found' >&2; exit 2; }
work="$root/devdocs/third-party-integration/local/bot-runs/$id"
mkdir -p "$work/src" "$work/home" "$work/cache" "$work/cargo" "$work/pip" "$work/npm"
rsync -a --delete --exclude='.env*' --exclude='.dev.vars*' --exclude='*.pem' --exclude='*.key' --exclude='*.p12' --exclude='id_*' --exclude='credentials*' --exclude='secrets*' --exclude='auth.json' --exclude='.git' --exclude='node_modules' --exclude='.venv' "$source/" "$work/src/"
base="aibroker-assess-$id-$$"
cleanup() { docker rm -f "$base-preflight" "$base-install" "$base-run" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" > "$work/pull.log" 2>&1
digest=$(docker image inspect --format '{{.Id}} {{json .RepoDigests}}' "$image")
flags=(--rm --user 1000:1000 --cap-drop=ALL --security-opt no-new-privileges --env-file /dev/null -v "$work:/work" -w /work/src -e HOME=/work/home -e XDG_CACHE_HOME=/work/cache -e PIP_CACHE_DIR=/work/pip -e CARGO_HOME=/work/cargo -e npm_config_cache=/work/npm)
set +e
docker run --name "$base-preflight" --network=none "${flags[@]}" "$image" sh -c 'id && touch /work/.preflight && rm /work/.preflight' > "$work/preflight.log" 2>&1
preflight=$?
set -e
install_status=not-run
run_status=not-run
outcome=harness-failure
if [[ $preflight == 0 ]]; then
  rm -f "$work/install.cid" "$work/run.cid"
  set +e
  timeout 900 docker run --name "$base-install" --cidfile "$work/install.cid" "${flags[@]}" "$image" sh -c "$install" > "$work/install.log" 2>&1
  install_status=$?
  docker rm -f "$base-install" >/dev/null 2>&1
  # Even a failed dependency install gets a genuine offline entrypoint attempt.
  timeout 600 docker run --name "$base-run" --cidfile "$work/run.cid" --network=none "${flags[@]}" "$image" sh -c "$run" > "$work/run.log" 2>&1
  run_status=$?
  docker rm -f "$base-run" >/dev/null 2>&1
  set -e
  if [[ $run_status == 0 && $install_status == 0 ]]; then outcome=ran
  elif rg -qi 'ModuleNotFoundError|No module named|cannot find module|rustc.*not supported' "$work/run.log"; then outcome=unsupported-runtime
  elif rg -qi 'api.?key.*(required|missing|not set)|private.?key.*(required|missing)|environment.*required' "$work/run.log"; then outcome=credential-blocked
  elif rg -qi 'Network is unreachable|Temporary failure in name resolution|Name or service not known|Connection refused|ENOTFOUND|fetch failed|Could not resolve host' "$work/run.log"; then outcome=needs-network
  elif [[ $install_status != 0 ]]; then outcome=unsupported-runtime
  else outcome=bot-failure; fi
fi
for file in "$work"/*.log; do
  sed -E -i 's/((API[_-]?KEY|TOKEN|SECRET|PASSWORD|Authorization)[=: ]+)[^ ,;]+/\1[REDACTED]/Ig;s/(sk-|pk-)[A-Za-z0-9_-]+/[REDACTED]/g' "$file"
done
{
  echo "# Assessment: $folder ($id)"
  echo
  echo "Image: $image"
  echo "Digest: $digest"
  echo
  echo 'All stages: user 1000:1000, cap-drop ALL, no-new-privileges, credential-excluded staged source, own writable HOME/caches, no host home or Docker socket.'
  echo
  printf 'Install command (network enabled):\n\n```sh\n%s\n```\n\n' "$install"
  printf 'Run command (--network=none):\n\n```sh\n%s\n```\n\n' "$run"
  echo "Preflight exit: $preflight"
  echo "Install exit: $install_status (900-second bound)"
  echo "Run exit: $run_status (600-second bound)"
  echo "Outcome: $outcome"
  echo 'Containers removed on completion, timeout and interruption. This assesses upstream only; it does not establish the TypeScript integration.'
} > "$work/run.md"
cat "$work/run.md"
