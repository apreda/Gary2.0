"""Real concurrent PostgreSQL clients contend for the same checkout slot."""
import subprocess
import sys
import uuid

DB = sys.argv[1]
assert DB.startswith('gary_billing_lifecycle_test_'), 'Disposable fixture database required'
owner = '50000000-0000-0000-0000-000000000001'
subprocess.run(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c',
                f"insert into auth.users values('{owner}')"], check=True)
clients = []
for _ in range(8):
    token = uuid.uuid4()
    sql = ("begin; set local role service_role; set local request.jwt.claims = '{\"role\":\"service_role\"}'; "
           f"select acquire_checkout_reservation('{owner}',false,'{token}') is not null; "
           "select pg_sleep(0.05); commit;")
    clients.append(subprocess.Popen(['psql', '-X', '-Atq', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', sql],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
acquired = 0
for client in clients:
    out, err = client.communicate(timeout=15)
    assert client.returncode == 0, err
    acquired += out.splitlines().count('t')
assert acquired == 1, acquired
print('PASS: eight simultaneous owner-mode checkout requests acquire exactly one lease')
