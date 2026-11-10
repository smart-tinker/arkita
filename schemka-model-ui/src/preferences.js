import { applyViewRouter } from './view-routing.js';
import { canonicalJSON,fail } from '../../schemka-model-core/src/json.js';
import { PREFERENCES_KEY,PREFERENCE_DEFAULTS,serializePreferences,deserializePreferences,validatePreferences,workspacePreferences,gesturePreferences } from '../../schemka-model-io/src/preferences-profile.js';
export * from '../../schemka-model-io/src/preferences-profile.js';
const defaults=()=>structuredClone(PREFERENCE_DEFAULTS);
const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);

/** One authority; old controls are adapters, and old storage keys are read once on migration. */
export function createLocalPreferences(storage,{onStorageError = () => {},baseSettings = null} = {}) {
  const baseline=baseSettings===null?defaults():structuredClone(validatePreferences(baseSettings));
  let state = structuredClone(baseline), revision = 0; const listeners = new Set();
  try {
    const current = storage.getItem(PREFERENCES_KEY);
    if (current !== null) state = deserializePreferences(current);
    else {
      let migrated=false;const theme = storage.getItem('schemka-model-theme'); if (['light','dark','system'].includes(theme)) {state.theme = theme;migrated=true;}
      for (const [key,path,normalize] of [['workspace','arkita.workspace.v1',workspacePreferences],['gestures','arkita.diagram-gestures',gesturePreferences]]) { try { const text = storage.getItem(path); if (text) {state[key] = {...baseline[key],...normalize({...baseline[key],...JSON.parse(text)})};migrated=true;} } catch { /* A corrupt legacy group does not discard unrelated preferences. */ } }
      if(baseSettings===null||migrated)storage.setItem(PREFERENCES_KEY,serializePreferences(state));
    }
  } catch (error) { onStorageError(error); }
  function replace(value,persist = true) {
    const next = structuredClone(validatePreferences(value)), changed = Object.keys(next).filter(key => !equal(state[key],next[key])); if (!changed.length) return false;
    state = next; revision++; let persisted = true; try { if (persist) storage.setItem(PREFERENCES_KEY,serializePreferences(state)); } catch (error) { persisted = false; onStorageError(error); }
    const errors = []; for (const listener of listeners) { try { listener(structuredClone(state),changed); } catch (error) { errors.push(error.message || String(error)); } } return {persisted,changed,errors};
  }
  return Object.freeze({get defaultsSnapshot(){return structuredClone(baseline);},get snapshot() {return structuredClone(state);},get revision() {return revision;},get(group) { if (!Object.hasOwn(state,group)) fail('PREFERENCES','Неизвестная группа.'); return structuredClone(state[group]); },replace(value) {return replace(value);},adopt(value) {return replace(value,false);},update(group,value) { if (!Object.hasOwn(state,group)) fail('PREFERENCES','Неизвестная группа.'); return replace({...state,[group]:value}); },reset() {return replace(baseline);},subscribe(listener) {listeners.add(listener);return () => listeners.delete(listener);}});
}

/** Local font/border defaults are projected; explicit saved drawing values always win. */
export function preferenceDrawingStyle(style,settings) {
  const local = {}; if (settings.display.diagramFont !== 'system') local.fontFamily = settings.display.diagramFont;
  if (settings.display.diagramFontSize !== 14) local.fontSize = settings.display.diagramFontSize;
  if (settings.display.borderFromFill && !Object.hasOwn(style,'stroke')) local.strokeFromFill = true;
  return {...local,...style};
}
export function applyPreferencePresentation(document,window,settings) {
  const root = document.documentElement, body = document.body; body.dataset.preferenceStatus = String(settings.display.statusBar); body.dataset.preferenceHints = String(settings.display.hints);
  body.dataset.preferenceMotion = String(settings.behavior.motion === 'on' || settings.behavior.motion === 'system' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const family = settings.display.uiFont === 'system' ? 'Segoe UI, system-ui, sans-serif' : settings.display.uiFont; root.style.setProperty('--preference-ui-font',family); body.style.fontFamily = family;
  const custom={line:'--link',folder:'--preference-folder-color',uiBackground:'--surface'};for (const [key,value] of Object.entries(settings.display.colors)) { const property=custom[key]??`--notation-${key}`;if (value) root.style.setProperty(property,value); else root.style.removeProperty(property); }
}


/** Effective projection only: model arrays, geometry and explicit saved styles stay exact. */
export function applyPreferenceView(view,settings) {
  view=applyViewRouter(view);
  const display = settings.display, typography = display.diagramFont !== 'system' || display.diagramFontSize !== 14;
  if (!typography && !display.borderFromFill && !display.roundedLines && settings.behavior.captionWrap === 'wrap') return view;
  const nodes = items => items.map(item => ({...item,style:preferenceDrawingStyle(item.style,settings)}));
  const lines = items => items.map(item => {const style = {...item.style};if(display.roundedLines&&!Object.hasOwn(style,'lineStyle'))style.lineStyle='rounded';if (display.diagramFont !== 'system' && !Object.hasOwn(style,'fontFamily')) style.fontFamily=display.diagramFont;if(display.diagramFontSize!==14&&!Object.hasOwn(style,'fontSize'))style.fontSize=display.diagramFontSize;return {...item,style};});
  return {...view,captionMode:settings.behavior.captionWrap,occurrences:nodes(view.occurrences),visualNodes:nodes(view.visualNodes),connections:lines(view.connections),visualConnectors:lines(view.visualConnectors)};
}

export function specializationCreationEntries(state,{typeVisible=()=>true,enabled=true}={}) {
  return (state.customizationProfiles ?? []).filter(profile=>profile.purpose==='specialization').flatMap(profile=>profile.targets.map(target=>({profileId:profile.id,type:target.type,kind:target.kind,label:`${profile.name} · ${target.type}`,description:`${target.kind} ${target.type}. Новый концепт с отдельным ID и профилем ${profile.id}; значения по умолчанию.`,enabled:Boolean(enabled&&typeVisible(target.kind,target.type)),buttonId:`create-specialization-${profile.id}-${target.kind}-${target.type}`})));
}


/** Persist local creation defaults once; updates and loaded drawings remain untouched. */
export function prepareCreationCommand(command,settings) {
  const nodes = ['createElementAndOccurrence','createJunctionAndOccurrence','addOccurrence','createVisualNode'];
  const lines = ['createRelationshipAndConnection','addConnection','createVisualConnector'];
  if (!nodes.includes(command.type) && !lines.includes(command.type)) return command;
  const defaults = settings.defaults, style = nodes.includes(command.type) ? {...defaults.nodeStyle,...command.style} : {...(defaults.lineStyle === 'auto' ? {} : {lineStyle:defaults.lineStyle}),...command.style};
  const next = {...command,style};
  if (command.type === 'createVisualNode' && command.kind === 'legend') {next.legend = {...defaults.legend,...command.legend};if(next.legend.rowsPerColumn===0)delete next.legend.rowsPerColumn;if(next.legend.labels?.length===0)delete next.legend.labels;if(next.legend.colors?.length===0)delete next.legend.colors;if(next.legend.showElements===true)delete next.legend.showElements;if(next.legend.showSpecializations===false)delete next.legend.showSpecializations;}
  return next;
}

/** Literal substitutions only; unknown or unfinished expressions fall back to the saved view name. */
export function viewUsageLabel(usage,settings) {
 const fallback=usage.viewName||'(без названия)';if(settings.behavior.viewNames===false)return usage.viewId;
 const values={name:fallback,path:usage.folderPath||'',id:usage.viewId},template=settings.behavior.viewLabelTemplate;let invalid=false;
 const text=template.replace(/\$\{([^}]*)\}/g,(_match,key)=>{if(!Object.hasOwn(values,key)){invalid=true;return '';}return values[key];});return invalid||text.includes('${')||!text.trim()?fallback:text;
}
