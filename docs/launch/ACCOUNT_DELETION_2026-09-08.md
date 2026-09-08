# Account deletion repair — September 8, 2026

Applied migration: `20260908132857_delete_legacy_account_identity.sql`.

The Auth signup trigger creates `public.users` with the account's email and free
plan. That legacy table has no foreign key to Auth. The deployed `delete-account`
v9 handler deleted the Auth identity after its existing billing, analytics and
session cleanup, but neither it nor the database trigger removed the legacy row.
A successful in-app account deletion therefore retained the account's email row.

The migration adds `delete from public.users where id=old.id` to the existing
atomic Auth deletion trigger. It retains every previous cleanup operation,
advisory lock, security-definer setting, empty search path and permission. It
changes no historical orphan data and needs no edge deployment.

The original canonical function body matched the deployed definition exactly.
The root launch owner independently reviewed the proposed change, applied it
through Supabase's migration tool, and reconciled the generated local filename
with the actual applied version. Fresh deployed readback confirmed the new owner
delete, all prior cleanup clauses, one Auth trigger, and unchanged client schema
restrictions. No existing accounts or orphan records were deleted during rollout.

The new isolated PostgreSQL regression first reproduces the prior retained-email
failure, then verifies owner-only cleanup, other-account preservation, rollback
on both old and new cleanup failures, missing legacy rows, migration reapplication
without data changes, and unchanged client permissions. Six cases pass under
PostgreSQL 17 after the final migration filename update. The combined new and
existing legacy-privacy suites previously passed all 17 cases; the unchanged
deletion-handler suite passed all 10 cases.

Runtime account deletion through the signed-in client remains a separate launch
acceptance step. This source/database repair does not by itself prove that UI
flow, password-provider acceptance, or App Review readiness.
