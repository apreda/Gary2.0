# Historical NFL source snapshot

This directory preserves the 24 source files from the preexisting local NFL
audit snapshot. Every source file was verified byte-for-byte against the same
repository-relative path in commit
`6f78c69381c37487c7d072b0e731ece98c0e6f36` (January 17, 2026) before being
committed during Adam's September 20 closeout.

These are historical comparison artifacts. Active runtime code remains in the
repository's top-level `gary2.0/` directory; this snapshot does not replace or
configure the current agents, prompts or scheduler.

The files retain their original relative paths beneath this directory so each
can be compared directly with `git show <commit>:<relative-path>`.
