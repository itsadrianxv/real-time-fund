#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REAPPLY_REPO_DIR:-/opt/real-time-fund}"
SERVICE_NAME="${REAPPLY_SERVICE_NAME:-fund-alert.service}"
BRANCH="${REAPPLY_BRANCH:-main}"
RUN_AS="${REAPPLY_RUN_AS:-fundalert}"
CONFIG_PATH="${REAPPLY_CONFIG_PATH:-${REPO_DIR}/config/fund-alert.json}"

log_step() {
  printf '==> %s\n' "$1"
}

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

quote_for_bash() {
  printf '%q' "$1"
}

run_repo_shell() {
  local shell_command="$1"

  if [ "$RUN_AS" = "__SELF__" ]; then
    (
      cd "$REPO_DIR"
      eval "$shell_command"
    )
    return
  fi

  local escaped_repo
  escaped_repo="$(quote_for_bash "$REPO_DIR")"
  sudo -u "$RUN_AS" -- bash -lc "cd ${escaped_repo} && ${shell_command}"
}

git_status_short() {
  run_repo_shell 'git status --short'
}

git_current_branch() {
  run_repo_shell 'git branch --show-current'
}

git_fetch_origin() {
  run_repo_shell 'git fetch origin'
}

git_pull_branch() {
  run_repo_shell "git pull --ff-only origin $(quote_for_bash "$BRANCH")"
}

npm_ci() {
  run_repo_shell 'npm ci'
}

npm_test() {
  run_repo_shell 'npm test'
}

validate_runtime_config() {
  run_repo_shell "npm run config:validate -- --config $(quote_for_bash "$CONFIG_PATH")"
}

require_command git
require_command npm
require_command sudo
require_command systemctl
require_command bash

[ -d "$REPO_DIR" ] || die "Repository directory does not exist: $REPO_DIR"
[ -f "$CONFIG_PATH" ] || die "Config file does not exist: $CONFIG_PATH"

log_step "Checking working tree"
DIRTY_STATUS="$(git_status_short)"
if [ -n "$DIRTY_STATUS" ]; then
  printf '%s\n' "$DIRTY_STATUS" >&2
  die "Server worktree is dirty. Clean it before running this script."
fi

log_step "Checking current branch"
CURRENT_BRANCH="$(git_current_branch)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  die "Current branch is not ${BRANCH}: ${CURRENT_BRANCH}"
fi

log_step "Fetching origin/${BRANCH}"
git_fetch_origin

log_step "Pulling latest ${BRANCH}"
git_pull_branch

log_step "Installing dependencies"
npm_ci

log_step "Running test suite"
npm_test

log_step "Validating runtime config"
validate_runtime_config

log_step "Restarting ${SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"

log_step "Showing ${SERVICE_NAME} status"
sudo systemctl status "$SERVICE_NAME" --no-pager