# Historical implementation reference

Obsolete palette, font, component-anatomy and screen-layout notes were removed
at Adam's request. Use current source for implementation facts and the current
user request for visual decisions.

## Accessibility and verification

Preserve Dynamic Type support, readable contrast, meaningful VoiceOver labels,
and Reduce Motion handling when changing the UI. Verify actual behavior in the
relevant build; an old preview or source comment is not acceptance evidence.

## Technical considerations

Wide content inside an unconstrained container can increase its parent's
measured width. Keep scrollable content constrained to its intended viewport.
Data freshness, exact game/player identity and honest loading/empty/error
states are functional requirements, independent of aesthetic choices.
