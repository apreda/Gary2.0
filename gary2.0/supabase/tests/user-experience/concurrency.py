"""Adversarial two-session checks; database name is a disposable local fixture."""
import subprocess
import sys

DB = sys.argv[1]

def client(uid, operation, hold=False):
    return subprocess.Popen([
        'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c',
        "begin; set local role authenticated; select set_config('request.jwt.claims',"
        f"'{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}',true); {operation}; "
        + ('select pg_sleep(0.4); ' if hold else '') + 'commit;'
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

uid = '10000000-0000-0000-0000-000000000002'
a = client(uid, "select set_streak_pick((select id from user_bets where source_game_id='601'),true)", True)
b = client(uid, "select set_streak_pick((select id from user_bets where source_game_id='602'),true)")
for process in [a, b]:
    stdout, stderr = process.communicate(timeout=10)
    assert process.returncode == 0, stderr
result = subprocess.check_output(['psql', '-X', '-At', '-d', DB, '-c',
    f"select count(*) from user_bets where user_id='{uid}' and streak_pick"], text=True).strip()
assert result == '1', result
print('PASS: simultaneous streak claims serialize into exactly one designation')

a = client(uid, "select save_my_profile(p_handle=>'SharedHandle')", True)
b = client('10000000-0000-0000-0000-000000000003', "select save_my_profile(p_handle=>'sharedhandle')")
results = [(p, p.communicate(timeout=10)) for p in [a, b]]
assert sum(p.returncode == 0 for p, _ in results) == 1, results
assert any('taken' in stderr for p, (_, stderr) in results if p.returncode != 0), results
print('PASS: concurrent case-insensitive handle claims have one winner')
