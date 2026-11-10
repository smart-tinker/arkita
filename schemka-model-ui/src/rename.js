/** Pure adapter to validated model commands. It never mutates a snapshot. */
export function renameTarget(state, target) {
  const { kind, id } = target;
  if (kind === 'project' && state.project.id === id) return { value: state.project.name, label: 'Название модели', command: name => ({ type: 'renameProject', name }) };
  const element = kind === 'element' && state.elements.find(item => item.id === id);
  if (element) return { value: element.name, label: 'Название общего элемента', command: name => ({ type: 'renameElement', elementId: id, name }) };
  const junction = kind === 'junction' && state.junctions.find(item => item.id === id);
  if (junction) return { value: junction.name, label: 'Название общего junction', command: name => ({ type: 'renameJunction', junctionId: id, name }) };
  const relationship = kind === 'relationship' && state.relationships.find(item => item.id === id);
  if (relationship) return { value: relationship.label, label: 'Подпись общего Link', command: label => ({ type: 'renameRelationship', relationshipId: id, label }) };
  const view = kind === 'view' && state.views.find(item => item.view.id === id);
  if (view) return { value: view.view.name, label: 'Название представления', command: name => ({ type: 'renameView', viewId: id, name }) };
  if(['visualNode','visualConnector'].includes(kind)){
    const collection=kind==='visualNode'?'visualNodes':'visualConnectors',entry=state.views.find(entry=>(!target.viewId||entry.view.id===target.viewId)&&entry[collection].some(item=>item.id===id)),item=entry?.[collection].find(item=>item.id===id);
    if(item){if(item.style.labelTemplate)throw Error('Подпись вычисляется из шаблона. Измените исходные поля в свойствах или явно снимите шаблон в оформлении.');const note=kind==='visualNode'&&item.kind==='note';return{value:note?item.text:item.name,multiline:note,label:note?'Текст заметки в этом представлении':'Подпись визуального объекта в этом представлении',command:value=>kind==='visualNode'?{type:'updateVisualNode',viewId:entry.view.id,nodeId:id,...(note?{text:value}:{name:value})}:{type:'updateVisualConnector',viewId:entry.view.id,connectorId:id,name:value}};}
  }
  throw new Error('Объект для переименования не найден');
}
export function renameCommand(state, target, value) {
  const descriptor = renameTarget(state, target);
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Имя должно быть строкой не длиннее 8192 символов');
  return value === descriptor.value ? null : descriptor.command(value);
}
