/** Published cards flip in place. Full reasoning remains in the initial HTML. */
export interface BoardGridItem {key:string;label:string;panel:React.ReactNode;}
export function BoardGrid({items}:{items:BoardGridItem[]}){return <div className="site-pick-grid">{items.map(item=><div key={item.key} data-board-panel aria-label={item.label} className="min-w-0">{item.panel}</div>)}</div>;}
