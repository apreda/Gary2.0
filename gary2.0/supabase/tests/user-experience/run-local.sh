#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
test_db="gary_user_experience_test_${RANDOM}_$$"
test_log_dir="$(mktemp -d /tmp/gary-user-experience.XXXXXX)"
createdb "$test_db"
trap 'dropdb --if-exists "$test_db" >/dev/null' EXIT
if ! psql -X -v ON_ERROR_STOP=1 -d "$test_db" -f supabase/tests/user-experience/bootstrap.sql >"$test_log_dir/bootstrap.log" 2>&1; then
  cat "$test_log_dir/bootstrap.log"; exit 1
fi
if ! psql -X -v ON_ERROR_STOP=1 -d "$test_db" -f supabase/tests/user-experience/regression.sql >"$test_log_dir/regression.log" 2>&1; then
  cat "$test_log_dir/regression.log"; exit 1
fi
rg 'PASS:' "$test_log_dir/regression.log"
python3 supabase/tests/user-experience/concurrency.py "$test_db"
if ! psql -X -v ON_ERROR_STOP=1 -d "$test_db" -f supabase/tests/user-experience/account-deletion.sql >"$test_log_dir/account-deletion.log" 2>&1; then
  cat "$test_log_dir/account-deletion.log"; exit 1
fi
rg 'PASS:' "$test_log_dir/account-deletion.log"
printf 'Detailed local test output: %s\n' "$test_log_dir"
