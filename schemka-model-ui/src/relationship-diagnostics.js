import { getVerifiedRelationshipDecision, getVerifiedConceptDecision } from '../../schemka-model-profiles/src/index.js';

// Classification and provenance come only from the core's private identity
// boundary. Model fields, serialized results and lookalike evidence cannot
// authorize a diagnostic, and this module contains no relationship matrix.
const SOURCE_URL = 'https://publications.opengroup.org/standards/archimate/c260';
const SUMMARIES = {
  direct: 'ALLOWED · Допустимое сочетание типов концов · прямое разрешение.',
  derived: 'ALLOWED · Допустимо как производная связь. Можно изобразить напрямую.',
  FORBIDDEN: 'FORBIDDEN · Это сочетание типов концов недопустимо для выбранного типа отношения.',
  UNKNOWN: 'UNKNOWN · Сочетание типов концов пока не проверено.',
  concept: 'ALLOWED · Допустимое сочетание категорий концептов по отдельному правилу источника.',
  unresolved: 'UNKNOWN · Область правила для этого сочетания требует уточнения.',
};

function presentationOf(decision) {
  const status = decision?.status ?? 'UNKNOWN';
  const permissionClass = decision?.permissionClass ?? null;
  const kind = decision?.reason === 'source-scope-unresolved' ? 'unresolved' : status === 'ALLOWED' ? decision.sourceEvidence?.basis === 'concept-rule' ? 'concept' : permissionClass : status;
  return { status, permissionClass, summary: SUMMARIES[kind] };
}

/** Present only original core-issued decisions and original assessment rows. */
export function diagnosticPresentation(result) {
  return presentationOf(getVerifiedRelationshipDecision(result) || getVerifiedConceptDecision(result));
}

export function assessmentMessage(result) {
  return `${diagnosticPresentation(result).summary} Нормативная оценка: UNKNOWN.`;
}

function contextLabel(context, key) {
  // Context is an inert label only, never a source of classification/provenance.
  let value;
  try {
    if (context && typeof context === 'object') value = Object.getOwnPropertyDescriptor(context, key)?.value;
  } catch { /* Uninspectable context has no usable label. */ }
  if (typeof value !== 'string' || !value.trim()) return 'не указан';
  const characters = Array.from(value);
  return characters.slice(0, 120).join('') + (characters.length > 120 ? '…' : '');
}

function sourceDescription(evidence) {
  if (!evidence) return 'Для выбранного сочетания нет подтверждённой проверки по таблице источника.';
  if (evidence.basis === 'concept-rule') {
    const table = evidence.table, clauses = evidence.clauses || [];
    return `Источник: ArchiMate 4, C260. Правило категорий концептов; таблица ${table.section}, стр. ${table.printedPage} (PDF ${table.pdfPage}). ` + clauses.map(clause => `§ ${clause.section}, стр. ${(clause.printedPages || []).join(', ')} (PDF ${(clause.pdfPages || []).join(', ')})`).join('; ') + (evidence.qualification ? ` Область правила требует уточнения: ${evidence.qualification.reason}. ${evidence.qualification.resolution}` : '') + ' Это отдельная проверка, не direct/derived классификация обычной матрицы B.5.';
  }
  const { matrix, legend, family, derivedAssertion, qualification } = evidence;
  let text = `Источник: ArchiMate 4, C260. Матрица ${matrix.section}: стр. ${matrix.printedPage} (PDF ${matrix.pdfPage}); `
    + `легенда: стр. ${legend.printedPage} (PDF ${legend.pdfPage}).`;
  if (family) text += ` Семейство ${family.baseRelationship}: § ${family.section}, стр. ${family.printedPage} (PDF ${family.pdfPage}).`;
  if (derivedAssertion) text += ` Правило derived: § ${derivedAssertion.section}, стр. ${derivedAssertion.printedPages.join('–')} `
    + `(PDF ${derivedAssertion.pdfPages.join('–')}).`;
  if (qualification) {
    text += ' Ячейка B.5 проверена: G/g отсутствует. Область общей формулировки composite и уточнения Product/Plateau остаётся неуточнённой: ';
    text += qualification.locators.map(item => `§ ${item.section}, стр. ${item.printedPage} (PDF ${item.pdfPage})`).join('; ') + '.';
    text += ' Это неоднозначность толкования области правила, а не утверждение о противоречии стандарта. '
      + 'Для изменения результата нужно официальное уточнение, применимое erratum или проверенная новая редакция спецификации, явно разрешающая область правила для этих типов. Затем нужны независимая проверка и запись публикации, хеша и точных локаторов. Общего разрешения по умолчанию нет.';
  }
  return text;
}

// The caller obtains this immutable snapshot from the core's registry-bound
// coverage helper. Coverage describes the checked domain, never a decision.
function coverageDescription(coverage) {
  if (!coverage) return 'Покрытие проверки не подтверждено для выбранного профиля. Вне подтверждённого набора результат UNKNOWN; другие отношения этой диагностикой не запрещаются.';
  return `Проверены ${coverage.verifiedPairCount} упорядоченных сочетаний `
    + `(${coverage.sourceTypeIds.length} типов-источников, ${coverage.targetTypeIds.length} типов-целей) `
    + `для ${coverage.relationshipTypeIds.length} обозначений отношений: просмотрены ${coverage.reviewedTripleCount} `
    + `из ${coverage.totalTripleCount}; определено ${coverage.verifiedTripleCount} решений; ${coverage.unknownTripleCount} остаются UNKNOWN. `
    + `${coverage.sourceUnresolvedTripleCount} решений требуют уточнения области источника. `
    + (coverage.excludedTypeIds.length ? `За границами проверки: ${coverage.excludedTypeIds.join(', ')} на любом конце. ` : 'Охвачены все типы элементов текущего каталога. ')
    + 'Состав групп, экземпляры и вложенность не проверяются. Неподдерживаемые запросы остаются UNKNOWN.';
}

/** Update a native details element without replacing its focused summary. */
export function renderAssessmentEvidence(document, host, result, context = {}, coverage = null) {
  let summary = host.querySelector('summary');
  if (summary?.parentNode !== host) {
    summary = document.createElement('summary');
    host.append(summary);
  }
  if (summary.textContent !== 'Основание и границы проверки') summary.textContent = 'Основание и границы проверки';
  let content = host.querySelector('.assessment-evidence-content');
  if (content?.parentNode !== host) {
    content = document.createElement('div');
    content.className = 'assessment-evidence-content';
    host.append(content);
  }
  for (const child of [...host.childNodes]) if (child !== summary && child !== content) host.removeChild(child);

  const decision = getVerifiedRelationshipDecision(result) || getVerifiedConceptDecision(result);
  const presentation = presentationOf(decision);
  const paragraph = text => {
    const node = document.createElement('p');
    node.textContent = text;
    return node;
  };
  const sourceLink = document.createElement('a');
  sourceLink.textContent = 'Официальная публикация C260';
  sourceLink.href = SOURCE_URL;
  const linkParagraph = paragraph('');
  linkParagraph.append(sourceLink);
  const paragraphs = [
    paragraph(`Сочетание: ${contextLabel(context, 'sourceType')} → ${contextLabel(context, 'relationshipType')} → ${contextLabel(context, 'targetType')}.`),
    paragraph(presentation.summary),
    paragraph(sourceDescription(decision?.sourceEvidence)),
  ];
  if (decision?.sourceEvidence?.basis === 'concept-rule') {
    const cell = decision.sourceEvidence.cell;
    paragraphs.push(paragraph(`Категории: ${cell.sourceCategory} → ${cell.targetCategory}; ячейка: ${cell.letters || 'нет'}; сноска: ${cell.footnote || 'нет'}.`));
  } else if (decision) {
    const cell = decision.sourceEvidence.cell;
    paragraphs.push(paragraph(`Проверенная ячейка: столбец (источник) ${cell.sourceType}; строка (цель) ${cell.targetType}. `
      + `Отношение: ${cell.relationshipType}; обозначения ячейки: ${cell.letters || 'нет'}; код семейства: ${cell.relationshipLetter}; `
      + `найденное обозначение: ${cell.matchedLetter ?? 'нет'}; класс таблицы: ${cell.classification}.`));
  }
  const coverageParagraph = paragraph(decision?.sourceEvidence?.basis === 'concept-rule' ? 'Граница проверки: категории Element / Relationship / Junction, ориентированная таблица B.6 и указанные положения. Графовые ограничения junctions проверяются отдельно. Неустановленные области остаются UNKNOWN.' : coverageDescription(coverage));
  coverageParagraph.className = 'assessment-coverage';
  paragraphs.push(linkParagraph, coverageParagraph);
  if (presentation.permissionClass === 'derived') paragraphs.push(paragraph(
    'Класс derived допускает прямое проведение отношения без промежуточной цепочки; это не классификация direct.',
  ));
  paragraphs.push(paragraph('Подтверждённо запрещённое новое отношение создать нельзя. UNKNOWN: допустимость не подтверждена. Уже сохранённые отношения можно просматривать и сохранять. Нормативная оценка всей модели: UNKNOWN.'));
  content.replaceChildren(...paragraphs);
}
