# Корпус Arkita: анализ, обмен, отчёты, Canvas и настройки

Исходная точка: [Archi User Guide 5.10.0](https://www.archimatetool.com/downloads/archi/Archi%20User%20Guide.pdf), печатные страницы 90–175. Прочитаны все страницы этого диапазона, включая пояснения ограничений; для Properties Manager дополнительно прочитан §User Properties85–89. Номер печатной страницы равен индексу PDF при отсчёте с нуля; титульная страница имеет индекс0.

**173 карточки; 96 из 96 записей оглавления сопоставлены карточкам или мотивированным исключениям.** Полнота карты оглавления не означает реализованность функций в Arkita и не равна нормативной совместимости ArchiMate.

Файл-источник получен 18.10.2026; SHA-256: `1c80af5ac31b1bd2057b2494907c9071cfcec12a1e141773b5fadf6f015f2731`. [Официальная история версий](https://www.archimatetool.com/version-history/) дополнительно подтверждает zoom Visualiser и Markdown в HTML отчётах5.10. [Индекс плагинов](https://www.archimatetool.com/plugins/) проверен отдельно, но не подменяет полные руководства coArchi/jArchi.

Карточки формулируют требования к Arkita своими словами. Критерии приёмки — наши проверяемые условия, а не обещания исходного продукта. Дополнительные улучшения явно помечены origin. Названия разделов оставлены на английском для точного поиска источника.

## Как читать классификацию

- **Independent** — механика или продуктовая способность, не зависящая от правил3.2.
- **Adapt** — нужна карта в правила, профиль или формат совместимости Arkita4.
- **Exclude** — конкретный механизм не переносится; причина сохранена.

**Coverage:** `implemented-in-code` — пользовательская возможность подключена в поставляемом коде в пределах текущего контракта; `partial` — указан работающий фрагмент и конкретный остаток; `absent` — отсутствие подтверждено меню/API/схемой и поиском по поставляемым модулям; `unverified` — по исходникам нельзя подтвердить критерий; `excluded` — мотивированное исключение, а не отсутствующая функция. Это не результаты новой Windows приёмки. Нативные данные, Undo, профили, диагностика и Git уже существуют; их нужно расширять через текущие контракты.

Проверен неизменяемый снимок upstream `d075e67c7ca6e7720f537102e245a59f53808b32`: прочитаны меню, entrypoints, IPC, native schema и API; целевые поиски охватывают все 75 поставляемых файлов. Legacy Mermaid root `src/`, site и catalog не считаются Arkita desktop. Машиночитаемые статусы, наблюдения по каждой карточке и пределы проверки: [coverage.json](coverage.json).

Общие правила для модельных изменений: проверка кандидата до commit, отсутствие частичного результата при отмене, осмысленная атомарная Undo, сохранение устойчивых ID и проверяемый save/load. Настройки UI и навигация не должны создавать модельные Undo. Для новых элементов интерфейса обязательны клавиатура, focus и читаемые состояния; Windows native/DPI проверяются отдельно.

## Решения, от которых зависят реализации

- **ArchiMate4 truth source:** All Adapt cards reuse the current bounded profile/rule system. Do not import a3.2 relation matrix, specialization semantics, viewpoints or implicit nesting unchanged.
- **Properties representation:** Current properties are a unique-key JSON map. Archi allows repeated keys and ordering. Preserve current contract unless an explicit versioned migration is approved; imports must report unrepresentable repeats. Global manager is one card shared with §88.
- **Shared identity and transaction history:** Navigation, generated views, CSV/merge, templates and copying must share existing concept/drawing identity and command validation. Pure navigation/settings must not create model Undo entries.
- **Images and package schema:** Embedded resources affect native files, directories, Git layout, version compatibility and size limits. Design one resource contract before Canvas/templates/profile icons; do not introduce parallel asset stores.
- **Multiple documents:** Current renderer has one model/session. Multiple open models need an explicit session/Undo/path ownership design, not a second hidden controller.
- **Report visibility:** Visual navigation filtering and actual data exclusion are different capabilities. Guide masking leaves data available by direct URL; do not claim a filtered report excludes its bytes.
- **Compatibility formats:** Pin Exchange/CSV/Archi versions and loss policies. No automatic3.2→4 equivalence or unknown external schema support is assumed.
- **Additional product areas:** Canvas/Sketch, scripting/extensions and customizable reports remain classified candidates. Full corpus inclusion is not a promise to ship every mode in the next iteration.
- **Settings and portability:** Specify local UI defaults versus saved per-model values. Layout, fonts, images and reports must be reviewed on Windows DPI targets by local Codex.
- **Plugins boundary:** Guide175 documents installation management, not full coArchi/jArchi API. Official index was checked; dedicated plugin documents need a separately pinned extraction. Existing Arkita Git must be treated as baseline, not proposed again as absent.

## Карточки

### navigation

#### A-ADV-001 — Навигатор связей всей модели

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Navigator Window, печатные стр.90–92.

**Поведение Arkita:** Показывать связи выбранного концепта независимо от открытого представления; переключать входящее и исходящее направление.

**Приёмка:**

1. Концепты и связи вне текущего view также находятся; одинаковые имена различаются по ID.
2. Цикл и связь со связью не приводят к бесконечному раскрытию; направление и тип читаются без угадывания.

**Факт по коду:** В renderCatalog/read inspector есть общий список концептов и текст концов отношения. Навигации по смежным отношениям выбранного концепта, направлений обхода и раскрытия всего графа нет; совпадения adjacency относятся к внутренней диагностике junctions.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js).

#### A-ADV-002 — Переход к соседу, назад и к исходному концепту

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Navigator Window, печатные стр.90–91.

**Поведение Arkita:** Делать выбранного соседа корнем навигации с отдельной историей Back/Home.

**Приёмка:**

1. Back восстанавливает предыдущий корень и положение; Home возвращает к исходному.
2. Переходы не меняют модель, dirty и историю редактирования.

**Зависимости:** A-ADV-001.

**Факт по коду:** Controller хранит активный и предыдущий view, но не корень навигатора и историю переходов по концептам. Команд Back/Home для анализа в меню и обработчиках нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js).

#### A-ADV-003 — Закрепление корня навигации

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Navigator Window, печатные стр.90–92.

**Поведение Arkita:** Следовать выбору в модели и view, пока пользователь не закрепил текущий корень.

**Приёмка:**

1. При pin смена выделения не меняет корень; снятие pin восстанавливает понятное следование.
2. Удаление закреплённого объекта показывает пустое состояние, без обращения к старому ID.

**Зависимости:** A-ADV-001.

**Факт по коду:** Выбор синхронизирует дерево, холст и инспектор. Отдельного закрепляемого корня анализа или pin-состояния нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js).

#### A-ADV-004 — Добавление найденного концепта в представление

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §The Navigator Window, печатные стр.92.

**Поведение Arkita:** Перетаскивать или добавлять кнопкой найденные элементы и связи как использования существующих концептов.

**Приёмка:**

1. Создаются новые drawing ID, существующий concept ID сохраняется.
2. Связь добавляется только с разрешённым набором видимых концов; отмена не оставляет частичных рисунков.

**Зависимости:** A-ADV-001.

**Факт по коду:** Переиспользование концепта уже работает через дерево, инспектор и внутреннее перетаскивание: addOccurrence/addConnection создают рисунок существующего concept ID и проходят store. Добавление из результатов Navigator отсутствует вместе с этим Navigator.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-ui/src/typed-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/typed-actions.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js).

#### A-ADV-005 — Граф окрестности выбранного концепта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window, печатные стр.93–94.

**Поведение Arkita:** Показывать временный граф соседей с выделенным центром и переходами Back/Home.

**Приёмка:**

1. Элемент, отношение и циклические структуры отображаются по устойчивым ID без дубликатов.
2. Перестройка аналитического графа не меняет сохранённые layout и Undo модели.

**Зависимости:** A-ADV-001.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-006 — Глубина графа окрестности

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Depth, печатные стр.93.

**Поведение Arkita:** Давать ограничить число переходов от корня и показывать объём результата.

**Приёмка:**

1. Глубина 1 включает только непосредственных соседей; увеличение не теряет уже найденные.
2. Циклы, большие графы и отмена построения завершаются предсказуемо.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-007 — Фильтр окрестности по viewpoint

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Viewpoint Filter, печатные стр.93.

**Поведение Arkita:** Фильтровать аналитический граф по правилам выбранного Arkita4 viewpoint.

**Приёмка:**

1. Правила берутся из текущего профиля Arkita4, а не из списка типов3.2.
2. Сброс показывает полный граф; фильтр не удаляет данные и явно отмечает скрытие корня.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-008 — Фильтр окрестности по типам элементов

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Element Filter, печатные стр.93.

**Поведение Arkita:** Выбирать интересующие типы элементов из активного каталога модели.

**Приёмка:**

1. Фильтр работает по type ID и не смешивает подписи с одинаковыми именами.
2. Режим «Все» восстанавливает результат без редактирования модели.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-009 — Фильтр окрестности по типам отношений

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Relationship Filter, печатные стр.94.

**Поведение Arkita:** Выбирать типы отношений для аналитического графа.

**Приёмка:**

1. Отображаются только выбранные отношения и нужные им концы.
2. Смена фильтра сохраняет понятный корень; пустой результат объясняется.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-010 — Входящие, исходящие или все отношения в графе

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Direction, печатные стр.94.

**Поведение Arkita:** Переключать направление обхода без изменения направления самих связей.

**Приёмка:**

1. Incoming и Outgoing проверяются на ориентированном тестовом графе, Both даёт их объединение.
2. Самоссылки и отношения к отношениям не пропадают.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-011 — Ортогональная маршрутизация аналитического графа

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Manhattan Router, печатные стр.94.

**Поведение Arkita:** Предлагать прямые и ортогональные линии для временного графа.

**Приёмка:**

1. Переключение не меняет модельные концы и направления.
2. Маршруты и подписи остаются различимыми после масштабирования.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-012 — Повторная автоматическая раскладка окрестности

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Other Options, печатные стр.94.

**Поведение Arkita:** Перестраивать расположение узлов аналитического графа по явной команде.

**Приёмка:**

1. Все узлы остаются доступны; повторный расчёт не меняет концепты.
2. При отмене расчёта сохраняется предыдущий законченный результат.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-013 — Экспорт аналитического графа в изображение

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Other Options, печатные стр.94.

**Поведение Arkita:** Сохранять отображаемую окрестность с применёнными фильтрами и подписями.

**Приёмка:**

1. Результат включает полный граф без обрезки и читаемую кириллицу.
2. Отмена выбора файла и ошибка записи не меняют модель.

**Зависимости:** A-ADV-005.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-014 — Копирование аналитического графа как изображения

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window / Other Options, печатные стр.94.

**Поведение Arkita:** Передавать изображение окрестности в системный буфер обмена.

**Приёмка:**

1. Вставка в обычное Windows приложение даёт целое изображение.
2. Отказ clipboard API виден пользователю и не объявляется успехом.

**Зависимости:** A-ADV-013.

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-015 — Масштаб аналитического графа

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Visualiser Window, печатные стр.93–94.

**Поведение Arkita:** Предоставить масштабирование и возврат к обзорному масштабу для окрестности.

**Приёмка:**

1. Масштаб изменяется монотонно в заданных пределах, фокус не теряется.
2. После изменения DPI граф и подписи остаются доступны.

**Зависимости:** A-ADV-005.

**Происхождение решения:** guide-context + official Version History 5.10 (zoom explicitly listed there).

**Факт по коду:** В поставляемом UI есть только редактор текущего view. Отдельного временного графа окрестности, его камеры, фильтров, глубины, раскладки, экспорта и image clipboard нет. Backend junction-graph выполняет нормативную диагностику; viewport обслуживает обычный view, а navigator используется как браузерный clipboard API. Эти механизмы не считаются Visualiser.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-016 — Контекстная справка о типе, объекте и viewpoint

**Класс:** Adapt. **Покрытие:** partial.

**Источник:** Guide5.10 §The Hints Window, печатные стр.95.

**Поведение Arkita:** Показывать краткое назначение выбранного объекта или инструмента на основе документации Arkita4.

**Приёмка:**

1. Справка согласована с выбранным type/profile ID и версией правил.
2. Недоказанное правило не выдаётся за нормативное; текст доступен с клавиатуры.

**Факт по коду:** Инспектор показывает выбранный type/profile ID, свойства, документацию и объяснения доказанных проверок ArchiMate 4. Общей контекстной справки о назначении каждого типа, инструмента и viewpoint, следующей выбору, пока нет.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/viewpoint-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewpoint-ui.js).

#### A-ADV-017 — Закрепление контекстной справки

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Hints Window, печатные стр.95.

**Поведение Arkita:** Позволять сравнивать справку с другими объектами, закрепив её содержимое.

**Приёмка:**

1. Смена выделения не заменяет закреплённый текст.
2. Состояние pin видно; снятие закрепления снова следует текущему выбору.

**Зависимости:** A-ADV-016.

**Факт по коду:** Инспектор перерисовывается при выборе; отдельного закрепления содержимого справки нет ни в UI, ни в состоянии controller.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js).

#### A-ADV-018 — Миникарта представления

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Outline Window, печатные стр.96.

**Поведение Arkita:** Показывать всю диаграмму, границы текущей камеры и управлять камерой перетаскиванием.

**Приёмка:**

1. Перетаскивание рамки открывает ожидаемую область на больших и смещённых диаграммах.
2. Миникарта синхронизируется при zoom, resize и смене view, не меняя layout.

**Факт по коду:** Камера умеет pan/zoom/fit/reveal. Второго обзорного renderer, рамки камеры и обработчиков взаимодействия миникарты нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js).

### analysis

#### A-ADV-019 — Создание представления из выбранных элементов

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Generate a View from Elements, печатные стр.98.

**Поведение Arkita:** Создавать view вокруг выбранных концептов с именем, viewpoint и выбором прямых либо всех связей между добавленными узлами.

**Приёмка:**

1. Концепты переиспользуются, рисунки получают новые ID; viewpoint применяет правила Arkita4.
2. Preview показывает исключения; создание и Undo охватывают всё новое view одним действием.

**Факт по коду:** Есть создание пустого view и полное duplicateView с переиспользованием концептов. Генерации view из выбранного набора/соседей, выбора охвата отношений и preview такой операции нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js).

#### A-ADV-020 — Глобальный менеджер пользовательских свойств

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Properties Manager; User Properties, печатные стр.99; 88.

**Поведение Arkita:** Показывать ключи свойств и число использований; массово переименовывать или удалять выбранный ключ во всей модели.

**Приёмка:**

1. Счётчик учитывает всех владельцев, поддержанных текущим unique-key контрактом Arkita; preview перечисляет затронутые записи. Несовместимые повторные ключи внешнего источника требуют отчёта или отказа, а не неявной смены формата.
2. Коллизия имён обрабатывается явно; отмена не меняет данные, Undo восстанавливает имена, значения и порядок.

**Факт по коду:** Редактор свойств работает с одним концептом через updateConceptProperties. Нет общего индекса ключей, количества владельцев, массового rename/delete и предварительного списка влияния. Текущий формат хранит properties как unique-key JSON object; повторные ключи отвергаются, а не поддерживаются скрыто. Это одна фича Properties Manager, включая перекрёстную ссылку из User Properties.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/object-properties.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/object-properties.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-021 — Каталог специализаций и количество применений

**Класс:** Adapt. **Покрытие:** partial.

**Источник:** Guide5.10 §Specializations Manager / Using the Specializations Manager, печатные стр.100–101.

**Поведение Arkita:** Управлять специализациями в рамках существующего customization/profile контракта Arkita4.

**Приёмка:**

1. Создание и переименование проверяют допустимый базовый тип и уникальность в принятой области.
2. Количество использований вычисляется по concept ID, а не по количеству рисунков.

**Факт по коду:** Manager уже создаёт и редактирует model-owned профили с purpose specialization, конкретными targets и числом применений по концептам. Типы и ID валидируются. Имена проверяются на непустоту, но отдельной политики одноимённых специализаций нет; уточнение области уникальности не должно вводить правило Archi автоматически.

**Доказательства:** [schemka-model-ui/src/customization-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/customization-ui.js), [schemka-model-core/src/customization.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/customization.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-022 — Применение специализации к концепту

**Класс:** Adapt. **Покрытие:** implemented-in-code.

**Источник:** Guide5.10 §Specializations Manager / Using the Specializations Manager, печатные стр.101.

**Поведение Arkita:** Назначать совместимую специализацию через инспектор концепта.

**Приёмка:**

1. Несовместимый базовый тип не применяется; существующие ограничения Arkita4 сохраняются.
2. Все использования показывают обновлённые данные; Undo и сохранение восстанавливают назначение.

**Зависимости:** A-ADV-021.

**Факт по коду:** Инспектор выбирает только подходящие не назначенные профили; store повторно проверяет concrete target, типы значений и существование определения. Применение и снятие изменяют общий концепт, обновляют его использования, сериализуются и входят в Undo. Это существующий контракт Arkita 4; одно определение нельзя назначить дважды, но запрет нескольких разных специализаций из Archi не переносится.

**Доказательства:** [schemka-model-ui/src/customization-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/customization-ui.js), [schemka-model-core/src/customization.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/customization.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js).

#### A-ADV-023 — Удаление специализации с показом влияния

**Класс:** Adapt. **Покрытие:** partial.

**Источник:** Guide5.10 §Specializations Manager / Using the Specializations Manager, печатные стр.101.

**Поведение Arkita:** Перед удалением показать связанные концепты и выбранную политику снятия назначения.

**Приёмка:**

1. Не остаётся висячих ссылок; базовые концепты и отношения не удаляются.
2. Отмена и Undo восстанавливают специализацию, её атрибуты и назначения.

**Зависимости:** A-ADV-021.

**Факт по коду:** Уже есть безопасная политика: используемый профиль удалять нельзя; UI перечисляет concept ID и требует явно снять применения в инспекторе. Неиспользуемое определение удаляется после подтверждения через Undo-команду. Единого preview/пакета снятия всех применений вместе с удалением нет; существующий запрет не является ошибкой и не требует автоматического каскадного удаления.

**Доказательства:** [schemka-model-ui/src/customization-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/customization-ui.js), [schemka-model-core/src/customization.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/customization.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-024 — Иконка специализации

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Specializations Manager / Using the Specializations Manager, печатные стр.101.

**Поведение Arkita:** Назначать изображение специализации с сохранением узнаваемой базовой нотации Arkita4.

**Приёмка:**

1. Показывается различие между унаследованной и индивидуальной иконкой.
2. Удаление изображения не повреждает другие его использования; недопустимые типы объясняются.

**Зависимости:** A-ADV-021, A-ADV-103.

**Факт по коду:** Профили содержат name/purpose/targets/attributes, но не изображение; применение меняет подпись специализации. В нативном формате и UI нет ресурса иконки, наследования изображений или индивидуального image override.

**Доказательства:** [schemka-model-ui/src/customization-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/customization-ui.js), [schemka-model-core/src/customization.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/customization.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-025 — Запуск проверки и панель результатов

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §The Validator, печатные стр.102–103.

**Поведение Arkita:** Выполнять диагностику выбранной модели с явным набором включённых правил и состоянием результата.

**Приёмка:**

1. Результат относится к конкретной ревизии; изменение модели помечает его устаревшим.
2. Ноль замечаний означает успех только запущенных правил, без заявления полной нормативной совместимости.

**Факт по коду:** Команда проверки модели запускает assessProject, показывает номер снимка, ALLOWED/FORBIDDEN/UNKNOWN, источник и границы охвата. Нет настраиваемого каталога советов и сохраняемого состояния панели с явным устареванием после правки; отсутствие замечаний не выдаётся за соответствие всей модели.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js).

#### A-ADV-026 — Диагностика пустых представлений

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Находить view без содержимого как настраиваемую рекомендацию.

**Приёмка:**

1. Рисунки, заметки и другие допустимые объекты учитываются согласно объявленному критерию пустоты.
2. Диагностика не удаляет заготовки автоматически.

**Зависимости:** A-ADV-025.

**Факт по коду:** Пустое представление имеет объяснение на холсте, но assessProject и панель результатов не выпускают диагностику empty view и не имеют настройки этого совета.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js).

#### A-ADV-027 — Проверка допустимости отношений

**Класс:** Adapt. **Покрытие:** implemented-in-code.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Проверять отношения по доказанным правилам Arkita4, отдельно показывая FORBIDDEN и UNKNOWN.

**Приёмка:**

1. Импортированные, циклические и relation-to-relation случаи проверяются одинаково.
2. UNKNOWN не становится разрешением; источник и версия каждого нормативного вывода доступны.

**Зависимости:** A-ADV-025.

**Факт по коду:** Ограниченная проверка отношений ArchiMate 4 уже реализована: доказанные решения, UNKNOWN вне подтверждённого охвата, отдельные правила категорий концептов и диагностика графа junctions. Проверка идёт по всей модели, включая скрытое viewpoint; создание запрещённого отношения отклоняется. Это наличие bounded implementation, не доказательство полной нормативной совместимости.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-profiles/src/endpoint-permissions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/endpoint-permissions.js), [schemka-model-profiles/src/concept-permissions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/concept-permissions.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js).

#### A-ADV-028 — Проверка семантики визуальной вложенности

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Сопоставлять вложенные рисунки с принятым контрактом отношений и контейнеров Arkita4.

**Приёмка:**

1. Декоративный контейнер не ошибочно считается семантическим отношением.
2. Замечание показывает конкретное view и пару рисунков; модель не исправляется молча.

**Зависимости:** A-ADV-025.

**Факт по коду:** Нативная схема прямо требует parentOccurrenceId=null и отклоняет вложенность. Проверок семантики вложенных рисунков/декоративных контейнеров нет; нельзя подключать правила Archi 3.2 к отсутствующему контракту Arkita 4.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-029 — Поиск концептов и отношений без использований

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Отдельно находить элементы и отношения, не представленные ни в одном view.

**Приёмка:**

1. Счёт охватывает все view; невидимость из-за фильтра не считается отсутствием использования.
2. Результат является советом: удаление требует отдельного действия.

**Зависимости:** A-ADV-025.

**Факт по коду:** Инспектор умеет подсчитать все использования выбранного концепта, однако общего результата проверки «не используется ни в одном view» нет. Счётчик текущего view в дереве не является такой диагностикой.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js).

#### A-ADV-030 — Проверка содержания viewpoint

**Класс:** Adapt. **Покрытие:** partial.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Показывать элементы view, которые не соответствуют выбранному Arkita4 viewpoint.

**Приёмка:**

1. Обрабатываются custom viewpoints и неопределённые ограничения.
2. Диагностика не удаляет скрытые объекты и позволяет перейти к ним.

**Зависимости:** A-ADV-025.

**Факт по коду:** Есть project-owned viewpoints, проверяемые определения, проекция view и счётчики исключённых типов, концов и рисунков. Отдельного списка viewpoint-замечаний с переходом к скрытому рисунку и правилами советов валидатора нет.

**Доказательства:** [schemka-model-ui/src/viewpoint-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewpoint-ui.js), [schemka-model-core/src/viewpoints.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/viewpoints.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js).

#### A-ADV-031 — Поиск одинаковых имён внутри типа

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Подсвечивать возможные дубли концептов по имени и типу.

**Приёмка:**

1. Правила сравнения регистра, пробелов и Unicode объявлены; ID остаются различимыми.
2. Одинаковые имена не запускают автоматическое слияние.

**Зависимости:** A-ADV-025.

**Факт по коду:** Сущности идентифицируются ID; одинаковые имена допустимы. В assessor и UI нет поиска дубликатов name+type или объявленной Unicode/регистровой политики сравнения имён.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-032 — Переход от замечания к объекту

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Из результата открывать точный объект в модели или рисунок в view.

**Приёмка:**

1. Переход раскрывает нужную область и выделение, в том числе вне текущей камеры.
2. Устаревший или удалённый объект объясняется без выбора чужого одноимённого.

**Зависимости:** A-ADV-025.

**Факт по коду:** Строки диагностики содержат relationship ID и свидетельства, но не команду открыть точное использование. Камера reveal уже существует как примитив; привязки finding→view/occurrence и обработки устаревших целей нет.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js).

#### A-ADV-033 — Объяснение замечания

**Класс:** Independent. **Покрытие:** implemented-in-code.

**Источник:** Guide5.10 §The Validator, печатные стр.102.

**Поведение Arkita:** Показывать правило, причину, тяжесть и возможное действие рядом с результатом.

**Приёмка:**

1. Рекомендации по качеству отделены от нарушений целостности и недоказанной нотации.
2. Объяснение доступно с клавиатуры и не зависит от открытия отдельной панели.

**Зависимости:** A-ADV-025.

**Факт по коду:** Текущие bounded diagnostics уже показывают причину, статус, типы концов, rule ID/ячейку, точные локаторы C260, границы и смысл UNKNOWN. Используются native details с клавиатурой; локальные ограничения графового анализа отделены от нормативного запрета. Новые советы качества потребуют собственных объяснений по мере добавления.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js).

#### A-ADV-034 — Настройка диагностических правил

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Validator / Preferences; Validator Preferences / Rules to check, печатные стр.103; 174.

**Поведение Arkita:** Включать и выключать советы валидатора с видимым перечнем исключённых проверок.

**Приёмка:**

1. Настройка переживает перезапуск, сбрасывается к умолчанию и отражена в результате.
2. Отключение совета не отключает обязательную проверку схемы, ссылок и безопасной записи.

**Зависимости:** A-ADV-025.

**Факт по коду:** В UI проверки и локальных настройках нет включения/отключения отдельных советов и списка исключённых правил. Обязательная проверка схемы/ссылок уже выполняется и должна сохраниться.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css).

### reports

#### A-ADV-035 — Предпросмотр HTML отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Preview HTML Report, печатные стр.104.

**Поведение Arkita:** Открывать локальный предварительный просмотр отчёта выбранной модели.

**Приёмка:**

1. Preview соответствует известной ревизии и обновляется по явному действию.
2. Просмотр не сохраняет модель и не исполняет произвольный код из её текстовых полей.

**Зависимости:** A-ADV-068.

**Факт по коду:** Файловый поток экспортирует native и Mermaid; команды генерации отчёта и локального HTML report preview, renderer/IPC для него и шаблонного движка в поставляемых модулях нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

### files

#### A-ADV-036 — Открытие модели без дублирования сессии

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Opening, Saving and Printing / Opening an Existing Model, печатные стр.105.

**Поведение Arkita:** Открывать нативную модель из диалога; уже открытый файл активировать повторно.

**Приёмка:**

1. Ошибочный файл не заменяет текущую рабочую модель.
2. Для поддерживаемых путей эквивалентные обращения к одному файлу не создают независимые писатели.

**Факт по коду:** Нативный open через диалог есть: кандидат валидируется до замены модели, учитывается dirty и файловое состояние. Приложение имеет одну модель; реестра нескольких открытых документов и активации уже открытого файла по нормализованной идентичности пути нет.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/project-session.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/project-session.js), [electron/file-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/file-service.mjs), [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs).

#### A-ADV-037 — Открытие файла перетаскиванием

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Opening, Saving and Printing / Opening an Existing Model, печатные стр.105.

**Поведение Arkita:** Принимать нативный файл модели через drop в окно приложения.

**Приёмка:**

1. Срабатывает тот же валидируемый путь открытия, что у меню.
2. Отмена обработки несохранённой работы и неподдерживаемый файл оставляют сессию неизменной.

**Зависимости:** A-ADV-036.

**Факт по коду:** Drag/drop реализован для внутренних типизированных объектов редактора. Входящего открытия File через drop нет; native open вызывается диалогом, а навигация/drop браузерной страницы запрещены.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs).

#### A-ADV-038 — Открытие .arkita из Windows

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Opening, Saving and Printing / Opening an Existing Model, печатные стр.105.

**Поведение Arkita:** Поддерживать открытие файла моделью установленного приложения и передачу в уже запущенное окно.

**Приёмка:**

1. Пути с пробелами, кириллицей и необычными символами открываются как один файл.
2. Вторая активация уважает текущие несохранённые изменения и не теряется.

**Зависимости:** A-ADV-036.

**Факт по коду:** В electron-builder нет fileAssociations. Single-instance обработчик только фокусирует окно; обработчиков open-file/аргументов файла и передачи .arkita в текущую сессию нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs), [electron/file-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/file-service.mjs).

#### A-ADV-039 — Сохранение модели

**Класс:** Independent. **Покрытие:** implemented-in-code.

**Источник:** Guide5.10 §Opening, Saving and Printing / Saving a Model, печатные стр.105.

**Поведение Arkita:** Сохранять текущую модель; для нового документа запрашивать целевой путь.

**Приёмка:**

1. Dirty сбрасывается только после подтверждённой записи нужной ревизии.
2. Ошибка, отмена и внешний конфликт сохраняют рабочие данные и доступный путь восстановления.

**Факт по коду:** Save/Save As и привязанный native directory уже реализованы. Сессия учитывает подтверждённую ревизию; отмена/ошибка/конфликт не объявляют документ сохранённым, файловый слой проверяет изменение на диске, а directory update имеет восстановление. Новая Windows приёмка в этом обзоре не выполнялась.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/project-session.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/project-session.js), [electron/file-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/file-service.mjs), [electron/project-files.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/project-files.mjs), [electron/directory-update.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/directory-update.mjs).

#### A-ADV-040 — Сохранение под другим именем

**Класс:** Independent. **Покрытие:** implemented-in-code.

**Источник:** Guide5.10 §Opening, Saving and Printing / Saving a Model, печатные стр.105.

**Поведение Arkita:** Создавать копию в другом файле с понятным дальнейшим рабочим путём.

**Приёмка:**

1. Исходный файл не меняется; отказ записи не переключает сессию на несуществующий результат.
2. Модель, вложения и идентификаторы проходят обратное чтение.

**Зависимости:** A-ADV-039.

**Факт по коду:** Save As создаёт выбранный .arkita и переключает привязку после успешной записи; native serializer/loader сохраняют ID и текущий формат v2. Вложения ещё не входят в формат: их будущий round trip относится к A-ADV-107, а не к уже существующей записи native. Windows диалог/файловая приёмка здесь не запускались.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/project-session.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/project-session.js), [electron/file-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/file-service.mjs), [electron/project-files.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/project-files.mjs).

#### A-ADV-041 — Закрытие модели с обработкой несохранённых данных

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Opening, Saving and Printing / Closing a Model in the Model Tree, печатные стр.105.

**Поведение Arkita:** Закрывать рабочую модель без удаления файла.

**Приёмка:**

1. Save, Discard и Cancel имеют разные проверяемые результаты.
2. Ошибка сохранения не завершает закрытие; повторное открытие не использует старый controller.

**Факт по коду:** Защита несохранённой работы при замене модели и закрытии окна есть; busy блокирует закрытие. На закрытии окна есть Stay/Close without saving. Отдельной команды закрытия документа с состоянием «нет открытой модели» и единым Save/Discard/Cancel потоком нет.

**Доказательства:** [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-ui/src/leave-state.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/leave-state.js), [schemka-model-ui/src/project-session.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/project-session.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-042 — Несколько открытых моделей

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Opening, Saving and Printing / Closing a Model in the Model Tree, печатные стр.105.

**Поведение Arkita:** Поддержать несколько независимых документов с явной текущей моделью.

**Приёмка:**

1. Dirty, Undo, путь и сохранение изолированы по документу.
2. Переключение и закрытие одного документа не воздействуют на другой.

**Зависимости:** A-ADV-036, A-ADV-041.

**Факт по коду:** Один BrowserWindow создаёт один controller/store/projectSession; открытие заменяет его модель. Вкладки относятся к видам одного проекта, не к независимым документам с собственными путями и Undo.

**Доказательства:** [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-ui/src/project-session.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/project-session.js).

#### A-ADV-043 — Печать диаграммы

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Opening, Saving and Printing / Printing A View (Diagram), печатные стр.105.

**Поведение Arkita:** Печатать выбранное view через Windows с предварительно понятным масштабом и страницами.

**Приёмка:**

1. Печатный результат содержит фигуры, подписи и кириллицу без обрезки на принятых DPI.
2. Нет view — команда объяснимо недоступна; отмена печати не меняет модель.

**Факт по коду:** Ни desktop меню, ни preload/main IPC не предлагают печать. В поставляемом коде нет webContents.print/printToPDF/window.print или подготовки страниц; совпадения PDF — ссылки на страницы стандарта, не вывод документов.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

### csv

#### A-ADV-044 — CSV выгрузка элементов, отношений и свойств

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Exporting and Importing the Model in CSV Format / Export Model To CSV, печатные стр.106–109.

**Поведение Arkita:** Определить собственный версионируемый табличный контракт Arkita4 со стабильными ссылками между таблицами.

**Приёмка:**

1. ID, типы, имена, документация, концы, специализации и пользовательские свойства сохраняют смысл.
2. Лексика Archi3.2 не выдаётся за Arkita4; ссылки на отношения сохраняются. Повторные ключи внешнего источника, непредставимые в текущем unique-key контракте, приводят к явному отчёту или отказу, без потерь и скрытой миграции.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-045 — Настройки файлов и разделителя CSV

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Export Model To CSV / Export Options, печатные стр.106.

**Поведение Arkita:** Выбирать папку, общий префикс набора и разделитель: запятая, точка с запятой или табуляция.

**Приёмка:**

1. Все таблицы получают согласованные имена; разделители внутри значений корректно экранируются.
2. Коллизия файлов и частичная ошибка записи не объявляются полной выгрузкой.

**Зависимости:** A-ADV-044.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-046 — Кодировка CSV

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Export Model To CSV / File encoding, печатные стр.107.

**Поведение Arkita:** Предлагать UTF-8 и UTF-8 BOM; legacy кодировку выбирать только с явным контролем потерь.

**Приёмка:**

1. Кириллица, emoji и кавычки проходят экспорт и повторный импорт без повреждения.
2. Непредставимый символ не заменяется молча вопросительным знаком.

**Зависимости:** A-ADV-044.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-047 — Сохранение или уплощение многострочных полей CSV

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Export Model To CSV / Strip newline characters, печатные стр.107.

**Поведение Arkita:** По умолчанию сохранять многострочный текст; отдельной настройкой готовить плоскую выгрузку.

**Приёмка:**

1. Стандартный режим round-trip сохраняет переводы строк и пустые строки.
2. Плоский режим явно обозначен как преобразование; исходная модель не меняется.

**Зависимости:** A-ADV-044.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-048 — CSV для открытия в таблицах

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Export Model To CSV / Excel compatible, печатные стр.107.

**Поведение Arkita:** Дать режим выгрузки, сохраняющий ведущие нули и не превращающий пользовательский текст в формулы.

**Приёмка:**

1. Проверены строки с ведущими пробелами, 0, =, +, -, @ и переводами строк.
2. Табличная защита отделена от канонического round-trip режима и не меняет модель.

**Зависимости:** A-ADV-044.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-049 — Создание концептов из CSV

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing CSV Data into a Model / Import file format, печатные стр.107–110.

**Поведение Arkita:** Импортировать один или согласованный набор CSV файлов в новую либо текущую модель.

**Приёмка:**

1. Отсутствующий ID генерируется; ссылки требуют разрешимого ID; новые типы соответствуют Arkita4.
2. Весь пакет проверяется до применения, не оставляя частично созданных концептов.

**Зависимости:** A-ADV-044.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-050 — Частичное обновление модели из CSV

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing CSV Data into a Model / Importing, updating and merging, печатные стр.109–110.

**Поведение Arkita:** Сопоставлять данные по ID и добавлять либо обновлять переданные записи.

**Приёмка:**

1. Отсутствующие в CSV записи не удаляются; без изменений импорт не загрязняет Undo.
2. Preview различает новые, обновлённые и неизменённые записи; один импорт обратим.

**Зависимости:** A-ADV-049.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-051 — Изменение концов отношений из CSV

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing CSV Data into a Model / Importing, updating and merging, печатные стр.109–110.

**Поведение Arkita:** Позволять обновлять source/target через общий валидируемый механизм отношений Arkita4.

**Приёмка:**

1. Ссылки и семантические ограничения проверяются до commit.
2. Preview показывает влияние на все view; недопустимая перепривязка отклоняет пакет.

**Зависимости:** A-ADV-050.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-052 — Диагностика ошибок CSV

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing CSV Data into a Model, печатные стр.107–110.

**Поведение Arkita:** Проверять заголовки, уникальность, ссылки, типы и корректность данных до изменения модели.

**Приёмка:**

1. Сообщение указывает файл, строку и поле; повторные ID не перезаписываются случайным порядком.
2. Попытка сменить тип существующего концепта не обходит штатную команду и её ограничения.

**Зависимости:** A-ADV-049.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-053 — Табличный перенос специальных атрибутов нотации

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing CSV Data into a Model / Format for properties.csv file, печатные стр.109.

**Поведение Arkita:** Явно сопоставить атрибуты направленности, доступа, влияния и junction с контрактом Arkita4.

**Приёмка:**

1. Для каждого поддержанного поля есть допустимые значения и round-trip fixture.
2. Неприменимые поля Archi3.2 попадают в отчёт совместимости, а не маскируются обычным текстом.

**Зависимости:** A-ADV-044, A-ADV-049.

**Факт по коду:** Нативный IO экспортирует/читает формат Arkita и экспортирует Mermaid. Во всех поставляемых модулях отсутствует CSV parser/writer и пользовательский поток табличного импорта/экспорта. Поэтому параметры файлов/разделителя/кодировки/переносов, защита spreadsheet, пакетное обновление ID/концов и диагностика CSV пока не реализованы. Для типов действует отдельная карта в Arkita 4; current properties — уникальные ключи.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-054 — Не требовать сохранения диаграмм в формате CSV Archi

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §Importing CSV Data into a Model, печатные стр.110.

**Поведение Arkita:** Возможность полного обмена геометрией через CSV не извлекается: руководство прямо ограничивает CSV модельными данными.

**Приёмка:**

1. Описание CSV не обещает переноса view и маршрутов.
2. Полный перенос использует нативный формат либо отдельно спроектированный формат обмена.

**Факт по коду:** Исключение из переносимых требований сохранено: Возможность полного обмена геометрией через CSV не извлекается: руководство прямо ограничивает CSV модельными данными.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

### merge

#### A-ADV-055 — Импорт другой модели в текущую

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing Another Model into the Current Model, печатные стр.111–112.

**Поведение Arkita:** Импортировать другую нативную Arkita модель как обновляемый набор ссылочных объектов.

**Приёмка:**

1. Сопоставление ID и типа явно задано; коллизии разных объектов обнаруживаются.
2. Валидация выполняется до применения; отсутствие объекта в источнике не означает скрытое удаление.

**Факт по коду:** Импорт другой произвольной native-модели в открытую с выбором области/свойств и отчётом отсутствует: обычный open заменяет документ. Существуют Git receive и трёхсторонний merge base/local/remote с preview конфликтов — это отдельный уже работающий поток, который следует переиспользовать где уместно, а не повторно строить Git. Правило «отсутствие в импортируемом файле не удаляет» не меняет намеренную передачу удалений в Git merge.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/git-merge.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/git-merge.js), [schemka-model-ui/src/git-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/git-actions.js), [electron/git-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-service.mjs).

#### A-ADV-056 — Настройка области обновления модели

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing another Archi model / Import Options, печатные стр.111.

**Поведение Arkita:** Отдельно выбирать обновление существующих объектов, папок и метаданных модели.

**Приёмка:**

1. Preview показывает выбранную область и оставляемые локальные данные.
2. Отключённая область действительно не меняется; повторный равный импорт является no-op.

**Зависимости:** A-ADV-055.

**Факт по коду:** Импорт другой произвольной native-модели в открытую с выбором области/свойств и отчётом отсутствует: обычный open заменяет документ. Существуют Git receive и трёхсторонний merge base/local/remote с preview конфликтов — это отдельный уже работающий поток, который следует переиспользовать где уместно, а не повторно строить Git. Правило «отсутствие в импортируемом файле не удаляет» не меняет намеренную передачу удалений в Git merge.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/git-merge.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/git-merge.js), [schemka-model-ui/src/git-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/git-actions.js), [electron/git-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-service.mjs).

#### A-ADV-057 — Отчёт результата и влияния импорта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing another Archi model / Show Status Dialog after importing, печатные стр.111–112.

**Поведение Arkita:** Показывать созданные и изменённые объекты, конфликты и затронутые рисунки отношений.

**Приёмка:**

1. Каждое изменение прослеживается до исходного и целевого ID.
2. Сводка соответствует реально применённой транзакции и доступна после её завершения.

**Зависимости:** A-ADV-055.

**Факт по коду:** Импорт другой произвольной native-модели в открытую с выбором области/свойств и отчётом отсутствует: обычный open заменяет документ. Существуют Git receive и трёхсторонний merge base/local/remote с preview конфликтов — это отдельный уже работающий поток, который следует переиспользовать где уместно, а не повторно строить Git. Правило «отсутствие в импортируемом файле не удаляет» не меняет намеренную передачу удалений в Git merge.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/git-merge.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/git-merge.js), [schemka-model-ui/src/git-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/git-actions.js), [electron/git-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-service.mjs).

#### A-ADV-058 — Явная политика пользовательских свойств при merge

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing Another Model into the Current Model, печатные стр.111.

**Поведение Arkita:** Выбрать replace либо осмысленный merge свойств; не переносить без пояснений стратегию полной замены из Archi.

**Приёмка:**

1. Preview показывает удаляемые и сохраняемые значения по текущему unique-key контракту. Непредставимые повторные ключи внешнего источника диагностируются до применения; их поддержка потребовала бы отдельной версии формата.
2. Выбранная политика детерминирована и полностью обратима.

**Зависимости:** A-ADV-055.

**Происхождение решения:** Arkita design derived from a documented Archi replacement policy.

**Факт по коду:** Импорт другой произвольной native-модели в открытую с выбором области/свойств и отчётом отсутствует: обычный open заменяет документ. Существуют Git receive и трёхсторонний merge base/local/remote с preview конфликтов — это отдельный уже работающий поток, который следует переиспользовать где уместно, а не повторно строить Git. Правило «отсутствие в импортируемом файле не удаляет» не меняет намеренную передачу удалений в Git merge.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/git-merge.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/git-merge.js), [schemka-model-ui/src/git-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/git-actions.js), [electron/git-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-service.mjs).

#### A-ADV-059 — Конвертация файла Archi в Arkita4

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Importing Another Model into the Current Model, печатные стр.111–112.

**Поведение Arkita:** Отделить чтение .archimate от нативного merge и спроектировать карту преобразования нотации.

**Приёмка:**

1. Для каждого исходного типа, атрибута, view и ресурса есть правило либо явный отказ/предупреждение.
2. Ничего неизвестного не теряется молча; исходный файл не изменяется.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

### exchange

#### A-ADV-060 — Экспорт в Open Group Exchange

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format / Exporting and Settings, печатные стр.113.

**Поведение Arkita:** Экспортировать в точно названную версию Exchange schema с картой Arkita4→выбранный формат.

**Приёмка:**

1. Заявляемая версия формата и все поддержанные поля проверены на fixtures.
2. При отсутствии представимого соответствия экспорт даёт отчёт потерь или отказ, а не ложное заявление совместимости.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-061 — Проверка XML и поставка схемы обмена

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format / Options, печатные стр.113.

**Поведение Arkita:** Проверять экспорт по закреплённым XSD; по запросу сохранять нужные схемы рядом с файлом.

**Приёмка:**

1. Используется та же версия схемы, что объявлена экспортом; проверка воспроизводима без произвольной сети.
2. Ошибка XSD отделена от ошибки семантического преобразования.

**Зависимости:** A-ADV-060.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-062 — Перенос организации папок

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format / Options, печатные стр.113.

**Поведение Arkita:** Позволять включать организационную структуру модели в переносимый формат.

**Приёмка:**

1. Одинаковые имена папок не смешивают объекты и порядок.
2. Отключение организации не удаляет концепты и явно ограничивает round-trip.

**Зависимости:** A-ADV-060.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-063 — Код языка текстовых полей обмена

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format / Options, печатные стр.113.

**Поведение Arkita:** Задавать и проверять языковую маркировку строк по контракту выбранной схемы.

**Приёмка:**

1. Кириллица сохраняется независимо от маркировки языка.
2. Неподдерживаемый language tag не подменяется молча.

**Зависимости:** A-ADV-060.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-064 — Описательные метаданные экспорта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format / Adding Metadata, печатные стр.113–114.

**Поведение Arkita:** Добавлять необязательные Dublin Core сведения об авторстве, назначении и правах модели.

**Приёмка:**

1. Все заявленные поля имеют однозначный перенос и escaping.
2. Пустые метаданные не создают ложных значений; экспорт не меняет модель без отдельного сохранения.

**Зависимости:** A-ADV-060.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-065 — Импорт Open Exchange в новую модель

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format / Importing from an Open Exchange XML file, печатные стр.114.

**Поведение Arkita:** Создавать отдельную Arkita4 модель из поддерживаемой версии Exchange XML.

**Приёмка:**

1. Схема, ссылки, отношения и геометрия проверяются до открытия результата.
2. Конвертация выдаёт полный список непреносимых данных; текущая модель не перезаписывается.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-066 — Отчёт о расширениях и потерях обмена

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Open Group Exchange File Format, печатные стр.113.

**Поведение Arkita:** Отличать стандартные поля от vendor extensions и объяснять судьбу каждого неподдержанного поля.

**Приёмка:**

1. Round-trip тест перечисляет сохранённые и утрачиваемые сведения, включая рисунки и ресурсы.
2. UNKNOWN семантика не превращается в допустимое отношение.

**Зависимости:** A-ADV-060, A-ADV-065.

**Происхождение решения:** Arkita design derived from interchange scope limits.

**Факт по коду:** Ни .archimate reader, ни XML/Open Exchange importer/exporter, XSD набор или metadata/language/vendor-extension adapter не поставляются. Меню и API ограничены native/Mermaid, закрытая native-схема не является Exchange schema. Совместимость 3.2→4 не подразумевается: перед реализацией нужна закреплённая версия и карта переносимых/непереносимых полей.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json).

#### A-ADV-067 — Не заменять нативное хранение форматом Exchange

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §The Open Group Exchange File Format, печатные стр.113.

**Поведение Arkita:** Обменный XML остаётся внешним контрактом; его наличие не требует переводить рабочее хранение Arkita на Archi/Exchange XML.

**Приёмка:**

1. Сохранение нативной модели не зависит от экспортного преобразования.
2. Формат совместимости и формат проекта имеют отдельную версию и описание.

**Факт по коду:** Исключение из переносимых требований сохранено: Обменный XML остаётся внешним контрактом; его наличие не требует переводить рабочее хранение Arkita на Archi/Exchange XML.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

### reports

#### A-ADV-068 — Автономный HTML отчёт по модели

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Reporting; HTML Report, печатные стр.115–117.

**Поведение Arkita:** Создавать пакет для просмотра модели без редактора: навигация, сведения об объектах и диаграммы.

**Приёмка:**

1. Отчёт открывается локально и содержит корректные ссылки, подписи и вложения.
2. Текст модели не становится исполняемым HTML/JavaScript; экспорт относится к одной ревизии.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-069 — Поиск внутри HTML отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §HTML Report / Searching the model, печатные стр.116.

**Поведение Arkita:** Искать и фильтровать содержание опубликованного отчёта.

**Приёмка:**

1. Результаты переходят к нужному ID; кириллица и одинаковые имена обрабатываются предсказуемо.
2. Сброс поиска возвращает навигацию; скрытая область не смешивается с реально исключёнными данными.

**Зависимости:** A-ADV-068.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-070 — Масштабирование диаграмм HTML отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §HTML Report / Zooming a view, печатные стр.116.

**Поведение Arkita:** Управлять масштабом встроенных диаграмм в отчёте.

**Приёмка:**

1. Масштаб имеет доступные кнопки и сохраняет читаемость текста.
2. Большая диаграмма доступна целиком, а содержимое не обрезается фиксированным контейнером.

**Зависимости:** A-ADV-068.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-071 — Фильтр навигации в отчёте

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §HTML Report / Masking, печатные стр.116–117.

**Поведение Arkita:** Разрешить убирать папки и объекты из видимой навигации отчёта с явным описанием области фильтра.

**Приёмка:**

1. Скрытие папки согласованно действует на её потомков в дереве и поиске.
2. UI не называет визуальное скрытие удалением данных: в Archi оригинальные страницы остаются доступны напрямую.

**Зависимости:** A-ADV-068.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-072 — Реальное исключение данных из пакета отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §HTML Report / Masking, печатные стр.116–117.

**Поведение Arkita:** В дополнение к фильтру предусмотреть экспорт только выбранных данных, если пользователю нужен ограниченный пакет.

**Приёмка:**

1. Исключённые записи отсутствуют в HTML, JSON, поисковом индексе, изображениях и вложениях результата.
2. Неразрешимые внешние ссылки перечислены; модель не изменяется.

**Зависимости:** A-ADV-068.

**Происхождение решения:** Arkita improvement; guide documents only visual masking, not true exclusion.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-073 — Запросы к данным отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §HTML Report / SQL Query, печатные стр.117.

**Поведение Arkita:** Дать аналитический read-only запрос по документированной схеме данных отчёта.

**Приёмка:**

1. Запрос не меняет модель или экспортированный набор и работает на объявленных таблицах.
2. Долгий запрос можно остановить; ошибки запроса не ломают остальную навигацию.

**Зависимости:** A-ADV-068.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-074 — Форматированная документация в отчётах

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §HTML Report, печатные стр.116–117.

**Поведение Arkita:** Отображать поддерживаемый Markdown из документации так же, как в предпросмотре редактора.

**Приёмка:**

1. Кириллица, таблицы, ссылки и код не повреждаются между просмотром и экспортом.
2. Неподдерживаемая разметка и внешние ресурсы следуют явно выбранной политике.

**Зависимости:** A-ADV-068.

**Происхождение решения:** guide-context + official Version History 5.10 (Markdown/HTML reports).

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-075 — Отчёт по шаблону с заголовком и структурой

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Jasper Reports; Customisable Report, печатные стр.118–120.

**Поведение Arkita:** Формировать документ из данных модели по шаблону с названием, стилем и параметрами разделов.

**Приёмка:**

1. Заголовок, порядок разделов, метаданные и номера страниц предсказуемы.
2. Preview и экспорт используют одну ревизию; настройка отчёта не редактирует концепты.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-076 — Выбор форматов и места вывода отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Jasper Reports / Output, печатные стр.118 (wizard screenshot); 120–121.

**Поведение Arkita:** Вести независимые цели вывода HTML, PDF, RTF, Word, PowerPoint и OpenDocument; реализовывать по приоритету.

**Приёмка:**

1. Каждая объявленная цель имеет настоящий файл соответствующего формата и проверенный пример.
2. При нескольких целях показывается успех/ошибка по каждой; имя и папка задаются до генерации.

**Зависимости:** A-ADV-075.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-077 — Пользовательские шаблоны отчётов

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Jasper Reports / User Report Templates; Jasper Reports Preferences / Settings, печатные стр.120; 172.

**Поведение Arkita:** Подключать шаблон отчёта из выбранного файла или пользовательского каталога.

**Приёмка:**

1. Неверный либо несовместимый шаблон даёт понятную ошибку до экспорта.
2. Шаблон получает документированный набор данных и ограниченные возможности, а не прямой доступ к модели.

**Зависимости:** A-ADV-075.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-078 — Язык и локаль отчёта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Jasper Reports, печатные стр.118 (wizard screenshot).

**Поведение Arkita:** Выбирать поддерживаемую локаль для переведённых подписей и форматов отчёта.

**Приёмка:**

1. Числа, даты и подписи соответствуют выбранной локали и не меняют значения модели.
2. Отсутствующий перевод обрабатывается явным fallback, без пустых разделов.

**Зависимости:** A-ADV-075.

**Факт по коду:** В меню, IO exports и desktop IPC отсутствует подсистема публикации HTML/документных отчётов. Нет генератора страниц/поискового индекса, запросов, masking/exclusion, Markdown report renderer, шаблонов, локалей или соответствующих форматам writer. HTML текущего редактора и экспорт Mermaid не считаются отчётом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-079 — Не переносить Java/Jasper и JRXML как обязательный движок

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §Jasper Reports / User Report Templates; Jasper Reports Preferences, печатные стр.118–120; 172.

**Поведение Arkita:** Функция шаблонных отчётов полезна независимо от Jasper; обязательная JVM/JRXML совместимость не требуется для Electron приложения.

**Приёмка:**

1. Требования к выходным документам остаются в document-report/report-formats.
2. Прямая совместимость JRXML, если понадобится, оформляется отдельным адаптером и решением по стоимости поддержки.

**Факт по коду:** Исключение из переносимых требований сохранено: Функция шаблонных отчётов полезна независимо от Jasper; обязательная JVM/JRXML совместимость не требуется для Electron приложения.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

### templates

#### A-ADV-080 — Сохранение модели как шаблона

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Templates / Creating a New Template, печатные стр.122–123.

**Поведение Arkita:** Создавать переиспользуемую заготовку с отдельным названием и описанием.

**Приёмка:**

1. Содержимое, профиль и ресурсы входят в шаблон; исходная модель не меняется.
2. Ошибки и отмена не оставляют зарегистрированный, но неполный шаблон.

**Факт по коду:** Нет save/load/register template, каталога/категорий, миниатюр или версионируемого пакета ресурсов. New и встроенный синтетический Example создают фиксированные модели, duplicateView копирует вид; это не пользовательский шаблон и не его коллекция.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

#### A-ADV-081 — Предпросмотры шаблона и ключевая миниатюра

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Templates / Creating a New Template; Creating a New Model from a Template, печатные стр.123–124.

**Поведение Arkita:** Предлагать миниатюры view, ключевой preview и изменение размера галереи.

**Приёмка:**

1. Выбранный ключевой preview и остальные изображения относятся к правильным view.
2. Просмотр доступен с клавиатуры и не зависит только от hover.

**Зависимости:** A-ADV-080.

**Факт по коду:** Нет save/load/register template, каталога/категорий, миниатюр или версионируемого пакета ресурсов. New и встроенный синтетический Example создают фиксированные модели, duplicateView копирует вид; это не пользовательский шаблон и не его коллекция.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

#### A-ADV-082 — Выбор встроенного или пользовательского шаблона

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Templates / Creating a New Model from a Template, печатные стр.123–124.

**Поведение Arkita:** Показывать галерею с описанием и открывать шаблон напрямую с диска.

**Приёмка:**

1. Источники шаблонов различимы; отсутствующий файл объясняется.
2. Отмена не создаёт пустую модель; несовместимая версия не импортируется молча.

**Зависимости:** A-ADV-080.

**Факт по коду:** Нет save/load/register template, каталога/категорий, миниатюр или версионируемого пакета ресурсов. New и встроенный синтетический Example создают фиксированные модели, duplicateView копирует вид; это не пользовательский шаблон и не его коллекция.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

#### A-ADV-083 — Новая независимая модель из шаблона

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Templates / Creating a New Model from a Template, печатные стр.123–124.

**Поведение Arkita:** Создавать новый несохранённый документ из заготовки с определённой политикой ID.

**Приёмка:**

1. Редактирование результата не меняет шаблон или другую созданную из него модель.
2. Внутренние ссылки и ресурсы остаются согласованными после назначения новых идентификаторов.

**Зависимости:** A-ADV-082.

**Факт по коду:** Нет save/load/register template, каталога/категорий, миниатюр или версионируемого пакета ресурсов. New и встроенный синтетический Example создают фиксированные модели, duplicateView копирует вид; это не пользовательский шаблон и не его коллекция.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

#### A-ADV-084 — Категории и управление коллекцией шаблонов

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Templates / Managing your Templates; Managing your Canvas Templates, печатные стр.124–126; 155–157.

**Поведение Arkita:** Добавлять шаблоны, менять метаданные, создавать категории и включать один шаблон в несколько категорий.

**Приёмка:**

1. Переименование и удаление категории не удаляет файл шаблона; удаление ярлыка явно отличается от удаления файла.
2. Изменения коллекции сохраняются после перезапуска, недоступные пути диагностируются.

**Зависимости:** A-ADV-082.

**Факт по коду:** Нет save/load/register template, каталога/категорий, миниатюр или версионируемого пакета ресурсов. New и встроенный синтетический Example создают фиксированные модели, duplicateView копирует вид; это не пользовательский шаблон и не его коллекция.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

#### A-ADV-085 — Переносимый пакет шаблона

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Templates, печатные стр.122–124.

**Поведение Arkita:** Определить собственный версионируемый пакет Arkita с моделью, описанием и ресурсами.

**Приёмка:**

1. Шаблон переносится на другую машину без абсолютных путей автора.
2. Совместимость версии проверяется до загрузки; пользователь не получает файл Archi с ложным расширением.

**Зависимости:** A-ADV-080, A-ADV-107.

**Факт по коду:** Нет save/load/register template, каталога/категорий, миниатюр или версионируемого пакета ресурсов. New и встроенный синтетический Example создают фиксированные модели, duplicateView копирует вид; это не пользовательский шаблон и не его коллекция.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

### analysis

#### A-ADV-086 — Справочник разрешённых отношений Arkita4

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Relationships in ArchiMate, печатные стр.127.

**Поведение Arkita:** Показывать справочную матрицу по тем же правилам, которые применяют команды модели.

**Приёмка:**

1. ALLOWED, FORBIDDEN и UNKNOWN различимы; можно выбрать source, target и тип отношения.
2. Матрица доступна только для чтения и ссылается на конкретную версию доказанных правил.

**Факт по коду:** Проверяемая матрица правил используется внутри diagnostics и выбора отношения, но отдельного справочного read-only UI матрицы с выбором source/target/type нет. Существующий registry и источник правил нужно использовать при добавлении такого представления.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/profile-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/profile-ui.js), [schemka-model-ui/src/relationship-diagnostics.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/relationship-diagnostics.js), [schemka-model-profiles/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/index.js), [schemka-model-profiles/src/junction-graph.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-profiles/src/junction-graph.js), [schemka-model-ui/src/typed-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/typed-actions.js).

### freeform

#### A-ADV-087 — Неформальная рабочая доска

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Sketch View, печатные стр.128–130.

**Поведение Arkita:** Рассмотреть эскиз из текстовых карточек, условных акторов и свободных соединений как отдельную продуктовую возможность.

**Приёмка:**

1. Неформальный объект не выдаётся за нормативный концепт Arkita4.
2. Доска сохраняется, имеет Undo и может сосуществовать со строгими view без смешения семантики.

**Факт по коду:** В поставляемом редакторе нет отдельного свободного Sketch-режима, его палитры/фона или конвертации sketches. Native v2 хранит только типизированные концепты и их drawings. Наличие обычного SVG canvas не означает поддержку свободных досок; подобный режим — отдельный кандидат продукта.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-088 — Редактирование текста эскизной карточки

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Sketch View, печатные стр.129.

**Поведение Arkita:** Редактировать текст на месте и через инспектор.

**Приёмка:**

1. Enter/escape и потеря фокуса имеют согласованную семантику.
2. Отмена оставляет текст и Undo без изменений, включая многострочную кириллицу.

**Зависимости:** A-ADV-087.

**Факт по коду:** В поставляемом редакторе нет отдельного свободного Sketch-режима, его палитры/фона или конвертации sketches. Native v2 хранит только типизированные концепты и их drawings. Наличие обычного SVG canvas не означает поддержку свободных досок; подобный режим — отдельный кандидат продукта.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-089 — Фон рабочей доски

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Sketch View; Diagram Preferences / Appearance / Sketch View, печатные стр.130; 167.

**Поведение Arkita:** Выбирать фон для конкретной доски и значение по умолчанию для новых.

**Приёмка:**

1. Изменение default не перезаписывает явно сохранённые фоны.
2. Фон не снижает различимость объектов и корректно входит в экспорт.

**Зависимости:** A-ADV-087.

**Факт по коду:** В поставляемом редакторе нет отдельного свободного Sketch-режима, его палитры/фона или конвертации sketches. Native v2 хранит только типизированные концепты и их drawings. Наличие обычного SVG canvas не означает поддержку свободных досок; подобный режим — отдельный кандидат продукта.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-090 — Осмысленный перенос эскиза в Arkita4

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §The Sketch View, печатные стр.129.

**Поведение Arkita:** Исследовать явное сопоставление карточек концептам и отношений правилам Arkita4; автоматический конвертер не заявлен в Guide.

**Приёмка:**

1. Перед переносом пользователь видит предложенные типы, повторное использование и неподдерживаемые связи.
2. Исходный эскиз сохраняется; модель создаётся только после проверки всей карты преобразования.

**Зависимости:** A-ADV-087.

**Происхождение решения:** Arkita design candidate; guide describes later modelling, not a documented automatic converter.

**Факт по коду:** В поставляемом редакторе нет отдельного свободного Sketch-режима, его палитры/фона или конвертации sketches. Native v2 хранит только типизированные концепты и их drawings. Наличие обычного SVG canvas не означает поддержку свободных досок; подобный режим — отдельный кандидат продукта.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-091 — Не копировать отдельную legacy реализацию Sketch

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §The Sketch View, печатные стр.128–130.

**Поведение Arkita:** Archi называет Sketch экспериментальным и указывает возможное объединение видов; отдельный дублирующий движок не является целью Arkita.

**Приёмка:**

1. Функциональные сценарии эскиза сохранены отдельными карточками.
2. Выбор общего либо отдельного типа view требует решения по данным и UX, не копирования класса Archi.

**Факт по коду:** Исключение из переносимых требований сохранено: Archi называет Sketch экспериментальным и указывает возможное объединение видов; отдельный дублирующий движок не является целью Arkita.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

### canvas

#### A-ADV-092 — Пустая Canvas доска

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Canvas Modelling Toolkit / Getting into the Details, печатные стр.131; 134–135.

**Поведение Arkita:** Создавать свободную доску для методик и обсуждений внутри проекта.

**Приёмка:**

1. View явно обозначает неформальную семантику и открывается после создания.
2. Имя, содержимое и история сохраняются без вмешательства в нормативные отношения.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-093 — Ссылки между Canvas и архитектурными view

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §The Canvas Modelling Toolkit, печатные стр.131.

**Поведение Arkita:** Связывать доску обсуждения с представлениями модели.

**Приёмка:**

1. Ссылка хранит устойчивый view ID и переживает переименование.
2. Удалённая цель объясняется; переход не изменяет модель.

**Зависимости:** A-ADV-092.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-094 — Контейнерный блок Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Block; Getting into the Details, печатные стр.134–144.

**Поведение Arkita:** Создавать блок с текстом и иконкой, содержащий карточки и другие допустимые объекты.

**Приёмка:**

1. Вложенность, перемещение и resize имеют согласованную геометрию и Undo.
2. Блок не создаёт архитектурных отношений из-за одного визуального вложения.

**Зависимости:** A-ADV-092.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-095 — Карточка Canvas с текстом и заметкой

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Sticky, печатные стр.144–146.

**Поведение Arkita:** Добавлять цветные карточки с основным текстом, отдельной заметкой и свойствами.

**Приёмка:**

1. Заметка доступна не только через hover; основной текст редактируется отдельно.
2. Цвет палитры является стартовым значением и может изменяться после создания.

**Зависимости:** A-ADV-092.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-096 — Свободное соединение объектов Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Connection, печатные стр.148–150.

**Поведение Arkita:** Соединять объекты доски линией с именем, документацией и свойствами.

**Приёмка:**

1. Концы, удаление и Undo не оставляют висячих ссылок.
2. Свободная линия не попадает в каталог нормативных отношений модели.

**Зависимости:** A-ADV-092.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-097 — Оформление линии Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Connection / The Appearance Tab, печатные стр.149–150.

**Поведение Arkita:** Задавать окончания, штрих, цвет, толщину, текст и положение подписи линии.

**Приёмка:**

1. Значения отображаются после save/load и экспорта.
2. Положение у source/middle/target и смещения не меняет геометрию концов.

**Зависимости:** A-ADV-096.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-098 — Вычисляемая подпись линии Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Connection / The Label Tab, печатные стр.150.

**Поведение Arkita:** Формировать подпись из имени и свойств по ограниченному декларативному выражению.

**Приёмка:**

1. Неизвестное поле и синтаксическая ошибка показывают диагностику с fallback.
2. Выражение не исполняет JavaScript и не меняет исходное имя.

**Зависимости:** A-ADV-096.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-099 — Блокировка объектов доски

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Getting into the Details; Canvas Block; Canvas Sticky; Canvas Image; Canvas Connection, печатные стр.139–150.

**Поведение Arkita:** Защищать блок, карточку, изображение или линию от случайного изменения.

**Приёмка:**

1. Locked объект нельзя передвинуть, масштабировать или редактировать обычным инструментом.
2. Снятие блокировки явно доступно; групповая операция корректно обрабатывает смесь locked/unlocked.

**Зависимости:** A-ADV-092.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-100 — Инструкции для заполнения Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Getting into the Details / Adding Hints and Locking; Canvas Block / The Hint Tab, печатные стр.139–143.

**Поведение Arkita:** Хранить заголовок и пояснение назначения блока, полезные при заполнении шаблона.

**Приёмка:**

1. Текст показывается при выборе блока и доступен с клавиатуры.
2. Форматирование проходит безопасный renderer; текст входит в переносимый шаблон.

**Зависимости:** A-ADV-094, A-ADV-016.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-101 — Внешний вид объектов Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Block; Canvas Sticky; Canvas Image, печатные стр.143–148.

**Поведение Arkita:** Настраивать заливку, непрозрачность, рамку, штрих, шрифт и позицию текста поддерживаемых объектов.

**Приёмка:**

1. Набор полей зависит от типа; reset возвращает понятное default значение.
2. Состояния сохраняются, экспортируются и не подменяют свойства архитектурного концепта.

**Зависимости:** A-ADV-092.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-102 — Изображение на Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Image, печатные стр.147–148.

**Поведение Arkita:** Добавлять самостоятельное изображение с документацией, свойствами и сохранением пропорций.

**Приёмка:**

1. Resize с сохранением пропорций и команда восстановления отношения сторон проверены.
2. Заменить/очистить изображение можно без удаления остальных свойств объекта.

**Зависимости:** A-ADV-092, A-ADV-103.

**Факт по коду:** Отдельного Canvas view с блоками, стикерами, несемантическими соединениями, блокировкой, локальными hints и собственным оформлением нет. Schema view/occurrence/connection закрыта и содержит только drawings модельных концептов; произвольные board objects и их свойства не сохраняются.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

### images

#### A-ADV-103 — Выбор и повторное использование изображений

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Adding Images to Objects, печатные стр.151–152.

**Поведение Arkita:** Предоставить галерею уже загруженных ресурсов и добавление изображения с диска.

**Приёмка:**

1. Одинаковые имена файлов с разным содержимым не смешиваются; повторное использование не дублирует ресурс без нужды.
2. Выбор, отмена и отсутствующий файл обрабатываются предсказуемо.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-104 — Изображение в фигуре или аннотации

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Adding Images to Objects; Canvas Block / The Image Tab; Canvas Sticky / The Image Tab, печатные стр.144; 146; 151.

**Поведение Arkita:** Позволять custom изображение у поддержанных объектов с явным источником: профиль либо индивидуальное.

**Приёмка:**

1. Семантическая фигура Arkita4 остаётся узнаваемой и не получает запрещённый символ.
2. Переход default/custom/none имеет обратимый и сохраняемый результат.

**Зависимости:** A-ADV-103.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-105 — Размещение изображения внутри объекта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Block / The Image Tab; Canvas Sticky / The Image Tab; Adding Images to Objects, печатные стр.144; 146; 151.

**Поведение Arkita:** Выбирать положение и режим изображения, включая заполнение области.

**Приёмка:**

1. Размеры, crop и пропорции предсказуемы; текст остаётся читаемым.
2. Нет обязательной привязки к историческому лимиту100px Archi; ограничения Arkita задокументированы.

**Зависимости:** A-ADV-104.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-106 — Поддержка растровых и SVG ресурсов

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Adding Images to Objects / Supported image formats, печатные стр.152.

**Поведение Arkita:** Вести явную матрицу PNG, JPEG, GIF, TIFF, BMP, ICO и SVG; подключать только протестированные декодеры.

**Приёмка:**

1. Каждый объявленный формат имеет корректный fixture, размерный предел и понятную ошибку повреждённого файла.
2. Неподдерживаемый формат не сохраняется как якобы успешно прочитанный ресурс.

**Зависимости:** A-ADV-103.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-107 — Ресурсы внутри переносимой модели

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Block; Adding Images to Objects, печатные стр.141; 152.

**Поведение Arkita:** Хранить связанные изображения вместе с проектом по версионируемому нативному контракту.

**Приёмка:**

1. Файл переносится между машинами без зависимости от локальных путей автора.
2. Save/load и Git сохраняют byte identity используемых ресурсов; очистка не удаляет ещё используемое.

**Зависимости:** A-ADV-103.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-108 — Совместимость SVG при сохранении и экспорте

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Adding Images to Objects / SVG Support, печатные стр.152.

**Поведение Arkita:** Объявить требования версии модели для SVG и поведение SVG внутри графического экспорта.

**Приёмка:**

1. Старая версия редактора не должна молча пересохранить модель с потерей ресурса.
2. Вектор сохраняется либо явно документируется растеризация и её масштаб; визуальный regression включает увеличение.

**Зависимости:** A-ADV-106, A-ADV-107.

**Происхождение решения:** Arkita improvement motivated by documented Archi SVG limitations.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-109 — Перетаскивание изображения с диска

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Adding Images to Objects, печатные стр.144; 146; 152.

**Поведение Arkita:** Принимать изображение через drop на Canvas или в выборщик ресурса.

**Приёмка:**

1. Drop проходит тот же валидируемый импорт, что открытие файла.
2. Новый объект появляется в точке drop в координатах камеры; ошибка не оставляет пустого ресурса.

**Зависимости:** A-ADV-102, A-ADV-103.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

#### A-ADV-110 — Удаление изображения из объекта

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Adding Images to Objects / Removing an image from an object, печатные стр.152.

**Поведение Arkita:** Снимать назначение ресурса, сохраняя объект и его остальные данные.

**Приёмка:**

1. Другое использование того же ресурса остаётся рабочим.
2. Undo восстанавливает точный ресурс и режим отображения.

**Зависимости:** A-ADV-104, A-ADV-107.

**Факт по коду:** В app/menu/preload и native schema нет image chooser/library, resource ID, встроенных файлов, пользовательского SVG/raster decoder, image placement или drop/remove resource. Встроенные SVG формы нотации генерируются кодом и не являются пользовательскими изображениями. Упоминание assets в сборке относится к иконке приложения, не библиотеке модели.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-io/src/project-file.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/project-file.js).

### canvas

#### A-ADV-111 — Шаблон отдельной доски Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Saving a Canvas as a Template, печатные стр.152–154.

**Поведение Arkita:** Сохранять доску с именем, описанием, необязательной миниатюрой, подсказками и блокировками.

**Приёмка:**

1. Ресурсы и внутренние ссылки включены в переносимый пакет.
2. Добавление в коллекцию не зависит от сохранения неполного файла.

**Зависимости:** A-ADV-092, A-ADV-084, A-ADV-107.

**Факт по коду:** Canvas-объектов и пользовательской template подсистемы нет; соответственно сохранение и создание доски из шаблона не реализованы. Общий native Save As не предоставляет такую семантику.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

#### A-ADV-112 — Новая Canvas из шаблона

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Getting Started; Creating a New Canvas from a Template, печатные стр.131–133; 154–155.

**Поведение Arkita:** Выбирать встроенную, пользовательскую или внешнюю заготовку доски и создавать view в выбранной модели.

**Приёмка:**

1. Создаётся независимый набор рисунков; блокировки, инструкции и ресурсы сохранены.
2. Копирование не меняет исходный шаблон; вновь открытая доска готова к заполнению.

**Зависимости:** A-ADV-111, A-ADV-082.

**Факт по коду:** Canvas-объектов и пользовательской template подсистемы нет; соответственно сохранение и создание доски из шаблона не реализованы. Общий native Save As не предоставляет такую семантику.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [schemka-model-ui/src/view-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/view-actions.js).

### preferences

#### A-ADV-113 — Понятный центр настроек

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Preferences, печатные стр.158.

**Поведение Arkita:** Собрать настройки в предсказуемом месте с областью действия и восстановлением умолчаний.

**Приёмка:**

1. Apply, Cancel и Reset имеют проверяемое поведение, выбранные значения переживают перезапуск.
2. Пользователь различает локальную настройку и записываемое в модель значение; неизвестные ключи не повреждают настройки.

**Факт по коду:** Отдельные настройки уже есть: persistent system/light/dark theme, локальное поведение placement; stored geometry — session-only показ. Централизованной панели с областью действия, Apply/Cancel/Reset и общим переносимым контрактом настроек нет.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/junction-placement.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/junction-placement.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

### appearance

#### A-ADV-114 — Тема приложения и системный выбор

**Класс:** Independent. **Покрытие:** implemented-in-code.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Appearance, печатные стр.159.

**Поведение Arkita:** Выбирать светлую, тёмную или системную тему с читаемыми панелями, таблицами и холстом.

**Приёмка:**

1. Текст, выделение, фокус и disabled состояния различимы во всех темах.
2. Смена темы не переписывает цвета модели; необходимость перезапуска, если есть, показана.

**Зависимости:** A-ADV-113.

**Факт по коду:** Есть system/light/dark control, наблюдение prefers-color-scheme, нормализация/сохранение локального выбора и theme CSS для UI/холста. Смена темы не вызывает store-команд. Статус означает наличие реализации; визуальная Windows/DPI приёмка всех состояний здесь не проводилась.

**Доказательства:** [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-115 — Видимый признак несохранённого документа

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Appearance, печатные стр.159.

**Поведение Arkita:** Делать признак dirty заметным во вкладке, сохранив возможность выбора маркера.

**Приёмка:**

1. Маркер появляется только для реально изменённой модели и читается assistive technology.
2. Circle/asterisk — только отображение; настройка не меняет логику сохранения.

**Факт по коду:** Dirty уже вычисляется сессией и отражается видимым текстом file-state в document bar. file-actions обновляет также маркер и aria-label file-button, однако эта кнопка hidden в текущем HTML. Метки на вкладке/в заголовке окна и выбора circle/asterisk нет; саму логику dirty повторно реализовывать не нужно.

**Доказательства:** [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-ui/src/project-session.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/project-session.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css).

#### A-ADV-116 — Показ или скрытие строки состояния

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Appearance, печатные стр.159.

**Поведение Arkita:** Позволять управлять строкой состояния без потери доступа к существенным сообщениям.

**Приёмка:**

1. Скрытие освобождает место и сохраняется локально.
2. Ошибки записи и блокирующие состояния доступны также вне строки состояния.

**Факт по коду:** Строка состояния присутствует постоянно, файлы и ошибки также имеют собственные диалоги. Команды скрытия/показа status bar и сохранённой настройки видимости нет.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js).

#### A-ADV-117 — Не переносить Mac native row heights как отдельную Windows функцию

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Appearance, печатные стр.159.

**Поведение Arkita:** Специальный переключатель Eclipse/macOS не нужен Windows продукту; читаемая плотность остаётся UX критерием.

**Приёмка:**

1. Нет бессмысленного Mac-only пункта в Windows настройках.
2. Плотность, focus и DPI проверяются на целевой Windows машине.

**Факт по коду:** Исключение из переносимых требований сохранено: Специальный переключатель Eclipse/macOS не нужен Windows продукту; читаемая плотность остаётся UX критерием.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

#### A-ADV-118 — Цвета по умолчанию и локальная тема

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Colours, печатные стр.159–160.

**Поведение Arkita:** Настраивать цвета типов, линий, папок и UI; показывать отличия от умолчаний.

**Приёмка:**

1. Reset выбранных цветов не сбрасывает несвязанные параметры.
2. Локальные папки и фон UI не попадают в модель как случайные изменения.

**Зависимости:** A-ADV-113.

**Факт по коду:** Цвета, шрифты и типовые формы задаются закрытыми notation/CSS mappings и темой. Нет пользовательских цветовых/шрифтовых defaults, импортируемых схем, derived/explicit цветов границы или сохраняемого per-drawing оформления; occurrence schema содержит bounds/parentOccurrenceId/zIndex, не appearance.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-119 — Локальные defaults и фиксированные цвета модели

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Colours, печатные стр.159–160.

**Поведение Arkita:** Явно выбирать, следует новый рисунок локальному default или сохраняет конкретный цвет.

**Приёмка:**

1. Одна модель на двух установках имеет заранее описанное поведение каждого режима.
2. Смена локальной палитры не выдаётся за модельное редактирование.

**Зависимости:** A-ADV-118.

**Факт по коду:** Цвета, шрифты и типовые формы задаются закрытыми notation/CSS mappings и темой. Нет пользовательских цветовых/шрифтовых defaults, импортируемых схем, derived/explicit цветов границы или сохраняемого per-drawing оформления; occurrence schema содержит bounds/parentOccurrenceId/zIndex, не appearance.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-120 — Импорт и экспорт цветовой схемы

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Colours, печатные стр.160.

**Поведение Arkita:** Переносить пользовательский набор цветов между установками.

**Приёмка:**

1. Неверные значения и неизвестные ключи диагностируются до применения.
2. Экспорт/импорт дают одинаковый набор без изменения открытой модели.

**Зависимости:** A-ADV-118.

**Факт по коду:** Цвета, шрифты и типовые формы задаются закрытыми notation/CSS mappings и темой. Нет пользовательских цветовых/шрифтовых defaults, импортируемых схем, derived/explicit цветов границы или сохраняемого per-drawing оформления; occurrence schema содержит bounds/parentOccurrenceId/zIndex, не appearance.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-121 — Производный цвет границы

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Colours, печатные стр.160.

**Поведение Arkita:** Позволять выводить цвет границы из заливки с возможностью индивидуального override.

**Приёмка:**

1. Режим default/derived/explicit различим и сохраняется согласно контракту.
2. Изменение заливки обновляет только производные границы, сохраняя читаемость.

**Зависимости:** A-ADV-118.

**Факт по коду:** Цвета, шрифты и типовые формы задаются закрытыми notation/CSS mappings и темой. Нет пользовательских цветовых/шрифтовых defaults, импортируемых схем, derived/explicit цветов границы или сохраняемого per-drawing оформления; occurrence schema содержит bounds/parentOccurrenceId/zIndex, не appearance.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-122 — Шрифты диаграммы и интерфейса

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Fonts, печатные стр.160.

**Поведение Arkita:** Настраивать шрифты рисунков, связей и интерфейса с понятным reset.

**Приёмка:**

1. Кириллица, emoji и отсутствующий шрифт дают проверенный fallback.
2. Смена UI шрифта не превращается в модельную правку и не обрезает диалоги.

**Факт по коду:** Цвета, шрифты и типовые формы задаются закрытыми notation/CSS mappings и темой. Нет пользовательских цветовых/шрифтовых defaults, импортируемых схем, derived/explicit цветов границы или сохраняемого per-drawing оформления; occurrence schema содержит bounds/parentOccurrenceId/zIndex, не appearance.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-123 — Не копировать фиксированный коэффициент Mac72/Windows96

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §Appearance, Colours, and Fonts Preferences / Fonts, печатные стр.160.

**Поведение Arkita:** Исторический переключатель Eclipse DPI не переносится в Electron; масштаб проверяется средствами целевого приложения.

**Приёмка:**

1. Нет автоматического изменения сохранённых размеров шрифта по эвристике Mac/Windows.
2. Windows100/150/200% и смена монитора имеют отдельные визуальные проверки.

**Факт по коду:** Исключение из переносимых требований сохранено: Исторический переключатель Eclipse DPI не переносится в Electron; масштаб проверяется средствами целевого приложения.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

### preferences

#### A-ADV-124 — Включение инструментов Canvas

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Canvas Modelling Toolkit Preferences / General, печатные стр.161.

**Поведение Arkita:** Если Canvas реализован, позволять скрыть его команды создания из обычного потока.

**Приёмка:**

1. Выключение инструментария не удаляет существующие доски и данные.
2. Пользователь понимает, как открыть существующую доску или включить инструменты.

**Зависимости:** A-ADV-092, A-ADV-113.

**Факт по коду:** Canvas-режим не реализован, поэтому отсутствует и пользовательское включение/скрытие его инструментов. Обычный холст ArchiMate не является этим дополнительным режимом.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/theme.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/theme.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css).

### connection-preferences

#### A-ADV-125 — Порядок выбора в быстром создании связи

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Connections Preferences / Connections / Magic Connector, печатные стр.162.

**Поведение Arkita:** Выбирать element-first или relation-first поток с временным переключением модификатором.

**Приёмка:**

1. Оба порядка приводят к одному валидируемому результату при равном выборе.
2. Модификатор не запускает два действия и не снимает проверку допустимости.

**Факт по коду:** Уже есть два практических пути: выбрать тип отношения и протянуть, либо Magic Relationship сначала выбирает концы и затем тип. Оба идут через типизированные команды и diagnostics. Настройки default-порядка и временной смены порядка модификатором нет.

**Доказательства:** [schemka-model-ui/src/smart-relationship.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/smart-relationship.js), [schemka-model-ui/src/typed-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/typed-actions.js), [schemka-model-ui/src/palette-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/palette-actions.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-126 — Качество отрисовки соединений

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Connections Preferences / Drawing, печатные стр.162.

**Поведение Arkita:** Обеспечить гладкие линии на целевых DPI, оставив настройку качества только если она полезна.

**Приёмка:**

1. Прямые, диагонали и окончания сравниваются на100/150/200%.
2. Выбор качества не изменяет модельные координаты и экспортный смысл.

**Факт по коду:** Линии и маркеры рисуются SVG браузерным renderer, без отдельной bitmap-отрисовки или пользовательского переключателя сглаживания. Наличие SVG — основа качества; сравнение прямых/диагоналей/окончаний на Windows 100/150/200% здесь не выполнено.

**Доказательства:** [schemka-model-ui/src/connection-geometry.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/connection-geometry.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

#### A-ADV-127 — Ортогональные точки примыкания

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Connections Preferences / Drawing, печатные стр.162–163.

**Поведение Arkita:** Предлагать стратегию примыкания, сохраняющую горизонтальные и вертикальные участки.

**Приёмка:**

1. Перемещение узла и bendpoint корректно пересчитывает примыкание на разных фигурах.
2. Ручной anchor не теряется при смене глобальной стратегии.

**Факт по коду:** Geometry уже считает пересечения с контурами и использует ортогональные terminal/exterior маршруты для некоторых специальных форм; ручные anchors хранятся отдельно. Общей выбираемой стратегии ортогонального примыкания на всех фигурах и её UI нет.

**Доказательства:** [schemka-model-ui/src/connection-geometry.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/connection-geometry.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-128 — Скругление изгибов линий

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / Drawing, печатные стр.163.

**Поведение Arkita:** Отображать скруглённые углы маршрутов как визуальный режим.

**Приёмка:**

1. Короткие сегменты, самоссылки и export не создают разрывов.
2. Режим не меняет точки маршрута и не добавляет запись Undo.

**Факт по коду:** Автоматическая геометрия имеет кривые для петель/особых случаев, но сохранённые bendpoints строятся полилинией. Визуального режима скругления углов этих маршрутов, его параметра и экспортного поведения нет.

**Доказательства:** [schemka-model-ui/src/connection-geometry.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/connection-geometry.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js).

#### A-ADV-129 — Переходы на пересечениях линий

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / Drawing, печатные стр.163.

**Поведение Arkita:** Показывать визуальный мостик на пересечении несвязанных линий.

**Приёмка:**

1. Пересечение отличается от настоящего junction и общей конечной точки.
2. Отрисовка и экспорт согласованы, порядок линий детерминирован.

**Факт по коду:** Отрисовка вычисляет геометрию отдельных соединений. Механизма определения пересечений между независимыми линиями, мостиков line jumps и настройки их порядка нет; view anchor/junction имеют другую семантику.

**Доказательства:** [schemka-model-ui/src/connection-geometry.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/connection-geometry.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-130 — Выделение выбранного соединения

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Connections Preferences / Drawing, печатные стр.163.

**Поведение Arkita:** Подсвечивать текущую линию и её управляющие точки.

**Приёмка:**

1. Выделение заметно в светлой и тёмной теме и не попадает в итоговый экспорт.
2. Отключение дополнительного эффекта оставляет базовый доступный индикатор выбора.

**Факт по коду:** CSS .selected/:focus уже подчёркивает линию, layout editor показывает handles/anchors. Настройки дополнительного эффекта и контроля исключения selection при image export ещё нет, поскольку image export отсутствует.

**Доказательства:** [schemka-model-ui/src/connection-geometry.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/connection-geometry.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-131 — Фон подписи соединения

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Connections Preferences / Drawing, печатные стр.163.

**Поведение Arkita:** Предлагать прозрачный, непрозрачный и вырезающий фон под подписью.

**Приёмка:**

1. Фон корректен поверх фигур и пересекающихся связей.
2. Export и печать сохраняют выбранную читаемость без обрезки текста.

**Факт по коду:** Подписи сейчас имеют один CSS halo через paint-order:stroke и цвет холста. Выбора transparent/opaque/clipping режимов и согласованного вывода в печать/изображение нет.

**Доказательства:** [schemka-model-ui/src/connection-geometry.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/connection-geometry.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-132 — Показ влияния переподключения на другие view

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / General, печатные стр.163.

**Поведение Arkita:** Перед изменением общего отношения объяснять, какие представления затронуты.

**Приёмка:**

1. Учитываются все использования, включая несколько рисунков в одном view.
2. Отмена не меняет концы и layout; Undo восстанавливает все затронутые рисунки.

**Факт по коду:** Есть rebindConnectionEndpoint для рисунка: после проверки его конец должен разрешаться в тот же concept endpoint общего отношения. Это не изменение source/target общего relationship во всех видах. Семантической перепривязки и предварительного отчёта всех затронутых видов нет.

**Доказательства:** [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-133 — Явный контракт неявных связей при вложении

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / ARM, печатные стр.163–164.

**Поведение Arkita:** Настраивать визуальное представление существующего отношения вложенностью по правилам Arkita4.

**Приёмка:**

1. Чистая геометрическая вложенность не создаёт семантику сама по себе.
2. Связь остаётся модельным объектом и доступна навигации, даже когда линия скрыта.

**Факт по коду:** parentOccurrenceId!=null прямо отклоняется форматом. Предложения, неявного отображения и скрытия семантических связей через вложенность нет. Viewpoint projection — фильтр, а не создание вложенности; соответствующие правила 3.2 не переносятся.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/viewpoints.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/viewpoints.js).

#### A-ADV-134 — Предложение отношения при создании или перемещении внутрь

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / ARM, печатные стр.163–164.

**Поведение Arkita:** Отдельно настраивать предложение отношения при создании из палитры, повторном использовании и перемещении.

**Приёмка:**

1. Предлагаются только доказанно допустимые для Arkita4 отношения; существующее не дублируется.
2. Отказ от отношения оставляет предсказуемый результат размещения без частичного изменения.

**Зависимости:** A-ADV-133.

**Факт по коду:** parentOccurrenceId!=null прямо отклоняется форматом. Предложения, неявного отображения и скрытия семантических связей через вложенность нет. Viewpoint projection — фильтр, а не создание вложенности; соответствующие правила 3.2 не переносятся.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/viewpoints.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/viewpoints.js).

#### A-ADV-135 — Типы и направление отношения вложенности

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / ARM, печатные стр.164.

**Поведение Arkita:** Выбирать разрешённые для предложения типы parent→child и child→parent.

**Приёмка:**

1. Настройка не расширяет нормативную допустимость и не интерпретирует UNKNOWN как true.
2. Направление показано до commit и совпадает с созданным отношением.

**Зависимости:** A-ADV-133.

**Факт по коду:** parentOccurrenceId!=null прямо отклоняется форматом. Предложения, неявного отображения и скрытия семантических связей через вложенность нет. Viewpoint projection — фильтр, а не создание вложенности; соответствующие правила 3.2 не переносятся.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/viewpoints.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/viewpoints.js).

#### A-ADV-136 — Какие линии скрывать при вложении

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Connections Preferences / ARM, печатные стр.164.

**Поведение Arkita:** Управлять видимостью линий внутри вложенных рисунков отдельно от модельных отношений.

**Приёмка:**

1. Показ/скрытие обратимы и не удаляют anchors или relation-to-relation соединения.
2. После разнесения объектов связи снова доступны с сохранёнными данными.

**Зависимости:** A-ADV-133.

**Факт по коду:** parentOccurrenceId!=null прямо отклоняется форматом. Предложения, неявного отображения и скрытия семантических связей через вложенность нет. Viewpoint projection — фильтр, а не создание вложенности; соответствующие правила 3.2 не переносятся.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-core/src/viewpoints.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/viewpoints.js).

### diagram-preferences

#### A-ADV-137 — Шаг сетки и свободное место по краям

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Diagram Preferences / View, печатные стр.165.

**Поведение Arkita:** Настраивать сетку и рабочий отступ, чтобы объекты у края оставались доступны.

**Приёмка:**

1. Изменение сетки не передвигает уже созданные объекты без отдельной команды.
2. Отступ работает при zoom и на отрицательных координатах; элементы не закрываются scrollbars.

**Факт по коду:** Сетка нарисована фиксированным CSS узором, координаты округляются, камера умеет fit/reveal и отрицательные области. Пользовательской настройки шага/отступа и явного режима snap-to-grid нет; изменение существующей геометрии сеткой не выполняется.

**Доказательства:** [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-ui/src/viewport.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewport.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-138 — Начальная видимость палитры

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / View, печатные стр.165.

**Поведение Arkita:** Задавать, открывать ли палитру при входе в view.

**Приёмка:**

1. Настройка локальна и не меняет модель.
2. Закрытая палитра имеет доступный способ повторного открытия.

**Факт по коду:** Палитра имеет фиксированную панель и раскрываемые группы, поиск типов восстанавливает состояние групп. Настройки «автоматически открывать палитру при входе в view» и отдельной политики её видимости нет.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/palette-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/palette-actions.js), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js).

#### A-ADV-139 — Подсказки объектов на холсте

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Diagram Preferences / View, печатные стр.165.

**Поведение Arkita:** Управлять всплывающими подсказками без потери доступа к данным через инспектор.

**Приёмка:**

1. Tooltip не перекрывает захват мыши и не крадёт фокус.
2. Скрытие tooltip не делает описание недоступным с клавиатуры.

**Факт по коду:** На SVG/кнопках есть native title, доступные имена и инспектор с полными данными. Пользовательского включения/выключения diagram tooltips нет; основная информация уже доступна без hover.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/element-captions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/element-captions.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-140 — Редактирование имени сразу после создания

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / View, печатные стр.165.

**Поведение Arkita:** Настраивать автоматический вход в редактирование имени новой фигуры.

**Приёмка:**

1. Escape отменяет имя с заранее определённой судьбой созданного объекта.
2. Повторный ввод и потеря фокуса не создают дополнительные концепты или пустые Undo.

**Факт по коду:** Создание элемента открывает форму и просит имя до команды; существующий inline rename вызывается отдельно. Настраиваемого автоматического входа в rename после создания и соответствующей политики Escape нет.

**Доказательства:** [schemka-model-ui/src/typed-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/typed-actions.js), [schemka-model-ui/src/inline-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/inline-editor.js), [schemka-model-ui/src/drag-drop.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/drag-drop.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-141 — Специализации в палитре, дереве и меню создания

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / View; General Preferences / Model Tree, печатные стр.165; 169.

**Поведение Arkita:** Показывать доступные специализации и их иконки рядом с базовыми типами.

**Приёмка:**

1. Каталог обновляется при изменении профиля; неподходящая специализация не создаётся.
2. Выключение визуальной опции не снимает назначений с существующих концептов.

**Зависимости:** A-ADV-021.

**Факт по коду:** Палитра/контекстное создание перечисляют базовые CURRENT_CATALOG types. Применённые профили видны в инспекторе и подписи, но specialization entries/icons для создания в палитре/дереве и настройка их показа отсутствуют.

**Доказательства:** [schemka-model-ui/src/palette-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/palette-actions.js), [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-ui/src/customization-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/customization-ui.js), [schemka-model-ui/src/context-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/context-actions.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-142 — Настройка быстрого добавления с холста

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / View, печатные стр.165.

**Поведение Arkita:** Дать управлять Alt-click вызовом быстрого создания, сохранив доступную клавиатурную команду.

**Приёмка:**

1. Shortcut не конфликтует с pan/drag и модальным вводом.
2. Точка вставки рассчитывается по камере, отмена не создаёт объект.

**Факт по коду:** Есть контекстное меню создания и клавиатурные команды, но нет Alt-click Quick Add popup, его включения или связанной настройки сочетаний. Наличие обычного context menu не считается этой возможностью.

**Доказательства:** [schemka-model-ui/src/context-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/context-actions.js), [schemka-model-ui/src/context-menu.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/context-menu.js), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-143 — Отображение ограничений viewpoint в интерфейсе

**Класс:** Adapt. **Покрытие:** partial.

**Источник:** Guide5.10 §Diagram Preferences / Viewpoints, печатные стр.165.

**Поведение Arkita:** Согласовать disabled/hidden/ghost состояния дерева, палитры, connector и холста.

**Приёмка:**

1. Все четыре поверхности используют один источник правил Arkita4.
2. Скрытие не удаляет данные, а UNKNOWN объясняется отдельно от запрета.

**Факт по коду:** Canvas projection, palette visibility, disabled reuse в дереве и создание связей используют текущие viewpoint правила. Нет пользовательского согласованного выбора hidden/disabled/ghost presentation для всех поверхностей; диагностические UNKNOWN не заменяют запрет.

**Доказательства:** [schemka-model-core/src/viewpoints.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/viewpoints.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-ui/src/viewpoint-ui.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/viewpoint-ui.js), [schemka-model-ui/src/palette-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/palette-actions.js), [schemka-model-ui/src/smart-relationship.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/smart-relationship.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js).

#### A-ADV-144 — Явное значение по умолчанию для Paste Special

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / Paste Special behaviour, печатные стр.166.

**Поведение Arkita:** Дать выбрать повторное использование концепта либо создание независимого дубликата.

**Приёмка:**

1. UI до вставки показывает выбранную семантику и позволяет её изменить.
2. Одинаковый режим даёт предсказуемые ID в текущем и другом view; переход между моделями отдельно определён.

**Факт по коду:** Clipboard используется для текста Mermaid. Copy/Paste/Paste Special концептов или фрагментов и настройки default clone/reuse нет. addOccurrence и duplicateView существуют, но не создают clipboard workflow.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js).

#### A-ADV-145 — Поведение детей при resize контейнера

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / Resize behaviour, печатные стр.166.

**Поведение Arkita:** Определить режим сохранения абсолютной позиции детей или отступа от родителя.

**Приёмка:**

1. Resize сверху/слева проверен на вложенных контейнерах и связях.
2. Отмена/Undo восстанавливают всю геометрию, а смена настройки сама ничего не двигает.

**Факт по коду:** Поддерживается resize одного occurrence; вложенные parent/child drawings запрещены схемой. Поэтому стратегии перемещения детей при resize родителя и её настройки нет.

**Доказательства:** [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-146 — Перенос и сокращение текста фигуры

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §Diagram Preferences / Appearance, печатные стр.166.

**Поведение Arkita:** Поддержать перенос по словам, перенос длинного слова и явное сокращение текста.

**Приёмка:**

1. Длинная кириллица, URL и emoji не ломают границы фигуры.
2. Полный текст остаётся доступен; экспорт использует те же правила измерения.

**Факт по коду:** Есть ограниченное измерение по grapheme boundaries, перенос слов, ellipsis и подгонка строк к контуру; исходное имя и доступное полное представление сохраняются. Общего image/document exporter с тем же измерителем пока нет; Windows font/DPI acceptance отдельно.

**Доказательства:** [schemka-model-ui/src/element-captions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/element-captions.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/node-shapes.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/node-shapes.js), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js).

#### A-ADV-147 — Размер и оформление новых рисунков

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / Appearance, печатные стр.166–167.

**Поведение Arkita:** Задавать стартовую ширину, высоту, выравнивание, позицию текста и градиент.

**Приёмка:**

1. Defaults влияют на новые рисунки и не перезаписывают старые.
2. Неподдержанный градиент в формате экспорта явно обработан, без незаметной потери оформления.

**Факт по коду:** У новых фигур есть кодовые размеры и фиксированные правила caption/layout. Настройки стартовой ширины/высоты/выравнивания/градиента отсутствуют; нативная схема не хранит пользовательское appearance.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/typed-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/typed-actions.js), [schemka-model-ui/src/element-captions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/element-captions.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-148 — Допустимые альтернативные фигуры по умолчанию

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / Default Figures, печатные стр.167.

**Поведение Arkita:** Выбирать варианты изображения типов только внутри поддержанного набора Arkita4.

**Приёмка:**

1. Вариант не меняет concept type и его отношения.
2. Preview, новый рисунок и экспорт согласованы с выбранной формой.

**Факт по коду:** Для каждого типа работает закрытое соответствие форме нотации Arkita 4. Session stored-geometry переключает маршруты, не фигуры. Выбора альтернативной фигуры и сохраняемого figure variant нет.

**Доказательства:** [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-ui/src/node-shapes.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/node-shapes.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-149 — Настройки легенды

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §Diagram Preferences / Legend, печатные стр.167–168.

**Поведение Arkita:** Задавать сортировку, цветовую схему, число строк на колонку и подписи типов.

**Приёмка:**

1. Типы и категории берутся из каталога Arkita4; локальные подписи и сохранённые значения различимы.
2. Новая легенда использует defaults, существующая не перезаписывается; экспорт понятен на другой машине.

**Факт по коду:** В Help есть статическая легенда нотации, с теми же mapping что у палитры. Объекта легенды в модели и настроек его сортировки/колонок/подписей/цветов нет; справочная таблица не считается вставляемой легендой.

**Доказательства:** [schemka-model-ui/src/notation.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/notation.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

### general-preferences

#### A-ADV-150 — Открытие view при загрузке модели

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §General Preferences / Files, печатные стр.169.

**Поведение Arkita:** Выбирать, какие view открывать автоматически, с ограничением объёма работы.

**Приёмка:**

1. Большая модель не открывает неограниченное число вкладок и остаётся отзывчивой.
2. Отказ от автооткрытия не скрывает наличие view; лимит не обязан повторять исторические100 Archi.

**Факт по коду:** Полный SVG строится только для активного view; после загрузки выбирается один вид. Но tabs/list создаются для всех views, понятия opened/closed set и настраиваемой политики/лимита автоматического открытия нет. Порог отзывчивости на большой модели не измерялся.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-151 — Резервная копия при сохранении

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Files, печатные стр.169.

**Поведение Arkita:** Сохранять предыдущую успешную версию перед заменой файла по явной настройке.

**Приёмка:**

1. Backup действительно содержит предыдущий читаемый документ; ошибка копирования имеет явный результат.
2. Ротация и восстановление определены; backup не обходится при внешнем конфликте записи.

**Зависимости:** A-ADV-039.

**Факт по коду:** Есть проверяемая запись и journal/recovery для прерванного directory update. Это не сохраняемая предыдущая успешная версия: нет настройки backup, ротации и пользовательского восстановления истории файлов. Git commits — отдельный существующий механизм версий.

**Доказательства:** [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [electron/file-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/file-service.mjs), [electron/project-files.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/project-files.mjs), [electron/directory-update.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/directory-update.mjs), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-152 — Недавние файлы и размер списка

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Files, печатные стр.169.

**Поведение Arkita:** Давать быстро открывать недавние модели с различимыми полными путями.

**Приёмка:**

1. Дубликаты путей нормализуются; недоступный файл не заменяет текущую модель.
2. Лимит списка настраивается локально и не зависит от содержимого проекта.

**Факт по коду:** Нет списка недавних проектов, MRU persist/нормализации и настройки лимита. Native dialogs используют dontAddToRecent; текущая sourceLabel показывает только активный документ.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js), [electron/file-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/file-service.mjs), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

#### A-ADV-153 — Признак неиспользуемых концептов в дереве

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §General Preferences / Model Tree, печатные стр.169.

**Поведение Arkita:** Отмечать концепты без рисунков в view, не ограничиваясь одним наклонным шрифтом.

**Приёмка:**

1. Добавление/удаление использования обновляет признак без перезапуска.
2. Фильтр viewpoint не превращает используемый концепт в неиспользуемый.

**Зависимости:** A-ADV-029.

**Факт по коду:** Инспектор выбранного концепта считает использования во всей модели. Дерево показывает только количество occurrence в текущем проецируемом view; отдельного глобального unused-маркера, не зависящего от viewpoint, нет.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js).

#### A-ADV-154 — Поиск при вводе либо по Enter

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Model Tree, печатные стр.169.

**Поведение Arkita:** Настраивать запуск поиска для удобства и больших моделей.

**Приёмка:**

1. Оба режима дают одинаковые результаты для завершённого запроса.
2. Escape и очистка возвращают прежнее состояние дерева без потери текущего выделения.

**Факт по коду:** Есть живой поиск типов в палитре с восстановлением раскрытия групп. Поиска объектов модели и пользовательской настройки его запуска «при вводе/Enter» нет; эти два вида поиска не следует смешивать.

**Доказательства:** [schemka-model-ui/src/palette-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/palette-actions.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-155 — Предупреждение об удалении модельных объектов

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §General Preferences / Model Tree, печатные стр.169.

**Поведение Arkita:** Настраивать частоту подтверждения удаления, сохранив объяснение влияния на другие view.

**Приёмка:**

1. В диалоге различимы удаление рисунка и удаление концепта со всеми использованиями.
2. Отмена не меняет модель; отключённый общий совет не отключает проверки ссылочной целостности.

**Факт по коду:** deleteImpact/drawingDeletionImpact и подтверждение уже различают удаление рисунка и общего концепта, показывают затронутые виды/связи и атомарно удаляют зависимую цепочку. Нет настройки частоты предупреждения. Проверку ссылочной целостности и существующий preview сохранять.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-156 — Естественная сортировка имён

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Model Tree, печатные стр.169.

**Поведение Arkita:** Предлагать порядок с числовыми фрагментами вида1,2,10.

**Приёмка:**

1. Порядок детерминирован для кириллицы, регистра, ведущих нулей и равных имён.
2. Сортировка отображения не переставляет хранимые записи и не загрязняет Git diff.

**Факт по коду:** Порядок сериализации канонизируется по ID, views/рисунки также стабилизируются по ID/zIndex. Пользовательской сортировки имён с числовыми фрагментами и объявленных правил natural comparison нет; стабильный ID порядок не считается natural sort.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-157 — Постепенная отрисовка больших папок

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Model Tree, печатные стр.169.

**Поведение Arkita:** Ограничивать начальную порцию дерева с доступной загрузкой оставшихся объектов.

**Приёмка:**

1. Поиск охватывает всю модель, а не только уже отображённые строки.
2. Выбор найденного объекта раскрывает нужную порцию; scrolling и focus не теряются.

**Факт по коду:** renderCatalog строит строки полного набора элементов/отношений и всех видов; фиксированные details-группы лишь раскрываются/скрываются. Windowing, загрузки порциями и поиска по всему набору независимо от видимых строк нет.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/palette-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/palette-actions.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-158 — Подписи view в таблицах анализа

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Label Expressions, печатные стр.170.

**Поведение Arkita:** Применять понятные подписи и путь папки к использованию концепта в разных view.

**Приёмка:**

1. Одинаковые имена view различимы по пути и ID.
2. Выражение меняет только подпись анализа и имеет безопасный fallback; само имя view сохраняется.

**Факт по коду:** Нет списка uses с отдельными подписями/выражениями и пользовательской иерархии папок. Инспектор сообщает суммарные counts; parent path и label-expression для результатов анализа отсутствуют.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-core/src/format.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/format.js).

#### A-ADV-159 — Объяснение преобразований отношений при смене типа

**Класс:** Adapt. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Other, печатные стр.170.

**Поведение Arkita:** Если команда смены типа меняет зависимые отношения, показывать и при необходимости фиксировать причины.

**Приёмка:**

1. Не копируется автоматическое понижение отношения до Association из Archi: действует отдельное решение Arkita4.
2. Исходная документация не затирается; preview и Undo охватывают всю транзакцию.

**Факт по коду:** Есть ограниченная смена And/Or junction с валидацией; общей смены типа элемента/отношения с перестройкой зависимостей, preview и заметкой в документации нет. Автоматическое понижение отношений до Association не выполняется и не должно добавляться по аналогии с Archi 3.2.

**Доказательства:** [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-160 — Явный масштаб экспорта изображения

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Other, печатные стр.170.

**Поведение Arkita:** Выбирать логический либо заданный/native масштаб экспорта и clipboard с ожидаемыми пиксельными размерами.

**Приёмка:**

1. Результат соответствует preview размеров на100/150/200% и после смены монитора.
2. Системный DPI не создаёт скрытое изменение геометрии или качества.

**Факт по коду:** Image export и image clipboard отсутствуют; файловый экспорт native/Mermaid не предоставляет пиксельных размеров/DPI. Настройка logical/native/image scale пока не существует.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-io/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-io/src/index.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-ui/src/file-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/file-actions.js).

#### A-ADV-161 — Не переносить переключатель Eclipse Edge/WebView2

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §General Preferences / Internal Web Browser, печатные стр.170.

**Поведение Arkita:** Выбор старого встроенного browser engine и очистка его кэша относятся к архитектуре Archi/Eclipse.

**Приёмка:**

1. Arkita использует собственный поддерживаемый механизм preview/help.
2. Если кэш мешает пользователю, его очистка проектируется для фактического renderer, без требования Edge runtime.

**Факт по коду:** Исключение из переносимых требований сохранено: Выбор старого встроенного browser engine и очистка его кэша относятся к архитектуре Archi/Eclipse.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

#### A-ADV-162 — Политика интерактивного содержимого подсказок

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Internal Web Browser, печатные стр.170.

**Поведение Arkita:** Явно определить, разрешены ли интерактивные подсказки и какие ограниченные возможности им доступны.

**Приёмка:**

1. Обычный текст модели не получает выполнение скриптов только от выбора объекта.
2. Если интерактивность реализована, область доступа, отключение и поведение offline проверены.

**Зависимости:** A-ADV-016, A-ADV-100.

**Факт по коду:** Текст модели выводится инертно, renderer ограничивает сеть/навигацию и не предоставляет произвольный privileged API. Но локальной hints-подсистемы с активным/внешним содержимым, настройкой разрешений и offline fallback нет. Существующие ограничения сохранять; отсутствие активной справки не является дефектом безопасности.

**Доказательства:** [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-163 — Управление внешними ресурсами подсказок

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Internal Web Browser, печатные стр.170.

**Поведение Arkita:** Различать встроенное описание и контент с внешнего адреса.

**Приёмка:**

1. Offline режим не блокирует доступ к локальной справке.
2. Открытие внешнего адреса и его разрешения явны; недоступный ресурс не ломает инспектор.

**Зависимости:** A-ADV-016.

**Факт по коду:** Текст модели выводится инертно, renderer ограничивает сеть/навигацию и не предоставляет произвольный privileged API. Но локальной hints-подсистемы с активным/внешним содержимым, настройкой разрешений и offline fallback нет. Существующие ограничения сохранять; отсутствие активной справки не является дефектом безопасности.

**Доказательства:** [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-164 — Анимация изменений диаграммы

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Animation, печатные стр.171.

**Поведение Arkita:** Настраивать анимацию Undo/Redo и смены маршрутизации, включая полное отключение.

**Приёмка:**

1. Конечная геометрия одинакова при включённой и выключенной анимации.
2. Скорость ограничена, reduced-motion соблюдается, повторная команда не оставляет промежуточного состояния.

**Факт по коду:** Undo/Redo и смена геометрии вызывают непосредственный render. Управляемой модельной анимации маршрутов/Undo со скоростью, отменой и пользовательским отключением нет; CSS состояния элементов UI — другая область.

**Доказательства:** [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/layout-editor.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/layout-editor.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-165 — Анимация раскладки аналитического графа

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §General Preferences / Animation, печатные стр.171.

**Поведение Arkita:** Настраивать анимацию появления и повторной раскладки окрестности.

**Приёмка:**

1. Отключение даёт немедленный законченный результат.
2. Новый корень/фильтр отменяет старую анимацию без наложения графов.

**Зависимости:** A-ADV-005.

**Факт по коду:** Visualiser отсутствует, вместе с ним отсутствует и анимация появления/повторной раскладки временного графа. Анимации обычного UI не покрывают этот пункт.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/controller.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/controller.js), [schemka-model-core/src/resolve.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/resolve.js), [schemka-model-ui/style.css](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/style.css).

### system

#### A-ADV-166 — Способ показа справки

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §System Preferences / Help, печатные стр.173.

**Поведение Arkita:** Дать понятный способ выбора встроенного или внешнего показа справки там, где оба поддерживаются.

**Приёмка:**

1. Выбранный способ открывает правильный раздел и имеет рабочий fallback.
2. Руководство не перечисляет более точных опций; они не приписываются Archi без дополнительного источника.

**Факт по коду:** Справка — встроенный статический диалог. Выбора backend показа, открытия заданного раздела внешним viewer и сохранения Help preference нет.

**Доказательства:** [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html), [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-167 — Переназначаемые сочетания клавиш

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §System Preferences / Keys, печатные стр.173.

**Поведение Arkita:** Показывать команды Arkita, назначать сочетания по контексту и возвращать defaults.

**Приёмка:**

1. Конфликты видны до применения; текстовый ввод не запускает модельные команды.
2. Настройки сохраняются, активные shortcut подсказаны рядом с командой.

**Факт по коду:** Реальные фиксированные shortcuts, подсказки и guard текстового ввода уже есть. Менеджера команд/контекстов с пользовательским назначением, проверкой конфликтов и сохранением настроек нет; существующие сочетания не требуется заново создавать.

**Доказательства:** [schemka-model-ui/src/workbench.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/workbench.js), [schemka-model-ui/src/app.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/app.js), [schemka-model-ui/src/context-menu.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/context-menu.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-168 — Не переносить посторонние команды Eclipse

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §System Preferences / Keys, печатные стр.173.

**Поведение Arkita:** Bookmarks, perspectives, Content Assist и другие framework команды не являются функциональностью Arkita редактора.

**Приёмка:**

1. Список горячих клавиш содержит только реальные команды приложения.
2. Сброс интерфейса, если нужен, не разрушает несохранённые модели.

**Факт по коду:** Исключение из переносимых требований сохранено: Bookmarks, perspectives, Content Assist и другие framework команды не являются функциональностью Arkita редактора.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

#### A-ADV-169 — Сетевой proxy для подключённых функций

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §System Preferences / Network Connections, печатные стр.173.

**Поведение Arkita:** Применять системный или явно выбранный proxy к фактическим сетевым операциям Arkita.

**Приёмка:**

1. Проверены direct, proxy, ошибка авторизации и недоступная сеть.
2. Локальное редактирование не зависит от успешности сетевого соединения.

**Факт по коду:** Сеть в продукте нужна Git; запускаемый Git использует обычную конфигурацию/окружение, поэтому внешний git proxy является базой. В UI/IPC нет отдельного выбора системного/manual proxy. Direct/proxy/auth failure на реальной Windows сети в этой проверке не выполнялись.

**Доказательства:** [electron/git-repository.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-repository.mjs), [electron/git-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-service.mjs), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [schemka-model-ui/src/git-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/git-actions.js).

#### A-ADV-170 — Управление сохранёнными учётными данными

**Класс:** Independent. **Покрытие:** partial.

**Источник:** Guide5.10 §System Preferences / Secure Storage, печатные стр.173.

**Поведение Arkita:** Для подключённых сервисов использовать хранилище целевой ОС с понятным удалением сохранённой авторизации.

**Приёмка:**

1. Секреты не записываются в модель, Git или обычные логи.
2. Удаление авторизации отменяет её дальнейшее использование, сохраняя локальную модель.

**Факт по коду:** Существующий Git предлагает SSH/Git Credential Manager и использует credential.interactive; авторские name/email не являются секретами. Собственного password store в модели нет. UI удаления сохранённой авторизации/управления OS credentials и проверка фактического helper на Windows отсутствуют; не нужна параллельная система хранения паролей.

**Доказательства:** [electron/git-repository.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-repository.mjs), [electron/git-service.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/git-service.mjs), [schemka-model-ui/src/git-actions.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/src/git-actions.js), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs).

#### A-ADV-171 — Выбор открытия внешнего содержимого

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §System Preferences / Web Browser, печатные стр.173.

**Поведение Arkita:** Согласовать открытие web ссылок и отчётов системным браузером либо поддержанным встроенным просмотром.

**Приёмка:**

1. Неподдерживаемая схема и отсутствующий браузер дают понятный результат.
2. Внешняя страница не получает привилегий desktop renderer.

**Факт по коду:** В preload нет openExternal/browser API; renderer навигация/popups ограничены. Пользовательского выбора системного/встроенного браузера и маршрута открытия ссылок/отчётов нет; текст ссылки на источник не доказывает реализацию внешнего открытия.

**Доказательства:** [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [electron/window-guards.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/window-guards.mjs), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

### plugins

#### A-ADV-172 — Каталог подключённых расширений

**Класс:** Independent. **Покрытие:** absent.

**Источник:** Guide5.10 §Managing Plug-ins / Using the Plug-ins Manager, печатные стр.175.

**Поведение Arkita:** Рассмотреть управляемые расширения с перечнем, версиями, описанием, установкой и удалением как отдельный продуктовый слой.

**Приёмка:**

1. Совместимость и необходимые возможности видны до установки; неполная установка не ломает основной редактор.
2. Удаление и требуемый перезапуск имеют понятный результат; данные модели не удаляются вместе с расширением.

**Факт по коду:** Поставляемый app имеет закрытые IPC и built-in registry. Нет списка расширений, manifest/version/capability контрактов, установки/удаления и загрузчика пользовательских модулей. Dev dependencies и bundled Git не являются plugin manager.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs), [electron/preload.cjs](https://github.com/smart-tinker/arkita/blob/main/electron/preload.cjs), [schemka-model-core/src/index.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/index.js), [schemka-model-core/src/store.js](https://github.com/smart-tinker/arkita/blob/main/schemka-model-core/src/store.js), [schemka-model-ui/index.html](https://github.com/smart-tinker/arkita/blob/main/schemka-model-ui/index.html).

#### A-ADV-173 — Не переносить jar/dropins/.archiplugin механизм

**Класс:** Exclude. **Покрытие:** excluded.

**Источник:** Guide5.10 §Managing Plug-ins / Using the Plug-ins Manager; Manual installation, печатные стр.175.

**Поведение Arkita:** Пакеты Java/Eclipse и ручное копирование jar относятся к реализации Archi, а не к пользовательской ценности Arkita.

**Приёмка:**

1. Arkita не заявляет совместимость с бинарными Archi плагинами.
2. Нужные функции конкретных плагинов получают отдельные требования и реализацию или адаптер.

**Факт по коду:** Исключение из переносимых требований сохранено: Пакеты Java/Eclipse и ручное копирование jar относятся к реализации Archi, а не к пользовательской ценности Arkita.

**Доказательства:** [package.json](https://github.com/smart-tinker/arkita/blob/main/package.json), [electron/main.mjs](https://github.com/smart-tinker/arkita/blob/main/electron/main.mjs).

## Полная карта разделов оглавления

| Раздел Guide5.10 | Страница | Карточки / решение |
|---|---:|---|
| The Navigator Window | 90 | A-ADV-001, A-ADV-002, A-ADV-003, A-ADV-004 |
| The Visualiser Window | 93 | A-ADV-005, A-ADV-006, A-ADV-007, A-ADV-008, A-ADV-009, A-ADV-010, A-ADV-011, A-ADV-012, A-ADV-013, A-ADV-014, A-ADV-015, A-ADV-165 |
| Options | 93 | A-ADV-006, A-ADV-007, A-ADV-008, A-ADV-009, A-ADV-010, A-ADV-011, A-ADV-012, A-ADV-013, A-ADV-014, A-ADV-015 |
| Depth | 93 | A-ADV-006 |
| Viewpoint Filter | 93 | A-ADV-007 |
| Element Filter | 93 | A-ADV-008 |
| Relationship Filter | 94 | A-ADV-009 |
| Direction | 94 | A-ADV-010 |
| Manhattan Router | 94 | A-ADV-011 |
| Other Options | 94 | A-ADV-012, A-ADV-013, A-ADV-014, A-ADV-015 |
| The Hints Window | 95 | A-ADV-016, A-ADV-017 |
| The Outline Window | 96 | A-ADV-018 |
| Tools | 97 | A-ADV-019, A-ADV-020, A-ADV-021, A-ADV-022, A-ADV-023, A-ADV-024, A-ADV-025, A-ADV-026, A-ADV-027, A-ADV-028, A-ADV-029, A-ADV-030, A-ADV-031, A-ADV-032, A-ADV-033, A-ADV-034, A-ADV-035 |
| Generate a View from Elements | 98 | A-ADV-019 |
| Properties Manager | 99 | A-ADV-020 — §99 is a cross-reference; substantive manager behavior read at §User Properties88. Keep one manager card across both guide parts. |
| Specializations Manager | 100 | A-ADV-021, A-ADV-022, A-ADV-023, A-ADV-024, A-ADV-141 |
| Background | 100 | A-ADV-021 — Adapt semantic specialization to the existing Arkita4 profile model; no normative3.2 text copied. |
| Using the Specializations Manager | 100 | A-ADV-021, A-ADV-022, A-ADV-023, A-ADV-024 |
| The Validator | 102 | A-ADV-025, A-ADV-026, A-ADV-027, A-ADV-028, A-ADV-029, A-ADV-030, A-ADV-031, A-ADV-032, A-ADV-033, A-ADV-034 |
| Preview HTML Report | 104 | A-ADV-035 |
| Opening, Saving and Printing | 105 | A-ADV-036, A-ADV-037, A-ADV-038, A-ADV-039, A-ADV-040, A-ADV-041, A-ADV-042, A-ADV-043 |
| Opening an Existing Model | 105 | A-ADV-036, A-ADV-037, A-ADV-038 |
| Saving a Model | 105 | A-ADV-039, A-ADV-040 |
| Closing a Model in the Model Tree | 105 | A-ADV-041, A-ADV-042 |
| Printing A View (Diagram) | 105 | A-ADV-043 |
| Exporting and Importing the Model in CSV Format | 106 | A-ADV-044, A-ADV-045, A-ADV-046, A-ADV-047, A-ADV-048, A-ADV-049, A-ADV-050, A-ADV-051, A-ADV-052, A-ADV-053, A-ADV-054 |
| Export Model To CSV | 106 | A-ADV-044, A-ADV-045, A-ADV-046, A-ADV-047, A-ADV-048 |
| Importing CSV Data into a Model | 107 | A-ADV-049, A-ADV-050, A-ADV-051, A-ADV-052, A-ADV-053, A-ADV-054 |
| Importing Another Model into the Current Model | 111 | A-ADV-055, A-ADV-056, A-ADV-057, A-ADV-058, A-ADV-059 |
| Importing another Archi model | 111 | A-ADV-055, A-ADV-056, A-ADV-057, A-ADV-058, A-ADV-059 — Separate native Arkita merge from conversion of legacy Archi files. |
| The Open Group Exchange File Format | 113 | A-ADV-060, A-ADV-061, A-ADV-062, A-ADV-063, A-ADV-064, A-ADV-065, A-ADV-066, A-ADV-067 |
| Exporting and Settings | 113 | A-ADV-060, A-ADV-061, A-ADV-062, A-ADV-063 |
| Options | 113 | A-ADV-061, A-ADV-062, A-ADV-063 |
| Adding Metadata | 113 | A-ADV-064 |
| Importing from an Open Exchange XML file | 114 | A-ADV-065, A-ADV-066 |
| Reporting | 115 | A-ADV-035, A-ADV-068, A-ADV-069, A-ADV-070, A-ADV-071, A-ADV-072, A-ADV-073, A-ADV-074, A-ADV-075, A-ADV-076, A-ADV-077, A-ADV-078, A-ADV-079 |
| HTML Report | 116 | A-ADV-068, A-ADV-069, A-ADV-070, A-ADV-071, A-ADV-072, A-ADV-073, A-ADV-074 |
| Searching the model | 116 | A-ADV-069 |
| Zooming a view | 116 | A-ADV-070 |
| Masking | 116 | A-ADV-071, A-ADV-072 — Guide describes navigation-only masking; actual byte exclusion is an explicit Arkita improvement, not an Archi claim. |
| SQL Query | 117 | A-ADV-073 |
| Jasper Reports | 118 | A-ADV-075, A-ADV-076, A-ADV-077, A-ADV-078, A-ADV-079 |
| Customisable Report | 119 | A-ADV-075 |
| User Report Templates | 120 | A-ADV-077, A-ADV-079 |
| Output | 120 | A-ADV-076, A-ADV-075 |
| Templates | 122 | A-ADV-080, A-ADV-081, A-ADV-082, A-ADV-083, A-ADV-084, A-ADV-085 |
| Creating a New Template | 122 | A-ADV-080, A-ADV-081, A-ADV-085, A-ADV-084 |
| Creating a New Model from a Template | 123 | A-ADV-082, A-ADV-081, A-ADV-083 |
| Managing your Templates | 124 | A-ADV-084 |
| Relationships in ArchiMate | 127 | A-ADV-086 — Only Arkita4 ALLOWED/FORBIDDEN/UNKNOWN sources may populate the matrix. |
| The Sketch View | 128 | A-ADV-087, A-ADV-088, A-ADV-089, A-ADV-090, A-ADV-091 — Optional product area. Guide calls it experimental and potentially deprecated; later conversion is not a documented automatic converter. |
| The Canvas Modelling Toolkit | 131 | A-ADV-092, A-ADV-093, A-ADV-094, A-ADV-095, A-ADV-096, A-ADV-097, A-ADV-098, A-ADV-099, A-ADV-100, A-ADV-101, A-ADV-102, A-ADV-103, A-ADV-104, A-ADV-105, A-ADV-106, A-ADV-107, A-ADV-108, A-ADV-109, A-ADV-110, A-ADV-111, A-ADV-112 |
| Getting Started | 131 | A-ADV-112, A-ADV-094, A-ADV-095, A-ADV-099, A-ADV-100 |
| Getting into the Details | 134 | A-ADV-092, A-ADV-094, A-ADV-095, A-ADV-096, A-ADV-102, A-ADV-100, A-ADV-099, A-ADV-101, A-ADV-103, A-ADV-104 |
| Canvas Block | 141 | A-ADV-094, A-ADV-099, A-ADV-100, A-ADV-101, A-ADV-104, A-ADV-105, A-ADV-107 |
| Canvas Sticky | 144 | A-ADV-095, A-ADV-099, A-ADV-101, A-ADV-104, A-ADV-105 |
| Canvas Image | 147 | A-ADV-102, A-ADV-099, A-ADV-101, A-ADV-103, A-ADV-107 |
| Canvas Connection | 148 | A-ADV-096, A-ADV-097, A-ADV-098, A-ADV-099 |
| Adding Images to Objects | 151 | A-ADV-103, A-ADV-104, A-ADV-105, A-ADV-106, A-ADV-107, A-ADV-108, A-ADV-109, A-ADV-110 |
| Saving a Canvas as a Template | 152 | A-ADV-111, A-ADV-084 |
| Creating a New Canvas from a Template | 154 | A-ADV-112, A-ADV-082, A-ADV-081 |
| Managing your Canvas Templates | 155 | A-ADV-084 |
| Preferences | 158 | A-ADV-113, A-ADV-114, A-ADV-115, A-ADV-116, A-ADV-117, A-ADV-118, A-ADV-119, A-ADV-120, A-ADV-121, A-ADV-122, A-ADV-123, A-ADV-124, A-ADV-125, A-ADV-126, A-ADV-127, A-ADV-128, A-ADV-129, A-ADV-130, A-ADV-131, A-ADV-132, A-ADV-133, A-ADV-134, A-ADV-135, A-ADV-136, A-ADV-137, A-ADV-138, A-ADV-139, A-ADV-140, A-ADV-141, A-ADV-142, A-ADV-143, A-ADV-144, A-ADV-145, A-ADV-146, A-ADV-147, A-ADV-148, A-ADV-149, A-ADV-150, A-ADV-151, A-ADV-152, A-ADV-153, A-ADV-154, A-ADV-155, A-ADV-156, A-ADV-157, A-ADV-158, A-ADV-159, A-ADV-160, A-ADV-161, A-ADV-162, A-ADV-163, A-ADV-164, A-ADV-165, A-ADV-166, A-ADV-167, A-ADV-168, A-ADV-169, A-ADV-170, A-ADV-171, A-ADV-034, A-ADV-077 |
| Appearance, Colours, and Fonts Preferences | 159 | A-ADV-114, A-ADV-115, A-ADV-116, A-ADV-117, A-ADV-118, A-ADV-119, A-ADV-120, A-ADV-121, A-ADV-122, A-ADV-123 |
| Appearance | 159 | A-ADV-114, A-ADV-115, A-ADV-116, A-ADV-117 |
| Colours | 159 | A-ADV-118, A-ADV-119, A-ADV-120, A-ADV-121 |
| Fonts | 160 | A-ADV-122, A-ADV-123 |
| Canvas Modelling Toolkit Preferences | 161 | A-ADV-124 |
| General | 161 | A-ADV-124 |
| Connections Preferences | 162 | A-ADV-125, A-ADV-126, A-ADV-127, A-ADV-128, A-ADV-129, A-ADV-130, A-ADV-131, A-ADV-132, A-ADV-133, A-ADV-134, A-ADV-135, A-ADV-136 |
| Connections | 162 | A-ADV-125 |
| Drawing | 162 | A-ADV-126, A-ADV-127, A-ADV-128, A-ADV-129, A-ADV-130, A-ADV-131 |
| General | 163 | A-ADV-132 |
| ARM | 163 | A-ADV-133, A-ADV-134, A-ADV-135, A-ADV-136 |
| Diagram Preferences | 165 | A-ADV-137, A-ADV-138, A-ADV-139, A-ADV-140, A-ADV-141, A-ADV-142, A-ADV-143, A-ADV-144, A-ADV-145, A-ADV-146, A-ADV-147, A-ADV-148, A-ADV-149, A-ADV-089 |
| View | 165 | A-ADV-137, A-ADV-138, A-ADV-139, A-ADV-140, A-ADV-141, A-ADV-142 |
| Viewpoints | 165 | A-ADV-143 |
| Paste Special behaviour | 166 | A-ADV-144 |
| Resize behaviour | 166 | A-ADV-145 |
| Appearance | 166 | A-ADV-146, A-ADV-147, A-ADV-089 |
| Default Figures | 167 | A-ADV-148 |
| Legend | 167 | A-ADV-149 |
| General Preferences | 169 | A-ADV-150, A-ADV-151, A-ADV-152, A-ADV-153, A-ADV-154, A-ADV-155, A-ADV-156, A-ADV-157, A-ADV-158, A-ADV-159, A-ADV-160, A-ADV-161, A-ADV-162, A-ADV-163, A-ADV-164, A-ADV-165, A-ADV-141 |
| Jasper Reports Preferences | 172 | A-ADV-077, A-ADV-079 |
| Settings | 172 | A-ADV-077, A-ADV-079 |
| System Preferences | 173 | A-ADV-166, A-ADV-167, A-ADV-168, A-ADV-169, A-ADV-170, A-ADV-171 |
| Help | 173 | A-ADV-166 |
| Keys | 173 | A-ADV-167, A-ADV-168 |
| Network Connections | 173 | A-ADV-169 |
| Secure Storage | 173 | A-ADV-170 |
| Web Browser | 173 | A-ADV-171 |
| Validator Preferences | 174 | A-ADV-034 |
| Rules to check | 174 | A-ADV-034 |
| Managing Plug-ins | 175 | A-ADV-172, A-ADV-173 |
| Using the Plug-ins Manager | 175 | A-ADV-172, A-ADV-173 |
| Manual installation | 175 | A-ADV-173 — Exclude binary Java/Eclipse dropins installation; it is implementation-specific. |

## Проверка полноты

- Все разделы данной части получены из реального оглавления PDF, включая родительские заголовки и повторяющиеся Options/General/Appearance с разными страницами.
- Все карточки имеют источник, классификацию, поведение Arkita и минимум два критерия приёмки; все зависимости разрешаются в существующие ID.
- Изображение страницы118 проверено дополнительно: перечень выходных форматов и поля мастера видны в screenshot, а не только в извлечённом тексте.
- Полный набор документации плагинов, Wiki/ACLI и другие части Guide интегрируются отдельно; здесь не заявлен их полный охват.
- Для статистики и интеграции доступны [coverage.json](coverage.json) и общая [section-map.json](section-map.json), где каждая строка оглавления сохраняет section/page/ids/decision.
