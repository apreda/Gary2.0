import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const plans = readFileSync(new URL('../../../ios/GaryApp/PlansSheet.swift', import.meta.url), 'utf8');
const design = readFileSync(new URL('../../../ios/GaryApp/DesignSystem.swift', import.meta.url), 'utf8');
const pricing = design.slice(design.indexOf('enum GaryPricing {'), design.indexOf('// MARK: - Gary brand mark'));
const disclosure = plans.slice(plans.indexOf('enum WinnersPlanDisclosure {'), plans.indexOf('// MARK: - Plans page'));
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

describe('native selected-plan billing disclosures', () => {
  it.skipIf(!hasSwift)('keeps renewal intervals and trial eligibility correct when the selected plan changes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-plan-disclosure-'));
    const path = join(directory, 'plans.swift');
    try {
      writeFileSync(path, `import Foundation
${pricing}
${disclosure}
let annual = WinnersPlanDisclosure.billing(for: .annual)
precondition(annual.contains("\\(GaryPricing.allAccessAnnual) billed yearly"))
precondition(annual.contains("then renew at that yearly price"))
precondition(!annual.contains(GaryPricing.allAccessMonthly))
precondition(annual.contains("New subscribers") && annual.contains("card is required"))
let monthly = WinnersPlanDisclosure.billing(for: .monthly)
precondition(monthly.contains("\\(GaryPricing.allAccessMonthly) billed monthly"))
precondition(monthly.contains("New subscribers") && monthly.contains("Returning subscribers"))
for (sports, price) in [(["MLB"], GaryPricing.single), (["MLB", "NFL"], GaryPricing.twoSport), (["MLB", "NFL", "NCAAF"], GaryPricing.threeSport)] {
    let text = WinnersPlanDisclosure.billing(for: .sports(sports))
    precondition(text.contains("\\(price) billed monthly"))
    precondition(text.contains("No free trial"))
    precondition(!text.contains("then renew") && !text.contains(GaryPricing.trialPhrase))
    precondition(!text.contains(GaryPricing.allAccessMonthly))
}
precondition(WinnersPlanDisclosure.billing(for: .sports(["MLB", "MLB"])) == WinnersPlanDisclosure.billing(for: .sports(["MLB"])))
for emptyOrTooMany in [[], ["MLB", "NFL", "NCAAF", "NBA"]] as [[String]] {
    let fallback = WinnersPlanDisclosure.billing(for: .sports(emptyOrTooMany))
    precondition(!fallback.contains("$") && !fallback.contains("trial"))
}
print("Selected plan assertions passed")
`);
      expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 })).toContain('Selected plan assertions passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
