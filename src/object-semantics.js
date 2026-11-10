/* Object-edit semantic guards. Captures Mermaid output without changing source. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./group-semantics.js'));
  else root.SkObjectSemantics=factory(root.SkGroupSemantics);
})(typeof globalThis!=='undefined'?globalThis:this,function(GroupSemantics){
  'use strict';

  function plain(value){
    if(value===undefined)return null;
    if(value===null||typeof value!=='object')return typeof value==='function'?null:value;
    if(Object.prototype.toString.call(value)==='[object Map]')return [...value].map(([key,val])=>[key,plain(val)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    if(Array.isArray(value))return value.map(plain);
    const result=Object.create(null);
    for(const key of Object.keys(value).sort())if(key!=='domId'&&typeof value[key]!=='function')result[key]=plain(value[key]);
    return result;
  }
  function same(a,b){return JSON.stringify(plain(a))===JSON.stringify(plain(b))}
  function record(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)}
  function own(value,key){return Object.prototype.hasOwnProperty.call(value,key)}
  function without(value,keys){const result={...value};for(const key of keys)delete result[key];return result}

  function capture(diagram){
    const result=GroupSemantics.capture(diagram),edges=diagram.db.getEdges();
    // Array.map drops Mermaid's global link styles; group styles are stored on
    // vertices even though those vertices are omitted from the ordinary nodes.
    result.edgeDefaults=Object.create(null);
    for(const key of Object.keys(edges))if(!/^(0|[1-9]\d*)$/.test(key))result.edgeDefaults[key]=plain(edges[key]);
    const groupIds=new Set(result.groups.map(([id])=>id));
    result.groupVertices=[...diagram.db.getVertices()].filter(([id])=>groupIds.has(id)).map(([id,value])=>[id,plain(value)]).sort((a,b)=>a[0].localeCompare(b[0]));
    return result;
  }

  function inspect(snapshot){
    if(!record(snapshot)||!Array.isArray(snapshot.nodes)||!Array.isArray(snapshot.groups)||!Array.isArray(snapshot.edges)||!record(snapshot.parents)||!record(snapshot.groupParents))return null;
    const nodes=new Map(),groups=new Map();
    for(const [entries,result]of [[snapshot.nodes,nodes],[snapshot.groups,groups]]){
      for(const entry of entries){
        if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!entry[0]||!record(entry[1])||entry[1].id!==entry[0]||result.has(entry[0]))return null;
        result.set(entry[0],entry[1]);
      }
    }
    if([...nodes.keys()].some(id=>groups.has(id)))return null;
    for(const [items,parents]of [[nodes,snapshot.parents],[groups,snapshot.groupParents]]){
      if(Object.keys(parents).length!==items.size)return null;
      for(const id of items.keys())if(!own(parents,id)||(parents[id]!==null&&!groups.has(parents[id])))return null;
    }
    for(const id of groups.keys()){
      const seen=new Set();let current=id;
      while(current!==null){if(seen.has(current))return null;seen.add(current);current=snapshot.groupParents[current]}
    }
    for(const edge of snapshot.edges)if(!record(edge)||typeof edge.id!=='string'||typeof edge.isUserDefinedId!=='boolean'||(!nodes.has(edge.start)&&!groups.has(edge.start))||(!nodes.has(edge.end)&&!groups.has(edge.end)))return null;
    if(own(snapshot,'groupVertices')){
      if(!Array.isArray(snapshot.groupVertices))return null;
      const seen=new Set();
      for(const entry of snapshot.groupVertices){if(!Array.isArray(entry)||entry.length!==2||!groups.has(entry[0])||seen.has(entry[0])||!record(entry[1])||entry[1].id!==entry[0])return null;seen.add(entry[0])}
    }
    return {nodes,groups};
  }

  function decodedCaption(value){
    // The planner quotes captions and encodes non-simple characters as numeric
    // Mermaid entities. Decode one pass only so literal entity text stays literal.
    const named={quot:'"',apos:"'",amp:'&',lt:'<',gt:'>',nbsp:'\u00a0'};
    return String(value??'').replace(/ﬂ°°(\d+)¶ß|ﬂ°(quot|apos|amp|lt|gt|nbsp)¶ß/g,(whole,digits,name)=>{
      if(name)return named[name];
      const code=Number(digits);
      return Number.isInteger(code)&&code>=0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):whole;
    });
  }

  function captionRest(value,kind){
    const result=without(value,[kind==='group'?'title':'text']);
    // Quoting a formerly bare label changes the parser's representation, not
    // its visual caption. Markdown remains distinct and is never normalized.
    if(result.labelType==='string'||result.labelType==='text')result.labelType='text';
    if(kind==='node'&&!own(result,'type'))result.type='square';
    return result;
  }

  function normalizeDeletedEdges(edges){
    const seen=new Map(),normalized=[];
    for(const edge of edges){
      const pair=JSON.stringify([edge.start,edge.end]),count=(seen.get(pair)||0)+1;
      seen.set(pair,count);
      if(edge.isUserDefinedId===false){
        // This is Tiny 12's actual generated-ID rule. A matching-looking ID
        // alone is insufficient: explicit IDs and missing flags stay protected.
        const expected='L_'+edge.start+'_'+edge.end+'_'+(count===1?0:count);
        if(edge.id!==expected)return null;
        normalized.push(without(edge,['id']));
      }else normalized.push(edge);
    }
    return normalized;
  }

  function validate(before,after,plan){
    const diagnostics=[],reject=message=>diagnostics.push(message+'; действие отменено');
    const beforeInfo=inspect(before),afterInfo=inspect(after);
    if(!beforeInfo||!afterInfo)return {ok:false,diagnostics:['Не удалось надёжно сравнить объекты схемы; действие отменено']};
    if(!record(plan)||plan.ok===false||!record(plan.target)||!['rename','delete'].includes(plan.operation))return {ok:false,diagnostics:['Неизвестный план изменения объекта; действие отменено']};
    const {target,operation}=plan,kind=target.kind;
    if(!['node','group','edge'].includes(kind))return {ok:false,diagnostics:['Неизвестный тип объекта; действие отменено']};
    const chosen=kind==='edge'?before.edges[target.index]:(kind==='node'?beforeInfo.nodes:beforeInfo.groups).get(target.id);
    if((kind==='edge'&&(!Number.isInteger(target.index)||target.index<0))||!chosen)return {ok:false,diagnostics:['Выбранный объект больше не существует; действие отменено']};

    const known=new Set(['nodes','groups','edges','parents','groupParents','groupVertices']);
    for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!known.has(key)&&(!own(before,key)||!own(after,key)||!same(before[key],after[key])))reject('Изменение затронуло '+({classes:'классы',direction:'направление схемы',accessibility:'описание схемы',edgeDefaults:'общие стили связей'}[key]||'другие свойства схемы'));

    const removedIndexes=operation==='delete'?before.edges.flatMap((edge,index)=>kind==='edge'?(index===target.index?[index]:[]):(edge.start===target.id||edge.end===target.id?[index]:[])):[];
    const removed=new Set(removedIndexes);
    let nextIndex=0;
    const indexMap=before.edges.map((edge,index)=>removed.has(index)?null:nextIndex++);
    if(own(plan,'removedEdgeIndexes')&&!same(plan.removedEdgeIndexes,removedIndexes))reject('План удаления не соответствует связям выбранного объекта');
    if(own(plan,'edgeIndexMap')&&!same(plan.edgeIndexMap,indexMap))reject('План изменил порядок связей');
    if(own(plan,'edgeCountBefore')&&plan.edgeCountBefore!==before.edges.length)reject('Количество связей не соответствует исходному плану');
    if(own(plan,'edgeCountAfter')&&plan.edgeCountAfter!==after.edges.length)reject('Количество связей не соответствует результату плана');

    let expectedNodes=before.nodes,expectedGroups=before.groups;
    const expectedParents={...before.parents},expectedGroupParents={...before.groupParents};
    let expectedGroupVertices=before.groupVertices;
    if(operation==='delete'&&kind==='node'){
      expectedNodes=before.nodes.filter(([id])=>id!==target.id);delete expectedParents[target.id];
    }
    if(operation==='delete'&&kind==='group'){
      expectedGroups=before.groups.filter(([id])=>id!==target.id);
      const parent=before.groupParents[target.id];delete expectedGroupParents[target.id];
      for(const id of Object.keys(expectedParents))if(expectedParents[id]===target.id)expectedParents[id]=parent;
      for(const id of Object.keys(expectedGroupParents))if(expectedGroupParents[id]===target.id)expectedGroupParents[id]=parent;
      if(expectedGroupVertices)expectedGroupVertices=expectedGroupVertices.filter(([id])=>id!==target.id);
    }

    function compareEntries(expected,actual,entryKind){
      if(operation==='rename'&&kind===entryKind){
        const beforeTarget=expected.find(([id])=>id===target.id),afterTarget=actual.find(([id])=>id===target.id);
        if(!afterTarget||!same(captionRest(beforeTarget[1],kind),captionRest(afterTarget[1],kind)))reject('Подпись изменила свойства выбранного объекта');
        if(!same(expected.filter(([id])=>id!==target.id),actual.filter(([id])=>id!==target.id)))reject('Изменение затронуло другие '+(entryKind==='node'?'блоки':'группы'));
      }else if(!same(expected,actual))reject('Изменение затронуло '+(entryKind==='node'?'блоки или их свойства':'группы или их свойства'));
    }
    compareEntries(expectedNodes,after.nodes,'node');compareEntries(expectedGroups,after.groups,'group');
    if(!same(expectedParents,after.parents))reject('Изменение затронуло членство блоков');
    if(!same(expectedGroupParents,after.groupParents))reject('Изменение затронуло вложенность групп');
    if(own(before,'groupVertices')!==own(after,'groupVertices')||!same(expectedGroupVertices,after.groupVertices))reject('Изменение затронуло стили или свойства групп');

    if(operation==='delete'){
      const beforeEdges=normalizeDeletedEdges(before.edges),afterEdges=normalizeDeletedEdges(after.edges);
      if(!beforeEdges||!afterEdges)reject('Невозможно надёжно сопоставить идентификаторы связей');
      else if(!same(beforeEdges.filter((edge,index)=>!removed.has(index)),afterEdges))reject('Удаление затронуло другие связи, их идентификаторы или стили');
    }else{
      if(kind==='edge'){
        if(before.edges.length!==after.edges.length||!same(before.edges.map((edge,index)=>index===target.index?captionRest(edge,'edge'):edge),after.edges.map((edge,index)=>index===target.index?captionRest(edge,'edge'):edge)))reject('Подпись изменила связи, их идентификаторы или стили');
      }else if(!same(before.edges,after.edges))reject('Подпись изменила связи или их стили');
      const desired=own(plan,'desiredCaption')?plan.desiredCaption:plan.caption;
      const actual=kind==='edge'?after.edges[target.index]:(kind==='node'?afterInfo.nodes:afterInfo.groups).get(target.id);
      if(typeof desired!=='string'||!actual||decodedCaption(actual[kind==='group'?'title':'text'])!==desired)reject('Mermaid не применил запрошенную подпись');
    }
    return {ok:diagnostics.length===0,diagnostics};
  }
  return {capture,validate};
});
