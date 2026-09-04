/** Preserve the exact football Pass 1 sections already written by Gary.
 * No new analysis, section synthesis, nickname guessing, or pick rules. */
export function footballCaseSnapshot(result, homeTeam, awayTeam) {
  if(result?.path_home && result?.path_away)return {path_home:result.path_home,path_away:result.path_away};
  const text=String(result?._fullAssistantNarrative || result?._context?.fullAssistantNarrative || result?.rawAnalysis || result?._context?.rawAnalysis || '');
  const norm=value=>String(value || '').trim().toLowerCase();
  // A retry can leave earlier drafts in the narrative. Keep the latest
  // complete pair before an investigation-complete boundary.
  const blocks=text.split(/\bINVESTIGATION COMPLETE\b/i);
  for(const block of blocks.slice(0,-1).reverse()) {
    const headings=[...block.matchAll(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?CASE FOR ([^\n:]+) COVERING THE SPREAD:(?:\*\*)?[^\S\n]*(?:\n|$)/gi)];
    const paths={};
    for(let i=0;i<headings.length;i++) {
      const heading=headings[i];
      const side=norm(heading[1])===norm(homeTeam) ? 'path_home' : norm(heading[1])===norm(awayTeam) ? 'path_away' : null;
      if(!side)continue;
      const section=block.slice(heading.index+heading[0].length,headings[i+1]?.index ?? block.length).replace(/\*+\s*$/,'').trim();
      if(section)paths[side]=section;
    }
    if(paths.path_home && paths.path_away)return paths;
  }
  return {path_home:result?.path_home || null,path_away:result?.path_away || null};
}
