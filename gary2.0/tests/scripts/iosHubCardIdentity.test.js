import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = (file) => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

describe('native Hub card identity', () => {
  it.skipIf(!hasSwift)('executes league, provider alias, college and player ambiguity regressions in Swift', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-hub-identity-'));
    try {
      const script = `${source('NCAAFTeams.swift')}\n${source('HubCardIdentity.swift')}
let h = HubCardIdentity.self
precondition(h.cardBelongsToTeam(cardLeague: "MLB", cardAbbr: "HOU", league: "MLB", team: "Houston Astros", abbr: "HOU"))
precondition(!h.cardBelongsToTeam(cardLeague: "NCAAF", cardAbbr: "HOU", league: "MLB", team: "Houston Astros", abbr: "HOU"))
precondition(!h.cardBelongsToTeam(cardLeague: nil, cardAbbr: "HOU", league: "MLB", team: "Houston Astros", abbr: "HOU"))
precondition(h.cardBelongsToTeam(cardLeague: "NCAAF", cardAbbr: "HOU", league: "NCAAF", team: "Houston Cougars", abbr: nil))
for pair in [("AZ", "ARI"), ("CWS", "CHW"), ("ATH", "OAK")] {
    precondition(h.cardBelongsToTeam(cardLeague: "MLB", cardAbbr: pair.1, league: "MLB", team: "", abbr: pair.0))
}
precondition(h.matchesTeam("Houston", name: "Houston Cougars", abbr: nil, league: "NCAAF"))
precondition(h.matchesTeam("HOU", name: "Houston Cougars", abbr: nil, league: "NCAAF"))
precondition(!h.matchesTeam("Ohio", name: "Ohio State Buckeyes", abbr: nil, league: "NCAAF"))
precondition(!h.matchesTeam("Bulldogs", name: "Georgia Bulldogs", abbr: nil, league: "NCAAF"))
precondition(!h.matchesTeam("Miami (OH)", name: "Miami Hurricanes", abbr: nil, league: "NCAAF"))
precondition(h.matchesTeam("Yankees", name: "New York Yankees", abbr: "NYY", league: "MLB"))
precondition(h.matchesTeam("Red Sox", name: "Boston Red Sox", abbr: "BOS", league: "MLB"))
precondition(h.matchesTeam("Boston Red Sox", name: "Red Sox", abbr: nil, league: "MLB"))
precondition(!h.matchesTeam("Red Sox", name: "Chicago White Sox", abbr: "CWS", league: "MLB"))
precondition(!h.matchesTeam("York", name: "New York Yankees", abbr: "NYY", league: "MLB"))
precondition(h.uniquePlayerIndex("Walbert Ureña", names: ["Walbert Urena"]) == 0)
precondition(h.uniquePlayerIndex("J. Caminero", names: ["Junior Caminero", "Jose Ramirez"]) == 0)
precondition(h.uniquePlayerIndex("J. Smith", names: ["John Smith", "James Smith"]) == nil)
precondition(h.uniquePlayerIndex("John Smith", names: ["John Smith", "John Smith Jr."]) == 0)
precondition(h.uniquePlayerIndex("John Smith", names: ["John Smith", "John Smith"]) == nil)
precondition(h.uniquePlayerIndex("John Smith", names: ["John Smithson"]) == nil)
print("Hub identity regressions passed")
`;
      const path = join(directory, 'identity.swift');
      writeFileSync(path, script);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 })).toContain('Hub identity regressions passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
