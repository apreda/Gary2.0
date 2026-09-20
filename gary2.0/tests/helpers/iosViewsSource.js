// Transitional reader for older view-contract fixtures. Feature files are
// composed here only for legacy source tests; new tests compile shipping files.
import { readNativeFrontPage, readNativeHome, readNativePicks } from './nativeSources.js';
import { readFileSync } from 'node:fs';

const SPLIT_ORDER = [
  'ViewsShared', 'HomeView', 'HomeFrontPage', 'SportFilter', 'WinnersView',
  'PlansSheet', 'TomorrowView', 'BillfoldView',
  'PickCards', 'PickCardFronts', 'ShareCards', 'PropCards', 'SharedStores',
  'HubShared', 'PicksTab', 'ScoutTrio', 'HubModules', 'PropRows',
  'PickDetailSections',
];

/** Preserve legacy declaration order across the current feature modules. */
export function readIosViewsSource() {
  return SPLIT_ORDER
    .map((name) => name === 'HomeFrontPage' ? readNativeFrontPage() : name === 'HomeView' ? readNativeHome() : name === 'PicksTab' ? readNativePicks() : readFileSync(new URL(`../../../ios/GaryApp/${name}.swift`, import.meta.url), 'utf8'))
    .join('\n');
}
