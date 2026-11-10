/** A saved view override changes effective routing only; individual styles and raw bends remain intact. */
export function applyViewRouter(view){
 if(view?.view.router!=='orthogonal')return view;
 const lines=items=>items.map(item=>({...item,style:{...item.style,lineStyle:'orthogonal'}}));
 return{...view,connections:lines(view.connections),visualConnectors:lines(view.visualConnectors)};
}
