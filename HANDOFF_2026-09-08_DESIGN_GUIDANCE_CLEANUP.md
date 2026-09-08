# Design guidance cleanup — September 8, 2026

Adam asked why the Profile streak card appeared red/orange and explicitly asked
to delete old design rules and notes so future agents would not follow them.

The streak card used a hard-coded orange label, fill and border regardless of
streak value. It was not an error or loss state. Commit `cd6ca78d` changes the
label to the existing Gary gold and the container to the same neutral `panel`
used by adjacent Profile cards. Streak data and behavior are unchanged.

This change is included in the source for build 916, whose final build and
acceptance are owned by the Hub thread. It is not in the already-uploaded 915.
No further native edits or release actions belong to this cleanup.

Deleted seven obsolete repository guides/briefs, including the old brand PDF
and the previously retained anti-slop guide. Removed their instructions and
references from agent entrypoints, older handoffs, planning documents and
32 archived mock annotations. Existing artwork and historical release evidence
remain available without standing visual mandates.

Deleted four obsolete Claude design-memory files and the duplicate Desktop
guide. Removed visual prescriptions from 26 other Gary memory/index files
and annotations in three hidden brainstorm previews. Other projects' memories
were outside scope. The local manifests record paths and deletion hashes,
without preserving deleted guide bodies as new instructions.

Removed duplicate color/font rules from Notion's Brand Assets & Guidelines
page and Marketing Command Center. Both were fetched after editing: the old
visual rules are gone and the child pages/databases remain. Product, asset,
voice, attribution and operational content was retained.

Agent guidance now follows Adam's current request, with no standing Gary
style guide. Deleted notes must not be restored from history unless he asks.
Operational, data-integrity and accessibility requirements remain applicable.
This cleanup introduces no new font, palette or layout mandates.

Validation: all ten touched Swift files passed frontend parsing. Nine files
had comment-only changes verified against their immediate pre-edit source;
the Profile card is the sole behavior-bearing diff in this cleanup. The final
PickCards whitespace follow-up is `1838eaf4`; the CLAUDE guidance section is
committed separately as `43d34aab`. The Hub owner included the comment cleanup
alongside their own independent native changes.

The production-truth check at `c5bce1dd+dirty` found all 20 Edge timestamp checks
passing, 15 future MLB games and no started game without a pick. It returned
exit 1 for shared working-tree changes; this is not a global parity pass.

Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/design-guidance-cleanup-2026-09-08/`.
This handoff records completed work; it is not a replacement design guide.
