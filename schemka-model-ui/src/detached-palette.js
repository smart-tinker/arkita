import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { creationTypes } from './profile-ui.js';
import { specializationCreationEntries } from './preferences.js';
import { canvasDropPoint } from './drag-drop.js';
import { PALETTE_MIME } from './palette-window.js';

const PAGE = 510;
/** The owner renders a bounded DTO; only this window can execute model commands. */
export function installDetachedPalette({document,window,model,session,canvas,blocked,status,activate,readSpecializations = () => true,desktop = window.schemkaDesktop}) {
  const create = (text,action) => { const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',action);return button; };
  let detached=false,busy=false,page=0,generation=0,signature='',publishing=false,publishAgain=false;
  const trigger=create('Отделить палитру',open);trigger.id='palette-detach';trigger.hidden=!desktop?.paletteOpen;document.querySelector('.toolbox .palette')?.prepend(trigger);
  const dock=create('Вернуть палитру в окно',async()=>{try{await desktop.paletteDock();docked();}catch(error){status(`Палитра не возвращена: ${error.message}`);}});dock.id='palette-owner-dock';dock.hidden=true;
  [...document.querySelectorAll('.app-menu')].find(item=>item.querySelector('summary')?.textContent==='Вид')?.querySelector('.menu-items')?.append(dock);
  function context() {return {documentToken:session.documentToken,revision:model.store.revision,viewId:model.viewId};}
  const fresh = request => request && request.documentToken===session.documentToken && request.revision===model.store.revision && request.viewId===model.viewId;
  function snapshot() {
    const state=model.store.snapshot,hasView=Boolean(model.view),types=[];
    for(const kind of ['element','junction','relationship']){
      const allowed=new Set(creationTypes(state.project.metamodel,kind));
      for(const type of CURRENT_CATALOG[`${kind}Types`]){const button=document.getElementById(`create-${type.toLowerCase()}`);types.push({kind,type,label:button?.querySelector('strong')?.textContent||type,description:button?.title||type,enabled:hasView&&allowed.has(type)&&model.typeVisible(kind,type),active:button?.getAttribute('aria-pressed')==='true'});}
    }
    for(const [type,label] of [['smart-link','Магическая связь'],['visual-connector','Визуальная линия']])types.push({kind:'tool',type,label,description:label,enabled:hasView});
    for(const [type,label] of [['note','Заметка'],['group','Группа'],['legend','Легенда'],['viewReference','Ссылка на представление'],['image','Изображение']])types.push({kind:'visualNode',type,label,description:label,enabled:hasView});
    if(readSpecializations()) for(const entry of specializationCreationEntries(state,{typeVisible:(kind,type)=>model.typeVisible(kind,type),enabled:hasView})){
      const profile=state.customizationProfiles.find(item=>item.id===entry.profileId);types.push({kind:entry.kind,type:entry.type,profileId:entry.profileId,label:entry.label,description:entry.description,enabled:entry.enabled,category:'Специализации',...(profile.imageAssetId?{iconId:profile.imageAssetId}:{})});
    }
    page=Math.min(page,Math.max(0,Math.ceil(types.length/PAGE)-1));const items=types.slice(page*PAGE,(page+1)*PAGE);
    if(types.length>PAGE) for(const [type,label,enabled] of [['palette-previous',`← Предыдущие · страница ${page+1} из ${Math.ceil(types.length/PAGE)}`,page>0],['palette-next',`Следующие → · всего ${types.length}`,page<Math.ceil(types.length/PAGE)-1]])items.push({kind:'tool',type,label,description:'Страницы полной палитры; поиск относится к текущей странице.',enabled});
    const used=new Set(items.map(item=>item.iconId).filter(Boolean));
    return {...context(),theme:document.documentElement.dataset.theme==='dark'?'dark':'light',types:items.map(item=>({...item,label:item.label.slice(0,200),description:item.description.slice(0,2000)})),icons:state.assets.filter(asset=>used.has(asset.id)).map(({id,mediaType,data})=>({id,mediaType,data}))};
  }
  function paint(){document.body.dataset.paletteDetached=String(detached);trigger.disabled=busy;dock.hidden=!detached;}
  function docked(){detached=false;signature='';generation++;paint();}
  async function open(){if(busy||blocked()||!desktop?.paletteOpen)return;busy=true;paint();const request=context(),ticket=++generation;try{const result=await desktop.paletteOpen(snapshot());if(ticket!==generation)return;if(result?.status!=='detached')throw Error(result?.message||result?.reason||'Окно недоступно.');detached=true;signature='';paint();await refresh();if(!fresh(request))status('Палитра обновлена для текущей модели.');}catch(error){status(`Палитра не открыта: ${error.message}`);}finally{busy=false;paint();}}
  async function refresh(){if(!detached||publishing){publishAgain=detached;return;}publishing=true;try{do{publishAgain=false;const value=snapshot(),next=JSON.stringify(value);if(next===signature)continue;const result=await desktop.palettePublish(value);if(result?.status==='docked'){docked();break;}if(result?.status!=='ok')throw Error(result?.message||result?.reason||'Состояние не принято.');signature=next;}while(publishAgain&&detached);}catch(error){status(`Палитра не обновлена: ${error.message}`);}finally{publishing=false;}}
  function command(request,point=null){if(!fresh(request)||blocked()){status('Инструмент палитры устарел или редактор занят. Начните действие заново.');void refresh();return;}if(request.kind==='tool'&&['palette-next','palette-previous'].includes(request.type)){page+=request.type==='palette-next'?1:-1;page=Math.max(0,page);void refresh();return;}activate(request,point);void refresh();}
  const unsubscribe=desktop?.onPaletteCommand?.(request=>command(request)),undock=desktop?.onPaletteDocked?.(docked);
  canvas.addEventListener('dragover',event=>{if(detached&&Array.from(event.dataTransfer?.types||[]).includes(PALETTE_MIME)){event.preventDefault();event.dataTransfer.dropEffect=blocked()?'none':'copy';}});
  canvas.addEventListener('drop',async event=>{if(!Array.from(event.dataTransfer?.types||[]).includes(PALETTE_MIME))return;event.preventDefault();event.stopImmediatePropagation();if(busy||blocked())return;const point=canvasDropPoint(canvas,event.clientX,event.clientY,window),request=context(),text=event.dataTransfer.getData(PALETTE_MIME);if(!point||text.length>256)return;busy=true;const ticket=++generation;try{const data=JSON.parse(text);if(Object.keys(data).length!==2||typeof data.nonce!=='string'||!Number.isInteger(data.index))throw Error('Некорректное перетаскивание.');const result=await desktop.paletteResolveDrop(data);if(ticket!==generation||!fresh(request))return;busy=false;if(result?.status!=='ok')throw Error(result?.message||result?.reason||'Инструмент устарел.');command(result,point);}catch(error){status(`Инструмент не добавлен: ${error.message}`);}finally{busy=false;paint();}});
  const themeObserver = new window.MutationObserver(() => void refresh()); themeObserver.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
  window.addEventListener('blur',()=>window.setTimeout(()=>void refresh(),0));window.addEventListener('pagehide',()=>{generation++;themeObserver.disconnect();unsubscribe?.();undock?.();});paint();
  return {open,refresh,get transient(){return busy;},get generation(){return generation;}};
}
