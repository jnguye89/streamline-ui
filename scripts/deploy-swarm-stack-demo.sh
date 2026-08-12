#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="${1:-$project_dir/demo.env}"
remote_host="${DEPLOY_HOST:-ds-1}"
stack_name="${STACK_NAME:-streamline-demo}"
remote_base_path="${REMOTE_BASE_PATH:-/mnt/swarm}"
data_node_host="${DATA_NODE_HOST:-ds-1}"
data_node_ssh_host="${DATA_NODE_SSH_HOST:-$data_node_host}"
tunnel_secret_name="${TUNNEL_SECRET_NAME:-cloudflare_tunnel_token}"
stack_file="$project_dir/stack.demo.yml"

if [[ ! -f "$env_file" ]]; then
  echo "Environment file not found: $env_file" >&2
  exit 1
fi

for command_name in docker ssh; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

# A redeploy should not require operators to keep the database root password in
# a local file when the existing Swarm service already has it. New stacks still
# require MYSQL_ROOT_PASSWORD to be supplied explicitly.
if [[ -z "${MYSQL_ROOT_PASSWORD:-}" ]]; then
  MYSQL_ROOT_PASSWORD="$({
    ssh "$remote_host" bash -s -- "$stack_name" <<'REMOTE_EXISTING_ROOT_PASSWORD'
set -eu
stack_name="$1"
docker service inspect "${stack_name}_mysql" \
  --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' |
  sed -n 's/^MYSQL_ROOT_PASSWORD=//p'
REMOTE_EXISTING_ROOT_PASSWORD
  } 2>/dev/null || true)"
  export MYSQL_ROOT_PASSWORD
fi

required_variables=(
  UI_ORIGIN API_BASE_URL UI_IMAGE API_IMAGE
  RDS_USERNAME RDS_PASSWORD MYSQL_ROOT_PASSWORD STREAMLINE_DB_NAME
  AUTH0_DOMAIN AUTH0_ISSUER AUTH0_AUDIENCE AUTH0_TV_CLIENT_ID
  AGORA_APP_ID AGORA_APP_CERT
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Required variable is unset or empty: $variable_name" >&2
    exit 1
  fi
done

if [[ "${AGORA_CLOUD_RECORDING_ENABLED:-false}" != "false" ]]; then
  for variable_name in AGORA_CUSTOMER_ID AGORA_SECRET; do
    if [[ -z "${!variable_name:-}" ]]; then
      echo "Required variable is unset or empty when Agora cloud recording is enabled: $variable_name" >&2
      exit 1
    fi
  done
fi

if [[ "$UI_ORIGIN" == */ || "$API_BASE_URL" == */ ]]; then
  echo "UI_ORIGIN and API_BASE_URL must not have trailing slashes." >&2
  exit 1
fi

if [[ "$remote_base_path" != /* || "$remote_base_path" == */ ]]; then
  echo "REMOTE_BASE_PATH must be an absolute path without a trailing slash." >&2
  exit 1
fi

if [[ ! "$stack_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  echo "STACK_NAME must contain only letters, digits, periods, underscores, and hyphens." >&2
  exit 1
fi

export REMOTE_BASE_PATH="$remote_base_path"
export STACK_NAME="$stack_name"
export DATA_NODE_HOST="$data_node_host"
export TUNNEL_SECRET_NAME="$tunnel_secret_name"

ssh "$remote_host" bash -s -- "$tunnel_secret_name" <<'REMOTE_VALIDATE'
  set -eu
  tunnel_secret_name="$1"
  test "$(docker info --format "{{.Swarm.LocalNodeState}}")" = active
  test "$(docker info --format "{{.Swarm.ControlAvailable}}")" = true
  docker secret inspect "$tunnel_secret_name" >/dev/null
REMOTE_VALIDATE

ssh "$data_node_ssh_host" bash -s -- \
  "$remote_base_path" "$stack_name" <<'REMOTE_PREPARE_STORAGE'
  set -eu
  remote_base_path="$1"
  stack_name="$2"
  mkdir -p "$remote_base_path/data/$stack_name/mysql"
  mkdir -p "$remote_base_path/data/$stack_name/redis"
REMOTE_PREPARE_STORAGE

# Pull before changing Swarm state. This verifies registry access and that each
# image tag includes a manifest for the target node's architecture.
ssh "$remote_host" docker pull "$UI_IMAGE"
ssh "$remote_host" docker pull "$API_IMAGE"

# Render once on the initiating machine. The remote Docker CLI receives concrete
# values, preventing Swarm or a remote shell from expanding ${...} expressions.
docker stack config --compose-file "$stack_file" |
  ssh "$remote_host" "docker stack deploy --with-registry-auth --prune --compose-file - '$stack_name'"

ssh "$remote_host" bash -s -- "$stack_name" <<'REMOTE_VERIFY'
set -Eeuo pipefail
stack_name="$1"
deadline=$((SECONDS + 360))

while ((SECONDS < deadline)); do
  unconverged="$(
    docker stack services "$stack_name" \
      --format '{{.Name}} {{.Replicas}}' |
      awk '{ split($2, replicas, "/"); if (replicas[1] != replicas[2]) print }'
  )"

  if [[ -z "$unconverged" ]]; then
    docker stack services "$stack_name"
    exit 0
  fi

  sleep 5
done

echo "Stack did not converge within 360 seconds:" >&2
docker stack services "$stack_name" >&2
for service_id in $(docker stack services "$stack_name" --quiet); do
  docker service ps "$service_id" --no-trunc \
    --format '{{.Name}} | {{.CurrentState}} | {{.Node}} | {{.Error}}' >&2
done
exit 1
REMOTE_VERIFY
