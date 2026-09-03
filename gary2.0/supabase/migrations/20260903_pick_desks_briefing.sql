-- THE NOTEBOOK SHADOW reads the same research (founder, Sep 3 2026): the
-- main read's research briefing rides the desk snapshot so the second read
-- (Gary with his notebook) re-uses it instead of paying the researcher twice.
-- Same desk, same briefing, only the notebook differs.
alter table pick_desks add column if not exists research_briefing text;
