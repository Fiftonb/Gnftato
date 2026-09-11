#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source_dir="$repository_root/scripts/nftato-src"
standalone_target="$repository_root/Nftato.sh"
server_target="$repository_root/server/scripts/Nftato.sh"
mode=${1:-build}

modules=(
  00-runtime.sh
  10-base-rules.sh
  20-outbound.sh
  30-inbound.sh
  40-ddos.sh
  50-cli.sh
  60-main.sh
)

temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/nftato-build.XXXXXX")
standalone_stage=''
server_stage=''
trap 'rm -rf -- "$temporary_dir"; [[ -z "$standalone_stage" ]] || rm -f -- "$standalone_stage"; [[ -z "$server_stage" ]] || rm -f -- "$server_stage"' EXIT
bundle="$temporary_dir/Nftato.sh"

for module in "${modules[@]}"; do
  module_path="$source_dir/$module"
  if [[ ! -f "$module_path" ]]; then
    printf 'Missing Nftato source module: %s\n' "$module_path" >&2
    exit 1
  fi
  cat "$module_path" >> "$bundle"
done
chmod 755 "$bundle"

case "$mode" in
  build)
    # Stage each file on its target filesystem so every individual replacement
    # is atomic. If the second replacement fails, restore the first target.
    standalone_stage=$(mktemp "$(dirname "$standalone_target")/.Nftato.sh.build.XXXXXX")
    server_stage=$(mktemp "$(dirname "$server_target")/.Nftato.sh.build.XXXXXX")
    install -m 755 "$bundle" "$standalone_stage"
    install -m 755 "$bundle" "$server_stage"
    cp -p "$standalone_target" "$temporary_dir/Nftato.sh.standalone.previous"
    mv -f -- "$standalone_stage" "$standalone_target"
    standalone_stage=''
    if ! mv -f -- "$server_stage" "$server_target"; then
      install -m 755 "$temporary_dir/Nftato.sh.standalone.previous" "$standalone_target"
      printf 'Failed to update both generated Nftato targets; restored the standalone target.\n' >&2
      exit 1
    fi
    server_stage=''
    ;;
  --check|check)
    cmp "$bundle" "$standalone_target"
    cmp "$bundle" "$server_target"
    ;;
  *)
    printf 'Usage: %s [build|--check]\n' "$0" >&2
    exit 2
    ;;
esac
