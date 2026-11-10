import { assertJSON,canonicalJSON,parseJSON,record,fail } from '../../schemka-model-core/src/json.js';
import { validateDrawingStyle, CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';

export const WORKSPACE_ORDERS = Object.freeze(['catalog-canvas-palette','catalog-palette-canvas','canvas-catalog-palette','canvas-palette-catalog','palette-catalog-canvas','palette-canvas-catalog']);
export const WORKSPACE_DEFAULTS = Object.freeze({ catalog: true, palette: true, catalogWidth: 240, paletteWidth: 240,
  order: 'catalog-canvas-palette', paletteMode: 'list', paletteSize: 24, paletteFont: 12, hiddenCategories: [] });
const categories = ['elements', 'junctions', 'relationships', 'views'];
/** Local presentation preferences never enter a model, command or native file. */
export function workspacePreferences(value) {
  const result = { ...WORKSPACE_DEFAULTS, hiddenCategories: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const key of ['catalog', 'palette']) if (typeof value[key] === 'boolean') result[key] = value[key];
  for (const [key, min, max] of [['catalogWidth', 180, 420], ['paletteWidth', 180, 420], ['paletteSize', 16, 48], ['paletteFont', 11, 18]]) {
    if (Number.isInteger(value[key]) && value[key] >= min && value[key] <= max) result[key] = value[key];
  }
  if (WORKSPACE_ORDERS.includes(value.order)) result.order = value.order;
  if (['list', 'compact'].includes(value.paletteMode)) result.paletteMode = value.paletteMode;
  if (Array.isArray(value.hiddenCategories)) result.hiddenCategories = categories.filter(key => value.hiddenCategories.includes(key));
  return result;
}

export const GESTURE_DEFAULTS = Object.freeze({ grid: false, snap: false, step: 10, guides: false, mode: 'contain', scope: 'all', autoscroll: true, margin:24 });
export function gesturePreferences(value = {}) { return { grid: value.grid === true, snap: value.snap === true, step: [1, 5, 10, 20, 50, 100].includes(value.step) ? value.step : 10, guides: value.guides === true, mode: value.mode === 'touch' ? 'touch' : 'contain', scope: ['all', 'nodes', 'lines', 'associated'].includes(value.scope) ? value.scope : 'all', autoscroll: value.autoscroll !== false, margin:Number.isInteger(value.margin)&&value.margin>=0&&value.margin<=500?value.margin:24 }; }

export const PREFERENCES_KEY = 'arkita.preferences.v1';
export const PREFERENCES_LIMIT = 65536;
export const PREFERENCE_COLORS = Object.freeze(['common','strategy','business','application','technology','motivation','implementation','ink','border','line','folder','uiBackground']);
export const PREFERENCE_RELATIONSHIPS = Object.freeze([...CURRENT_CATALOG.relationshipTypes]);
export const PREFERENCE_FONTS = Object.freeze(['system','Segoe UI','Arial','Calibri','Tahoma','Verdana','sans-serif']);
export const KEY_DEFAULTS = Object.freeze({save:'Ctrl+KeyS','save-as':'Ctrl+Shift+KeyS',open:'Ctrl+KeyO',new:'Ctrl+KeyN',undo:'Ctrl+KeyZ',redo:'Ctrl+KeyY','fragment-copy':'Ctrl+KeyC','fragment-cut':'Ctrl+KeyX','fragment-paste-reuse':'Ctrl+KeyV','fragment-paste-clone':'Ctrl+Shift+KeyV','model-search-focus':'Ctrl+KeyF','inspector-button':'Ctrl+KeyI','fit-button':'Ctrl+Digit0','help-button':'F1'});
export const PREFERENCE_DEFAULTS = Object.freeze({
  theme:'system',workspace:WORKSPACE_DEFAULTS,gestures:GESTURE_DEFAULTS,
  display:Object.freeze({roundedLines:false,dirtyMarker:'circle',statusBar:true,hints:true,uiFont:'system',diagramFont:'system',diagramFontSize:14,colors:Object.freeze(Object.fromEntries(PREFERENCE_COLORS.map(key => [key,'']))),borderFromFill:false}),
  behavior:Object.freeze({magicOrder:'element-first',proposeNestingCreate:true,proposeNestingReuse:true,proposeNestingMove:true,nestingParentTypes:PREFERENCE_RELATIONSHIPS,nestingChildTypes:PREFERENCE_RELATIONSHIPS,selectionEffect:true,searchTrigger:'input',naturalSort:true,lazyTree:true,treePageSize:100,renameAfterCreate:false,specializations:true,quickAdd:true,viewpointHints:true,pasteMode:'reuse',resizeChildren:'retain',captionWrap:'wrap',deleteWarning:true,viewNames:true,viewLabelTemplate:'${name}',explainTypeChange:true,zoomAtPointer:true,motion:'system',duration:160,animateGraph:true}),
  defaults:Object.freeze({width:210,height:90,nodeStyle:Object.freeze({}),lineStyle:'auto',legend:Object.freeze({sort:'type',columns:1,showRelationships:false,colorScheme:'notation',autoSize:true,rowsPerColumn:0,labels:[],showElements:true,showSpecializations:false,colors:[]})}),
  keys:KEY_DEFAULTS,
});
const bool = value => { if (typeof value !== 'boolean') fail('PREFERENCES','Ожидается переключатель.'); };
const choice = (value,values) => { if (!values.includes(value)) fail('PREFERENCES','Неизвестное значение настройки.'); };
const number = (value,min,max) => { if (!Number.isInteger(value) || value < min || value > max) fail('PREFERENCES','Недопустимое число настройки.'); };
const equal = (a,b) => canonicalJSON(a) === canonicalJSON(b);

/** Preferences are local closed data, never a native-model extension or executable commands. */
export function validatePreferences(value) {
  assertJSON(value); record(value,Object.keys(PREFERENCE_DEFAULTS)); choice(value.theme,['light','dark','system']);
  for (const [key,normalize,baseline] of [['workspace',workspacePreferences,WORKSPACE_DEFAULTS],['gestures',gesturePreferences,GESTURE_DEFAULTS]]) { record(value[key],Object.keys(baseline)); if (!equal(value[key],normalize(value[key]))) fail('PREFERENCES',`Недопустимые настройки ${key}.`); }
  const display = value.display; record(display,Object.keys(PREFERENCE_DEFAULTS.display));choice(display.dirtyMarker,['circle','asterisk']); for (const key of ['roundedLines','statusBar','hints','borderFromFill']) bool(display[key]); for (const key of ['uiFont','diagramFont']) choice(display[key],PREFERENCE_FONTS); number(display.diagramFontSize,6,48);
  record(display.colors,PREFERENCE_COLORS); for (const color of Object.values(display.colors)) if (color !== '' && !/^#[0-9a-f]{6}$/i.test(color)) fail('PREFERENCES','Цвет должен иметь формат #RRGGBB.');
  const behavior = value.behavior; record(behavior,Object.keys(PREFERENCE_DEFAULTS.behavior)); for (const [key,baseline] of Object.entries(PREFERENCE_DEFAULTS.behavior)) if (typeof baseline === 'boolean') bool(behavior[key]);
  for (const [key,values] of [['magicOrder',['element-first','relation-first']],['searchTrigger',['input','enter']],['pasteMode',['reuse','clone']],['resizeChildren',['retain','offset']],['captionWrap',['wrap','ellipsis']],['motion',['system','off','on']]]) choice(behavior[key],values);
  for(const key of ['nestingParentTypes','nestingChildTypes'])if(!Array.isArray(behavior[key])||new Set(behavior[key]).size!==behavior[key].length||behavior[key].some(type=>!PREFERENCE_RELATIONSHIPS.includes(type)))fail('PREFERENCES','Выберите уникальные типы отношений из каталога Arkita 4.');
  if(typeof behavior.viewLabelTemplate!=='string'||behavior.viewLabelTemplate.length>256)fail('PREFERENCES','Подпись вида должна быть строкой до 256 символов.');
  number(behavior.treePageSize,25,500); number(behavior.duration,0,500);
  const drawing = value.defaults; record(drawing,Object.keys(PREFERENCE_DEFAULTS.defaults)); number(drawing.width,40,2000); number(drawing.height,30,2000); validateDrawingStyle(drawing.nodeStyle); if (drawing.nodeStyle.image) fail('PREFERENCES','Ссылка на ресурс принадлежит модели, а не локальным defaults.'); choice(drawing.lineStyle,['auto','direct','orthogonal','rounded']);
  record(drawing.legend,Object.keys(PREFERENCE_DEFAULTS.defaults.legend)); choice(drawing.legend.sort,['type','name']); choice(drawing.legend.colorScheme,['notation','monochrome','pastel']); number(drawing.legend.columns,1,8); bool(drawing.legend.autoSize); bool(drawing.legend.showRelationships);bool(drawing.legend.showElements);bool(drawing.legend.showSpecializations);if(!Array.isArray(drawing.legend.colors)||drawing.legend.colors.length>100)fail('PREFERENCES','Invalid local legend colors');const colorTypes=[...CURRENT_CATALOG.elementTypes,...CURRENT_CATALOG.junctionTypes,...CURRENT_CATALOG.relationshipTypes],seenColors=new Set();for(const row of drawing.legend.colors){record(row,['type','color']);if(!colorTypes.includes(row.type)||seenColors.has(row.type)||!/^#[0-9a-f]{6}$/i.test(row.color))fail('PREFERENCES','Local legend colors need unique types and #RRGGBB colors');seenColors.add(row.type);} number(drawing.legend.rowsPerColumn,0,100);if(!Array.isArray(drawing.legend.labels)||drawing.legend.labels.length>100)fail('PREFERENCES','Invalid legend labels');const labelTypes=[...CURRENT_CATALOG.elementTypes,...CURRENT_CATALOG.junctionTypes,...CURRENT_CATALOG.relationshipTypes],seenLabels=new Set();for(const row of drawing.legend.labels){record(row,['type','label']);if(!labelTypes.includes(row.type)||seenLabels.has(row.type)||typeof row.label!=='string'||!row.label.trim()||row.label.length>256)fail('PREFERENCES','Invalid legend label');seenLabels.add(row.type);}
  record(value.keys,Object.keys(KEY_DEFAULTS)); const used = new Set();
  for (const chord of Object.values(value.keys)) { if (chord === '') continue; if (typeof chord !== 'string' || !/^(?:Ctrl\+)?(?:Shift\+)?(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(chord) || ['Ctrl+KeyW','Ctrl+KeyQ','Ctrl+KeyR','Ctrl+Shift+KeyI','F5','F12'].includes(chord) || used.has(chord)) fail('PREFERENCES_KEYS','Сочетания должны быть допустимы, уникальны и не занимать системные команды.'); used.add(chord); }
  if(new TextEncoder().encode(canonicalJSON({format:'arkita-preferences',version:1,settings:value})).length>PREFERENCES_LIMIT)fail('PREFERENCES_LIMIT','Файл настроек превышает 64 KiB.');
  return value;
}
export function serializePreferences(value) { return canonicalJSON({format:'arkita-preferences',version:1,settings:validatePreferences(structuredClone(value))}); }
export function deserializePreferences(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > PREFERENCES_LIMIT) fail('PREFERENCES_LIMIT','Файл настроек превышает 64 KiB.');
  const envelope = parseJSON(text); record(envelope,['format','version','settings']); if (envelope.format !== 'arkita-preferences' || envelope.version !== 1) fail('PREFERENCES_VERSION','Неизвестная версия настроек.'); const settings=envelope.settings;if(settings?.defaults?.legend)for(const [key,value]of [['rowsPerColumn',0],['labels',[]],['showElements',true],['showSpecializations',false],['colors',[]]])if(!Object.hasOwn(settings.defaults.legend,key))settings.defaults.legend[key]=value;if(settings?.display&&!Object.hasOwn(settings.display,'roundedLines'))settings.display.roundedLines=false;if(settings?.display&&!Object.hasOwn(settings.display,'dirtyMarker'))settings.display.dirtyMarker='circle';if(settings?.display?.colors)for(const key of ['line','folder','uiBackground'])if(!Object.hasOwn(settings.display.colors,key))settings.display.colors[key]='';if(settings?.gestures&&!Object.hasOwn(settings.gestures,'margin'))settings.gestures.margin=24;if(settings&&settings.workspace&&!Object.hasOwn(settings.workspace,'order'))settings.workspace.order=WORKSPACE_DEFAULTS.order;if(settings&&settings.behavior){for(const key of ['viewLabelTemplate','magicOrder','proposeNestingCreate','proposeNestingReuse','proposeNestingMove','nestingParentTypes','nestingChildTypes','selectionEffect'])if(!Object.hasOwn(settings.behavior,key))settings.behavior[key]=structuredClone(PREFERENCE_DEFAULTS.behavior[key]);}return structuredClone(validatePreferences(settings));
}

export function serializeColorScheme(colors) { const next=structuredClone(PREFERENCE_DEFAULTS);next.display.colors=structuredClone(colors);validatePreferences(next);return canonicalJSON({format:'arkita-colors',version:1,colors:next.display.colors}); }
export function deserializePreferenceImport(text,current) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>PREFERENCES_LIMIT)fail('PREFERENCES_LIMIT','Файл настроек превышает 64 KiB.');
  const value=parseJSON(text);if(value.format!=='arkita-colors')return deserializePreferences(text);record(value,['format','version','colors']);if(value.version!==1)fail('PREFERENCES_VERSION','Неизвестная версия цветовой схемы.');for(const key of ['line','folder','uiBackground'])if(value.colors&&!Object.hasOwn(value.colors,key))value.colors[key]='';const next=structuredClone(current);next.display.colors=value.colors;return validatePreferences(next);
}
export function deserializeColorScheme(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>PREFERENCES_LIMIT)fail('PREFERENCES_LIMIT','Файл цветов превышает 64 KiB.');
  const value=parseJSON(text);record(value,['format','version','colors']);if(value.format!=='arkita-colors'||value.version!==1)fail('PREFERENCES_VERSION','Неизвестная цветовая схема.');for(const key of ['line','folder','uiBackground'])if(value.colors&&!Object.hasOwn(value.colors,key))value.colors[key]='';const next=structuredClone(PREFERENCE_DEFAULTS);next.display.colors=value.colors;validatePreferences(next);return structuredClone(value.colors);
}
