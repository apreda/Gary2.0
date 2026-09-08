# Public profile safety — implementation and operations

Prepared September 8, 2026. This is a release handoff, not evidence that the controls are already deployed or that the support queue is staffed. Release owner: Adam Preda / Gary A.I. LLC. The production operator must verify queue and inbox access and record actual coverage before treating this launch gate as closed.

## User and data contract

Public handles/bios prohibit harassment, hateful or sexual content, threats, impersonation, spam and private information. A small server filter rejects known objectionable text, contact spam and links. It does not detect every meaning or obfuscation; reports and human decisions remain necessary. Existing unsafe text is suppressed from public RPCs immediately, while its owner can correct it or opt out. Unrelated preferences remain editable.

Signed-in players can report a profile or block it independently. Reports are durable, private and return a reference; submitting a report does not automatically hide a competitor. Each reporter can create five reports per hour and twenty per day. An already-open report for the same profile returns its original reference. Blocks are account-specific, reversible and limited to 500 active subjects. A viewer's block filters profile cards and rows before pagination but leaves global rank, totals and verified results unchanged. Publicly hidden profiles remain absent after ordinary profile edits until a moderator explicitly restores them.

Reports retain the public identity snapshot, reason, optional details, reporter and subject IDs, timestamps and review status. A concurrent privacy edit cannot cause a report to capture identity text that was never public. Private stakes, manual entries and notes are not copied. Base profile SELECT remains owner-only. Private safety tables use RLS and no client access; only the narrow authenticated RPCs and privileged review path can act on them. Account deletion cascades reports made by or about that account, its blocks, moderation state and review records. No promise of a separate time-based purge is made; define and implement one before publishing a duration.

## Minimal operator workflow

Public help and appeals: https://www.betwithgary.ai/terms#profile-safety and support@betwithgary.ai (subject: Gary profile safety). This URL is used by both client implementations. No new support message or fake production report was created for this work.

### Operator commands

The local operator now has a tested command interface in the canonical checkout's `gary2.0` directory. It uses the authenticated Supabase CLI and existing privileged review RPC; it adds no public endpoint or client privilege.

```sh
node scripts/profile-safety.js status
node scripts/profile-safety.js queue
node scripts/profile-safety.js show REPORT_UUID
```

`status` returns the open count, oldest open report, count older than 24 hours and last review. It is safe for a status check without exposing profile/report details. `queue` lists the oldest 50 report references, reasons and times. `show` displays that report's saved public snapshot alongside the current identity; treat this output as private. The reporter identity is deliberately excluded from these operator commands.

After reviewing the evidence, save a factual decision note in a private local text file. A decision previews without writing until the operator supplies `--apply`:

```sh
node scripts/profile-safety.js hide REPORT_UUID --reviewer "Operator name" --note-file /private/path/decision.txt
node scripts/profile-safety.js hide REPORT_UUID --reviewer "Operator name" --note-file /private/path/decision.txt --apply
node scripts/profile-safety.js dismiss REPORT_UUID --reviewer "Operator name" --note-file /private/path/decision.txt --apply
node scripts/profile-safety.js restore PROFILE_UUID --reviewer "Operator name" --note-file /private/path/appeal.txt --apply
```

Hide/dismiss resolve the subject from the selected open report; the existing locked RPC checks that it is still open before changing anything. Restore uses the actual profile UUID from a reviewed appeal. All actions use the existing private audit log. The command does not delete accounts, modify bets or automatically punish a reported profile. Notes are passed via a private temporary SQL file and removed after the command; no shell interpolation is used.

**September 8 verification:** all 15 isolated PostgreSQL profile-safety cases passed, including the operator's report inspection, exact-subject hide, literal SQL-like note preservation, stale-report rejection, appeal restoration and unchanged bets. A read-only production status call through the actual command succeeded: zero open reports and no recorded moderation decisions. No synthetic production report or decision was created. Inbox delivery, the responsible human and actual response coverage remain separate checks; do not mark staffing complete from this tooling receipt.

1. The named operator checks the restricted queue and support mailbox at the beginning and end of each staffed period, with urgent threats escalated promptly. Record the actual staffed schedule and a backup operator before launch. Do not promise a response deadline without coverage to meet it.
2. Use a privileged database session or a service credential held only in a server/secret store. Review the oldest open reports, their saved public snapshot and current public identity. Keep identifiers and report details out of application logs, chat, commits and public issue trackers. The report has no moderator-facing claim of proof; evaluate it in context.
3. Hide a violating public profile, dismiss a report that does not justify action, or restore a corrected profile after an appeal. Supply an identifiable operator label and a short factual reason. Do not change bets, results, global qualification rules or the user's public opt-in preference. A report alone is never a ranking penalty.
4. Confirm the decision appears in the private audit log and that another signed-in viewer can no longer see a hidden subject through every public RPC. The owner retains the private Book and gets a support/appeal route. Review other open reports for that subject individually; one decision does not silently resolve them all.
5. Answer appeals through the monitored support channel. Do not reveal the reporter's account or report details to the subject. Repeat abuse can remain hidden using the same audited profile restriction; account suspension or deletion is a separate operator decision and is not automated here.

Read-only queue query (privileged session; do not paste real output into this repository):

```sql
select id, subject_id, reason, details, profile_snapshot, created_at
from profile_safety_private.reports
where status = 'open'
order by created_at, id
limit 50;
```

The privileged RPC is `public.review_profile_safety(p_user uuid, p_action text, p_note text, p_reviewer text, p_report uuid default null)`. Use bound parameters. Actions are `hide`, `restore` or `dismiss`. Dismiss requires an open report matching the subject; hide/restore may reference an open report or omit it for an independently reviewed concern/appeal. Restore refuses identity text that still fails the basic filter. Client roles cannot call this function, even if user metadata claims to be an administrator. Decisions append to `profile_safety_private.review_log`.

## Release order and evidence

Apply `gary2.0/supabase/migrations/20260908035634_profile_safety_controls.sql` only after root review of exact source and current database ACLs. Verify all four authenticated user RPCs plus service-only review function, private RLS, owner-only base reads and all legacy leaderboard aliases. Then deploy the web controls and corresponding Terms/Privacy changes together. Web copy must not claim reporting is available before its RPCs exist. Native controls were integrated into `ProfileExperience.swift` and `UserBookView.swift` after build 908's upload released the freeze. They require a subsequent reviewed archive; 908 does not include them.

Before closing this gate, record:

- Isolated SQL concurrency/security suite; rendered web interaction suite; full web lint/types; exact deployed source hashes.
- Two consenting test accounts in a non-production environment: report receipt persists, block removes profile/standings, another viewer's results stay unchanged, unblock restores visibility, denied/offline responses offer retry, auth changes discard stale responses, and private notes never appear.
- Native integrated compilation plus device/simulator actions from podium, standings and own profile; report/block labels, blocked-list management and standings refresh after dismissal. The API fixture executes production Swift receipt validation, but it does not replace an integrated UI build and runtime walkthrough.
- Privileged queue/review/appeal walkthrough with synthetic staging data and confirmed support inbox ownership, coverage and backup. Do not manufacture production reports for proof.
- Final submitted screenshots, review notes and privacy declarations reflecting the actual native/web features and collected data. Apple 1.2 requires both technical controls and timely handling: https://developer.apple.com/app-store/review/guidelines/#user-generated-content.
