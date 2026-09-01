// The iOS contract pins used to read ios/GaryApp/Views.swift as one 28K-line
// source. That monolith was split into 21 per-section files on Sep 1 2026
// (pure move, original MARK order). This reassembles them IN THAT ORDER so
// every existing substring/ordering assertion keeps its exact meaning.
import { readFileSync } from 'node:fs';

const SPLIT_ORDER = [
  'ViewsShared', 'HomeView', 'HomeFrontPage', 'SportFilter', 'WinnersView',
  'PlansSheet', 'PicksView', 'PropsView', 'TomorrowView', 'BillfoldView',
  'PickCards', 'PickCardFronts', 'ShareCards', 'PropCards', 'SharedStores',
  'HubShared', 'PicksTab', 'ScoutTrio', 'HubModules', 'PropRows',
  'PickDetailSections',
];

/** The former Views.swift, reassembled from its 21 successor files. */
export function readIosViewsSource() {
  return SPLIT_ORDER
    .map((name) => readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8'))
    .join('\n');
}
