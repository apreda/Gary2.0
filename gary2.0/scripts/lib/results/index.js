/** Compose a single results run; importing this module never starts settlement. */
import { createResultsTransport } from './transport.js';
import { createResultsProvider } from './provider.js';
import { createResultsStorage } from './storage.js';
import { createResultsGrounding } from './grounding.js';
import { createResultsEnrichment } from './enrichment.js';
import { createGameSettlement } from './games.js';
import { createPropSettlement } from './props.js';
import { createResultsRunner } from './runner.js';

export function createResultsEngine({ supabase, apiKey, runOptions }) {
  const transport = createResultsTransport({ apiKey, runOptions });
  const provider = createResultsProvider(transport);
  const storage = createResultsStorage({ supabase });
  const grounding = createResultsGrounding();
  const enrichment = createResultsEnrichment({ supabase, apiKey, ...provider, ...storage });
  const dependencies = { supabase, ...provider, ...storage, ...grounding, ...enrichment };
  const games = createGameSettlement(dependencies);
  const props = createPropSettlement(dependencies);
  return createResultsRunner({ supabase, apiKey, runOptions, ...games, ...props });
}
