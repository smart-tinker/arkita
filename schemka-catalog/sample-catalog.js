// Entirely synthetic examples. Never replace this fixture with a private catalog.
export const SAMPLE_CATALOG = {
  schema_version: '0.1.0', catalog_id: 'demo-catalog', status: 'proposed_structure',
  prepared_at: '2026-01-01', source_revision: 'example-only', scope: 'Учебный пример без персональных данных', publication: 'synthetic_only',
  directions: [{ id: 'demo-direction-a', name: 'Рабочее пространство' }, { id: 'demo-direction-b', name: 'Знания и материалы' }],
  handoffs: [],
  services: [
    {
      id: 'demo-service-a', direction_id: 'demo-direction-a', name: 'Документы и схемы',
      scope: 'home', audience: 'Учебный пользователь', value: 'Упорядочить материалы и понять связи между ними',
      included: ['Просмотр вариантов работы', 'Подготовка описания запроса'], excluded: ['Автоматическая отправка', 'Изменение реальных систем'],
      offer_ids: ['demo-offer-a', 'demo-offer-b'], system_ids: ['demo-system-a'],
      support: { entry: 'Не подключено', mode: 'Просмотр', participants: [] },
      availability_of_work: 'Не проверена', current_health: 'unknown', evidence_ids: [], search_terms: ['схема', 'документ', 'обзор'],
      structure_status: 'Учебный пример',
      knowledge: { instruction_ref: null, runbook_ref: null, known_limits: ['Это синтетический каталог.', 'Выбор запроса не разрешает никаких действий.'] }
    },
    {
      id: 'demo-service-b', direction_id: 'demo-direction-b', name: 'Библиотека знаний',
      scope: 'home', audience: 'Учебный пользователь', value: 'Найти описание материала и условия его подготовки',
      included: ['Описание результата', 'Список необходимых входных данных'], excluded: ['Доступ к чужим хранилищам'],
      offer_ids: ['demo-offer-c'], system_ids: ['demo-system-b'],
      support: { entry: 'Не подключено', mode: 'Просмотр', participants: [] },
      availability_of_work: 'Не проверена', current_health: 'unknown', evidence_ids: [], search_terms: ['знания', 'справка', 'материал'],
      structure_status: 'Учебный пример',
      knowledge: { instruction_ref: null, runbook_ref: null, known_limits: ['Рабочие инструкции не импортированы.'] }
    }
  ],
  offers: [
    { id: 'demo-offer-a', service_id: 'demo-service-a', name: 'Обзор структуры', scope: 'home', result: 'Краткое описание и список вопросов', request_ids: ['demo-request-a'], request_types: ['info', 'service_request'], historical_only: false, automatic_fulfilment: false },
    { id: 'demo-offer-b', service_id: 'demo-service-a', name: 'Подготовка схемы', scope: 'home', result: 'Схема, согласованная с исходным описанием', request_ids: ['demo-request-b'], request_types: ['info', 'service_request'], historical_only: false, automatic_fulfilment: false },
    { id: 'demo-offer-c', service_id: 'demo-service-b', name: 'Карточка материала', scope: 'home', result: 'Описание назначения и ограничений материала', request_ids: ['demo-request-c'], request_types: ['info', 'service_request'], historical_only: false, automatic_fulfilment: false }
  ],
  requests: [
    { id: 'demo-request-a', service_id: 'demo-service-a', offer_id: 'demo-offer-a', name: 'Разобрать описание', type: 'info', allowed_types: ['info', 'service_request'], type_is_suggestion: true, required_inputs: ['Исходное описание', 'Цель обзора'], completion_criteria: ['Структура описана', 'Неясные места отмечены'], handling: { entry: 'Не подключено', dispatch: false, changes_authorized_by_selection: false }, scope: 'home' },
    { id: 'demo-request-b', service_id: 'demo-service-a', offer_id: 'demo-offer-b', name: 'Описать нужную схему', type: 'service_request', allowed_types: ['info', 'service_request'], type_is_suggestion: true, required_inputs: ['Состав объектов', 'Известные связи'], completion_criteria: ['Объекты перечислены', 'Предположения помечены'], handling: { entry: 'Не подключено', dispatch: false, changes_authorized_by_selection: false }, scope: 'home' },
    { id: 'demo-request-c', service_id: 'demo-service-b', offer_id: 'demo-offer-c', name: 'Описать материал', type: 'info', allowed_types: ['info', 'service_request'], type_is_suggestion: true, required_inputs: ['Назначение материала'], completion_criteria: ['Назначение и ограничения понятны'], handling: { entry: 'Не подключено', dispatch: false, changes_authorized_by_selection: false }, scope: 'home' }
  ],
  systems: [
    { id: 'demo-system-a', name: 'Учебный редактор', kind: 'application', fact_status: 'Синтетический пример', current_health: 'unknown', note: 'Не утверждает наличие или состояние реальной системы.' },
    { id: 'demo-system-b', name: 'Учебная библиотека', kind: 'repository', fact_status: 'Синтетический пример', current_health: 'unknown', note: 'Подключение к хранилищу отсутствует.' }
  ],
  view_links: [
    { id: 'demo-link-a', from: { type: 'service', id: 'demo-service-a' }, to: { type: 'system', id: 'demo-system-a' }, relation: 'uses', assertion_status: 'Синтетический пример', architecture_element_id: null, binding_status: 'unresolved' },
    { id: 'demo-link-b', from: { type: 'service', id: 'demo-service-b' }, to: { type: 'system', id: 'demo-system-b' }, relation: 'uses', assertion_status: 'Синтетический пример', architecture_element_id: null, binding_status: 'unresolved' }
  ],
  evidence: [], capabilities: [{ id: 'demo-capability-a', status: 'not_connected', purpose: 'Исполнение запросов не подключено' }]
};
