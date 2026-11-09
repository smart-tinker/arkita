import { conceptRecord } from './concepts.js';
import { assessmentMessage, diagnosticPresentation, renderAssessmentEvidence } from './relationship-diagnostics.js';
export { assessmentMessage, diagnosticPresentation, renderAssessmentEvidence };
import { CURRENT_PROFILE, createRegistry, getPresentation, assessProject, evaluateConceptRelationship, getVerifiedRelationshipDecision, getVerifiedConceptDecision, getVerifiedRelationshipCoverage, getVerifiedJunctionAssessment, getVerifiedJunctionIssue } from '../../schemka-model-profiles/src/index.js';

// Trusted built-in registry only. No model field can register an adapter/profile.
export const modelProfiles = createRegistry([CURRENT_PROFILE]);
export const relationshipCoverage = reference => getVerifiedRelationshipCoverage(modelProfiles, reference);
export const creationTypes = (reference, kind) => {
  const profile = modelProfiles.get(reference);
  return (profile?.[kind === 'element' ? 'elementTypes' : kind === 'junction' ? 'junctionTypes' : 'relationshipTypes'] || []).map(item => item.id);
};
export const presentationFor = (reference, kind, type) => getPresentation(modelProfiles, reference, kind, type);

export function relationshipTypeContext(state, relationship, elementsById) {
  return {
    sourceType: conceptRecord(state, relationship?.source)?.type,
    relationshipType: relationship?.type,
    targetType: conceptRecord(state, relationship?.target)?.type,
    sourceKind: relationship?.source?.kind, targetKind: relationship?.target?.kind,
  };
}
export function relationshipAssessment(state, relationship) {
  const context = relationshipTypeContext(state, relationship);
  return evaluateConceptRelationship(modelProfiles, state.project.metamodel, {
    source: { kind: context.sourceKind, type: context.sourceType }, relationshipType: context.relationshipType,
    target: { kind: context.targetKind, type: context.targetType }, scope: 'direct',
  });
}

/** One ordered concept pair, source-issued choices only; no graph preview. */
export function smartRelationshipChoices(state, source, target, visible = () => true) {
  const choices = { allowed: [], unknown: [] };
  for (const type of creationTypes(state.project.metamodel, 'relationship')) {
    if (!visible(type)) continue;
    const decision = relationshipAssessment(state, { type, source, target });
    const verified = getVerifiedRelationshipDecision(decision) || getVerifiedConceptDecision(decision);
    if (verified?.status === 'ALLOWED') choices.allowed.push({ type, decision });
    else if (verified?.status === 'UNKNOWN') choices.unknown.push({ type, decision });
  }
  return choices;
}

export function renderGraphIssues(document, container, report, filter = {}) {
  const verified = getVerifiedJunctionAssessment(report);
  const item = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  if (!verified) { container.append(item('p', 'UNKNOWN · источник графовой диагностики не подтверждён.')); return; }
  const issues = verified.issues.map(getVerifiedJunctionIssue).filter(issue => issue &&
    (!filter.junctionId || issue.junctionIds.includes(filter.junctionId)) &&
    (!filter.relationshipId || issue.relationshipIds.includes(filter.relationshipId)));
  for (const issue of issues) {
    const row = item('div', ''); row.className = 'graph-issue'; row.dataset.assessment = issue.status; row.dataset.ruleId = issue.ruleId;
    row.append(item('p', `${issue.status} · ${issue.ruleId}: ${issue.reason}`));
    const clauses = issue.sourceEvidence?.clauses || [];
    // These issue identities and evidence have already passed the private trust
    // boundary. Safety/completeness conventions are not normative graph rules.
    const localBoundary = ['junction-cycle-scope', 'junction-analysis-coverage', 'junction-terminal-coverage'].includes(issue.ruleId);
    row.dataset.provenance = localBoundary ? 'local-analysis' : 'source-rule';
    if (localBoundary) row.append(item('p', 'Локальная граница анализа: ограничение работы, оценка циклов или полноты охвата. Это консервативное правило редактора, а не нормативный запрет C260 на циклы или размер модели.'));
    if (issue.sourceEvidence?.interpretation) row.append(item('p', issue.sourceEvidence.interpretation));
    row.append(item('p', `${localBoundary ? 'Связанный источник' : 'Источник графового правила'}: C260 · ${clauses.map(clause => `§ ${clause.section}; стр. ${(clause.printedPages || []).join(', ')}`).join('; ') || 'точный локатор в проверенном отчёте'}.`));
    if (issue.witness?.length) row.append(item('p', `Путь: ${issue.witness.join(' → ')}`));
    const source = item('a', 'Официальная публикация C260'); source.href = 'https://publications.opengroup.org/standards/archimate/c260'; row.append(source);
    container.append(row);
  }
  if (!verified.complete) container.append(item('p', `UNKNOWN · проверка графа неполна. Посещено состояний: ${verified.work.visitedStates}; проверено пар: ${verified.work.evaluatedPairs}; ожидает: ${verified.work.pendingStates}.`));
  if (issues.length) container.append(item('p', 'Локальные проверки графа не подтверждают соответствие всей модели ArchiMate: UNKNOWN.'));
}

/** Closed local SVG mappings. Never copy arbitrary descriptor attributes to SVG. */
export function elementRenderer(presentation) {
  const known = presentation?.status === 'KNOWN' && presentation.adapter === 'box' &&
    presentation.shape === 'box' && presentation.marker === 'none' && presentation.token === 'neutral';
  return { className: known ? 'node' : 'node unknown-type', radius: known ? 8 : 0,
    badge: known ? presentation.label : '? · неизвестный тип' };
}
export function relationshipRenderer(presentation) {
  const known = presentation?.status === 'KNOWN' && presentation.adapter === 'open-arrow' &&
    presentation.shape === 'line' && presentation.marker === 'open-arrow' && presentation.token === 'neutral';
  return { className: known ? 'connection' : 'connection unknown-type', marker: known ? 'url(#arrow)' : null };
}

export function installProfileUI({ document, model, openDialog, registry = modelProfiles }) {
  const $ = id => document.getElementById(id);
  const item = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  function refresh() {
    const reference = model.store.snapshot.project.metamodel;
    $('catalog-profile').textContent = 'Каталог: 42 типа элементов · 15 обозначений отношений · 2 типа junctions';
  }
  $('profile-button').addEventListener('click', () => {
    openDialog('profile-dialog');
    const state = model.store.snapshot, revision = model.store.revision;
    const reference = state.project.metamodel;
    const profile = registry.get(reference);
    $('profile-reference').textContent = `${reference.id}@${reference.version} · снимок ревизии ${revision}`;
    $('profile-catalog').replaceChildren(); $('profile-results').replaceChildren();
    $('profile-evidence').textContent = profile
      ? `Декларация источника: ${profile.metadata.source}. Лицензия/права (метаданные): ${profile.metadata.license}. Статус: ${profile.metadata.status}. Эти записи не подтверждают права или соответствие стандарту.`
      : 'Точный профиль и версия отсутствуют в локальном registry. Метаданные и правила не подтверждены.';
    if (profile) {
      for (const type of profile.elementTypes) $('profile-catalog').append(item('li', `Объект: ${type.label} · ${type.id}`));
      for (const type of profile.junctionTypes) $('profile-catalog').append(item('li', `Junction: ${type.label} · ${type.id}`));
      for (const type of profile.relationshipTypes) $('profile-catalog').append(item('li', `Отношение: ${type.label} · ${type.id}`));
    }
    try {
      const report = assessProject(state, registry), coverage = getVerifiedRelationshipCoverage(registry, reference);
      $('profile-structure').textContent = 'Формат: VALID — действующий структурный контракт точного профиля core.';
      // Count only the same verified diagnostics that individual rows display.
      // Synthetic/custom registry rules are not promoted to source permissions.
      const counts = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 }; let verifiedDirect = 0, verifiedDerived = 0;
      const diagnostics = report.relationships.map(result => ({ result, diagnostic: diagnosticPresentation(result) }));
      const elementsById = new Map(state.elements.map(element => [element.id, element]));
      const relationshipsById = new Map(state.relationships.map(relationship => [relationship.id, relationship]));
      for (const { diagnostic } of diagnostics) {
        counts[diagnostic.status]++;
        if (diagnostic.status === 'ALLOWED' && diagnostic.permissionClass === 'direct') verifiedDirect++;
        if (diagnostic.status === 'ALLOWED' && diagnostic.permissionClass === 'derived') verifiedDerived++;
      }
      const status = counts.FORBIDDEN ? 'FORBIDDEN' : counts.UNKNOWN || !report.relationships.length ? 'UNKNOWN' : 'ALLOWED';
      $('profile-local').textContent = `Проверка типов концов: ${status}. ALLOWED: ${counts.ALLOWED} · FORBIDDEN: ${counts.FORBIDDEN} · UNKNOWN: ${counts.UNKNOWN}. Прямых разрешений: ${verifiedDirect}. Подтверждённых производных связей: ${verifiedDerived}.`;
      if (model.view?.view.viewpointId) {
        const visible = new Set(model.view.connections.map(item => item.relationshipId));
        const hidden = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
        for (const { result, diagnostic } of diagnostics) if (!visible.has(result.relationshipId)) hidden[diagnostic.status]++;
        $('profile-local').textContent += ` Включена вся модель. Не показаны в текущей проекции: ALLOWED ${hidden.ALLOWED} · FORBIDDEN ${hidden.FORBIDDEN} · UNKNOWN ${hidden.UNKNOWN}. Граф junctions проверен по полной модели.`;
      }
      for (const { result, diagnostic } of diagnostics) {
        const relation = relationshipsById.get(result.relationshipId);
        const label = Array.from(relation.label || '(без подписи)').slice(0, 90).join('');
        const row = item('li', undefined);
        row.dataset.relationshipId = result.relationshipId; row.dataset.assessment = diagnostic.status;
        row.append(item('p', `${diagnostic.summary} · ${label} · ${result.relationshipId}`));
        const details = item('details', undefined); details.className = 'assessment-evidence';
        renderAssessmentEvidence(document, details, result, relationshipTypeContext(state, relation, elementsById), coverage); row.append(details);
        $('profile-results').append(row);
      }
      if (!report.relationships.length) $('profile-results').append(item('li', 'UNKNOWN · отношений для проверки нет. Отсутствие отношений не является доказательством семантической корректности.'));
      renderGraphIssues(document, $('profile-results'), report.junctionAssessment);
      $('profile-normative').textContent = `Нормативная оценка: ${report.normative.status}. Соответствие ArchiMate всей модели не проверено. Проверен только ограниченный набор сочетаний типов концов.`;
    } catch (error) {
      $('profile-structure').textContent = `Формат не подтверждён: ${error.message}`;
      $('profile-local').textContent = 'Проверка типов концов: UNKNOWN — структурная проверка не завершена.';
      $('profile-normative').textContent = 'Нормативная оценка: UNKNOWN — соответствие стандарту не проверено.';
    }
  });
  return { refresh };
}
