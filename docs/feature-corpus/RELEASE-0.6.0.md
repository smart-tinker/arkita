# Подготовка Arkita 0.6.0: реализация и доказательства

Срез: 2026-10-19, рабочее дерево подготовки версии 0.6.0.
**Это не release announcement и не утверждение о закрытии всех критериев #39.**
Финальный source SHA, общий runner, независимое review и SHA-256 принятого
установщика в этой записи ещё не зафиксированы. Повторное чтение исходных
критериев и точечные исправления продолжаются; наличие маршрута не означает
полноту каждого критерия большой карточки.

`program.json` сохраняет старую инвентаризацию в `previous_inventory` и ведёт
применимые записи как `acceptance-pending`. `closed_criteria` не повышены.
Девять исключений и alias сохранены. Исторические coverage/cards не изменяются.

## Как читать карту

Ниже указаны доступные source routes и **файлы проверок**. Ссылка на test file
означает существование регрессии, а не успешный финальный прогон. Общий runner
следует выполнить на окончательном source после всех исправлений; промежуточные
счётчики пересекаются и не суммируются. Внешние нормативные ограничения и
неподдержанный формат не маскируются под непроведённый GUI-тест.

<a id="metadata"></a>

## #40 — V4 и метаданные

V2/V3 проверяются своей схемой и мигрируют в памяти; V4 хранит ordered properties восьми владельцев. Отдельный Save As сохраняет оригинал. Документация имеет отдельные Edit/View режимы безопасного Markdown (заголовки, плоские списки, ссылки); HTTP(S) открывается только явной native-командой. Переключение просмотра сохраняет исходные CRLF и не добавляет Undo.

Source: [format.js](../../schemka-model-core/src/format.js), [project-file.js](../../schemka-model-io/src/project-file.js), [project-session.js](../../schemka-model-ui/src/project-session.js), [documentation-editor.js](../../schemka-model-ui/src/documentation-editor.js), [report-markdown.js](../../schemka-model-io/src/report-markdown.js).

Проверки: [native-v4.test.js](../../schemka-model-core/test/native-v4.test.js), [project-file.test.js](../../schemka-model-io/test/project-file.test.js), [metadata-app.test.js](../../schemka-model-ui/test/metadata-app.test.js), [documentation-markdown-app.test.js](../../schemka-model-ui/test/documentation-markdown-app.test.js).

Граница: Обратного V4→V3/V2 преобразования нет; формат не подтверждает нормативную полноту нотации.

<a id="persistence"></a>

## #41 — Сохранение и recovery

Main-owned baseline, проверка байтов/identity, guarded запись и явное восстановление before/after/captured external; startup не получает ложный stale от собственной сборки UI.

Source: [file-service.mjs](../../electron/file-service.mjs), [project-files.mjs](../../electron/project-files.mjs), [preserved-write.mjs](../../electron/preserved-write.mjs), [single-file-recovery.mjs](../../electron/single-file-recovery.mjs).

Проверки: [current-file.test.mjs](../../electron/test/current-file.test.mjs), [preserved-write.test.mjs](../../electron/test/preserved-write.test.mjs), [file-recovery-service.test.mjs](../../electron/test/file-recovery-service.test.mjs), [native-startup-app.test.js](../../schemka-model-ui/test/native-startup-app.test.js).

Граница: Один normal writer; hardlinks обязательны, journals не удаляются автоматически, нет power-loss guarantee или атомарной видимости multi-file update.

<a id="analysis"></a>

## #42 — Навигация и анализ

Поиск использований, Navigator/Visualiser, анализ графа и подготовка нового представления работают с typed IDs и отделяют навигацию от мутации.

Source: [model-graph.js](../../schemka-model-core/src/model-graph.js), [model-analysis-ui.js](../../schemka-model-ui/src/model-analysis-ui.js), [model-analysis-worker.js](../../schemka-model-ui/src/model-analysis-worker.js).

Проверки: [model-graph.test.js](../../schemka-model-core/test/model-graph.test.js), [model-navigation-app.test.js](../../schemka-model-ui/test/model-navigation-app.test.js), [model-analysis-app.test.js](../../schemka-model-ui/test/model-analysis-app.test.js).

Граница: UNKNOWN не становится ALLOWED при анализе или генерации; финальная производительность Windows отдельно.

<a id="workspace"></a>

## #43 — Рабочее пространство и справка

Видимость/размеры панелей, локальное восстановление, контекстная справка и учебные действия доступны из UI.

Source: [workspace-ui.js](../../schemka-model-ui/src/workspace-ui.js), [workbench.js](../../schemka-model-ui/src/workbench.js).

Проверки: [workspace-ui.test.js](../../schemka-model-ui/test/workspace-ui.test.js), [workspace-app.test.js](../../schemka-model-ui/test/workspace-app.test.js), [about-app.test.js](../../schemka-model-ui/test/about-app.test.js).

Граница: Локальные настройки и навигация не изменяют файл модели.

<a id="documents"></a>

## #45 — Окна и документы

Отдельный BrowserWindow/store/file/Git service на модель; duplicate path/inode focus; OS argv/drop/menu; независимые Undo/dirty/path; Save/Discard/Cancel. MRU, opt-in backups и recovery Save As, закрытие/порядок вкладок и отделяемая палитра.

Source: [document-registry.mjs](../../electron/document-registry.mjs), [document-preferences.mjs](../../electron/document-preferences.mjs), [window-guards.mjs](../../electron/window-guards.mjs), [palette-service.mjs](../../electron/palette-service.mjs), [view-tabs.js](../../schemka-model-ui/src/view-tabs.js).

Проверки: [document-registry.test.mjs](../../electron/test/document-registry.test.mjs), [document-preferences.test.mjs](../../electron/test/document-preferences.test.mjs), [palette-service.test.mjs](../../electron/test/palette-service.test.mjs), [startup.test.mjs](../../electron/test/startup.test.mjs), [view-tabs.test.js](../../schemka-model-ui/test/view-tabs.test.js).

Граница: Отделяется палитра; для остальных панелей реализованы ширина/видимость/порядок. Много вкладок открываются после явного подтверждения с числом и отменой, SVG создаётся только для активного вида. Автосохранения по таймеру нет. Мониторы, drop и установка требуют native приёмки.

<a id="catalog"></a>

## #46 — Каталог и папки

Создание/организация концептов, folders, typed каталог и переходы через пагинацию используют единый граф модели.

Source: [catalog-folders.js](../../schemka-model-ui/src/catalog-folders.js), [app.js](../../schemka-model-ui/src/app.js).

Проверки: [catalog-folders.test.js](../../schemka-model-ui/test/catalog-folders.test.js), [unused-tree-app.test.js](../../schemka-model-ui/test/unused-tree-app.test.js).

Граница: Папка не является концептом ArchiMate; её удаление сохраняет членов модели.

<a id="search"></a>

## #47 — Расширенный поиск и массовые свойства

Фильтры, регулярные выражения, замена, пользовательские запросы и массовые свойства готовят bounded preview перед одним Undo; Ctrl/Shift-группа дерева передаётся как фиксированный набор владельцев.

Source: [bulk-metadata.js](../../schemka-model-core/src/bulk-metadata.js), [advanced-search.js](../../schemka-model-ui/src/advanced-search.js), [catalog-selection.js](../../schemka-model-ui/src/catalog-selection.js).

Проверки: [model-search-bulk.test.js](../../schemka-model-core/test/model-search-bulk.test.js), [advanced-search.test.js](../../schemka-model-ui/test/advanced-search.test.js), [advanced-search-app.test.js](../../schemka-model-ui/test/advanced-search-app.test.js), [catalog-selection-app.test.js](../../schemka-model-ui/test/catalog-selection-app.test.js).

Граница: Выбор дерева относится к видимым строкам/текущей странице; обычный поиск охватывает всю модель.

<a id="diagram"></a>

## #48 — Редактирование диаграммы

Typed выбор, геометрические команды, выравнивание, подписи, маршруты и массовые действия используют store/revision/Undo. Смешанный выбор дерева имеет отдельный общий/смешанный инспектор.

Source: [controller.js](../../schemka-model-ui/src/controller.js), [catalog-selection.js](../../schemka-model-ui/src/catalog-selection.js), [app.js](../../schemka-model-ui/src/app.js).

Проверки: [diagram-editing.test.js](../../schemka-model-core/test/diagram-editing.test.js), [drawing-selection-delete.test.js](../../schemka-model-core/test/drawing-selection-delete.test.js), [editing-tools-app.test.js](../../schemka-model-ui/test/editing-tools-app.test.js), [catalog-selection-app.test.js](../../schemka-model-ui/test/catalog-selection-app.test.js).

Граница: Canvas selection и концепты дерева разделены; pointerdown по toolbar не снимает группу. Проверка исходных критериев ещё может выявить точечные пробелы.

<a id="visual"></a>

## #49 — Визуальные объекты и оформление

Native visual nodes/connectors/assets/styles подключены к редактору, валидации, истории и экспорту.

Source: [visuals-ui.js](../../schemka-model-ui/src/visuals-ui.js), [visual-drawings.js](../../schemka-model-ui/src/visual-drawings.js), [native-v4.js](../../schemka-model-core/src/native-v4.js).

Проверки: [native-v4.test.js](../../schemka-model-core/test/native-v4.test.js), [visuals-ui.test.js](../../schemka-model-ui/test/visuals-ui.test.js), [visual-drawings.test.js](../../schemka-model-ui/test/visual-drawings.test.js).

Граница: Повторное чтение критериев выявило детали multiline note inline, специализаций/фильтра/цветов легенды и target name/docs viewReference; они дорабатываются до финальной фиксации. Эта запись не объявляет направление полностью закрытым.

<a id="nesting"></a>

## #50 — Вложенность и перепривязка отношений

Геометрический parent/child, перемещение/resize контейнеров, явный выбор проверенного смыслового отношения, скрытие nested линии и guarded перепривязка концов во всех использованиях.

Source: [semantic-editing.js](../../schemka-model-core/src/semantic-editing.js), [semantic-editing-ui.js](../../schemka-model-ui/src/semantic-editing-ui.js), [resize-preferences.js](../../schemka-model-ui/src/resize-preferences.js).

Проверки: [semantic-editing.test.js](../../schemka-model-core/test/semantic-editing.test.js), [semantic-editing-ui.test.js](../../schemka-model-ui/test/semantic-editing-ui.test.js), [semantic-editing-app.test.js](../../schemka-model-ui/test/semantic-editing-app.test.js).

Граница: Вложенность не доказывает смысловое отношение. Автоматический выбор не применяет UNKNOWN как разрешённое правило.

<a id="clipboard"></a>

## #51 — Перенос фрагментов

Portable fragment schema, замыкание ссылок, cross-model remap и системный clipboard; Cut удаляет источник только после подтверждения успешной вставки и повторной проверки исходного состояния.

Source: [portable-fragment.js](../../schemka-model-core/src/portable-fragment.js), [fragment-file.js](../../schemka-model-io/src/fragment-file.js), [clipboard-service.mjs](../../electron/clipboard-service.mjs).

Проверки: [portable-fragment.test.js](../../schemka-model-core/test/portable-fragment.test.js), [fragment-clipboard.test.js](../../schemka-model-ui/test/fragment-clipboard.test.js), [clipboard-print.test.mjs](../../electron/test/clipboard-print.test.mjs).

Граница: Undo между окнами независим. При изменившемся/закрытом источнике вставка остаётся копированием, исходник сохраняется.

<a id="output"></a>

## #52 — Экспорт, печать и отчёты

SVG/PNG, native PDF/печать с общей схемой страниц, font outlines, HTML-отчёт с фильтрацией фактически включённых данных и закрытый шаблон отчёта.

Source: [export-report-ui.js](../../schemka-model-ui/src/export-report-ui.js), [print-layout.js](../../schemka-model-io/src/print-layout.js), [report.js](../../schemka-model-io/src/report.js), [print-service.mjs](../../electron/print-service.mjs), [text-outline-service.mjs](../../electron/text-outline-service.mjs).

Проверки: [export-report-ui.test.js](../../schemka-model-ui/test/export-report-ui.test.js), [print-layout.test.js](../../schemka-model-io/test/print-layout.test.js), [report.test.js](../../schemka-model-io/test/report.test.js), [text-outline.test.mjs](../../electron/test/text-outline.test.mjs), [clipboard-print.test.mjs](../../electron/test/clipboard-print.test.mjs).

Граница: 100% — fit-to-page; 25–200% относительно fit с плитками без молчаливой обрезки. Физическая печать/DPI/разные шрифты требуют отдельной приёмки. Предпросмотр можно отменить; при native output нужно завершить системное окно.

<a id="profiles"></a>

## #53 — Профили и viewpoints

Специализации, пользовательские поля, допустимые иконки и viewpoint с объяснением скрытого контекста используют native профиль/ресурсы.

Source: [profile-ui.js](../../schemka-model-ui/src/profile-ui.js), [viewpoint-ui.js](../../schemka-model-ui/src/viewpoint-ui.js).

Проверки: [profile-ui.test.js](../../schemka-model-ui/test/profile-ui.test.js), [viewpoint-ui.test.js](../../schemka-model-ui/test/viewpoint-ui.test.js), [notation-viewpoints-app.test.js](../../schemka-model-ui/test/notation-viewpoints-app.test.js).

Граница: Профиль не изменяет нормативные правила нотации; локальный стиль рисунка отделён от иконки специализации.

<a id="interoperability"></a>

## #54 — CSV/XML/XLSX и объединение

Предпросмотр импорта/merge перед атомарным apply; CSV read/write, XLSX export, Exchange XML с offline pinned XSD и отдельный Archi native XML reader.

Source: [interchange-ui.js](../../schemka-model-ui/src/interchange-ui.js), [csv.js](../../schemka-model-io/src/csv.js), [exchange-xml.js](../../schemka-model-io/src/exchange-xml.js), [archi-native.js](../../schemka-model-io/src/archi-native.js), [xml-validator.mjs](../../electron/xml-validator.mjs).

Проверки: [interchange.test.js](../../schemka-model-io/test/interchange.test.js), [exchange-xml.test.js](../../schemka-model-io/test/exchange-xml.test.js), [xml-validator.test.mjs](../../electron/test/xml-validator.test.mjs), [interchange-templates.test.js](../../schemka-model-ui/test/interchange-templates.test.js).

Граница: XSD 3.1 Preliminary — структурная проверка, не эквивалентность 3.2→4. Archi native ограничен XML 5.0.0; ZIP/resources и неподдержанные данные явно отказывают или входят в отчёт о потерях. XLSX обратного импорта нет.

<a id="templates"></a>

## #55 — Шаблоны и доски

Локальная библиотека, категории, переносимый пакет, новая независимая модель, board/pattern insertion, Canvas/sketch и явная карта преобразования эскиза.

Source: [templates.js](../../schemka-model-io/src/templates.js), [templates-ui.js](../../schemka-model-ui/src/templates-ui.js).

Проверки: [interchange.test.js](../../schemka-model-io/test/interchange.test.js), [interchange-templates.test.js](../../schemka-model-ui/test/interchange-templates.test.js).

Граница: Шаблон не исполняет код. Встроенные/командные шаблоны копируются для изменения, исходная доска при преобразовании сохраняется.

<a id="preferences"></a>

## #56 — Настройки и командный профиль

Единые local preferences, import/export draft+Apply, цвета/шрифты/создание/панели/навигация; фиксированный read-only профиль команды рядом с executable.

Source: [preferences-ui.js](../../schemka-model-ui/src/preferences-ui.js), [preferences.js](../../schemka-model-ui/src/preferences.js), [team-profile.js](../../schemka-model-io/src/team-profile.js), [team-profile.mjs](../../electron/team-profile.mjs).

Проверки: [preferences-app.test.js](../../schemka-model-ui/test/preferences-app.test.js), [preferences-effects-app.test.js](../../schemka-model-ui/test/preferences-effects-app.test.js), [team-profile-app.test.js](../../schemka-model-ui/test/team-profile-app.test.js), [team-profile.test.mjs](../../electron/test/team-profile.test.mjs).

Граница: Явный стиль модели важнее display defaults; параметры создания применяются к новым объектам. Пользовательские настройки имеют приоритет над профилем команды.

<a id="extensions"></a>

## #57 — Автоматизация, CLI и host policy

Закрытые JSON manifest/capabilities, read-only query, staged batch preview/oneUndo/cancel/limits/log; установка/disable/uninstall. CLI validate/export-csv до GUI; отдельная политика Git proxy и внешних ссылок.

Source: [automation.js](../../schemka-model-core/src/automation.js), [automation-ui.js](../../schemka-model-ui/src/automation-ui.js), [arkita-cli.mjs](../../scripts/arkita-cli.mjs), [entry.mjs](../../electron/entry.mjs), [git-network-policy.mjs](../../electron/git-network-policy.mjs), [host-actions.mjs](../../electron/host-actions.mjs).

Проверки: [automation.test.js](../../schemka-model-core/test/automation.test.js), [automation-app.test.js](../../schemka-model-ui/test/automation-app.test.js), [automation-cli.test.mjs](../../electron/test/automation-cli.test.mjs), [host-policy.test.mjs](../../electron/test/host-policy.test.mjs), [host-policy-app.test.js](../../schemka-model-ui/test/host-policy-app.test.js).

Граница: Нет arbitrary JS/Java execution или автоматического запуска из модели. Отключение авторизации запрещает сетевые операции точного Arkita подключения; удаление общей OS credential пользователь выполняет сам в Windows Credential Manager. Реальная сеть/proxy/auth не подтверждены Linux adapter tests.

<a id="git"></a>

## #58 — История, ветки, конфликты и вехи

Typed сравнение metadata/geometry, read-only revision, explicit restore oneUndo, guarded local branches/upstream/openRevision; base/local/remote и групповой выбор; отдельные create/publish/delete milestone.

Source: [git-changes.mjs](../../electron/git-changes.mjs), [git-repository.mjs](../../electron/git-repository.mjs), [git-service.mjs](../../electron/git-service.mjs), [git-actions.js](../../schemka-model-ui/src/git-actions.js).

Проверки: [git-changes.test.mjs](../../electron/test/git-changes.test.mjs), [git-repository.test.mjs](../../electron/test/git-repository.test.mjs), [git-service.test.mjs](../../electron/test/git-service.test.mjs), [git-actions.test.js](../../schemka-model-ui/test/git-actions.test.js), [git-app.test.js](../../schemka-model-ui/test/git-app.test.js).

Граница: Save/Commit/Push/Receive отдельны. Ветви private/local; push в выбранный upstream без force. Удаление вехи локальное, опубликованный тег не удаляется. Тестовые bare remotes не подтверждают Windows credentials/реальный сервер.

## Зафиксированные focused результаты этой рабочей сессии

- Markdown документации: 4 новых регрессии отказали до реализации, затем
  `/tmp/arkita-documentation-markdown-after.tap` — 19 PASS (unit/IO).
  `/tmp/arkita-documentation-analysis-app.tap` — 24 PASS (actual source DOM,
  прежние native temp-file сценарии документации, hints и analysis).
- Новый read-only `document-location`: exact preload/main whitelist и token
  forwarding — `/tmp/arkita-document-location-boundary-after.tap`, 15 PASS.
  Это не permission на произвольное чтение/запись пути; остальные DTO не получают
  новые filesystem paths.

- EXT010: `/tmp/arkita-catalog-final-pointer.tap`, 12 PASS, 0 FAIL/SKIP.
  Source app проверяет Ctrl-выбор элемента и отношения → pointerdown по кнопке
  свойств → общий инспектор → фиксированные владельцы → apply/точный Undo;
  canvas pointerdown снимает группу. Это DOM, не физическая мышь Windows.
- Automation/native focused gate: `/tmp/arkita-automation-final2.tap`, 60 PASS.
  File/session и automation limits: `/tmp/arkita-file-session-automation-final.tap`,
  95 PASS. Эти прогоны относятся к промежуточному рабочему дереву; не являются
  общим прогоном финального коммита и не добавляются друг к другу.

Эти `/tmp`-логи — локальные evidence данной сессии, не опубликованные артефакты
релиза. Перед публикацией владелец сохраняет итоговый отчёт с полным source SHA
и командами в durable acceptance/release evidence.

<a id="windows"></a>

## Windows: предварительно выполненное и pending

Владелец провёл часть проверок отдельного предварительного unpacked bundle:
реальные Windows шрифты/контуры кириллицы, offline XML/WASM/schema из ASAR,
CLI из executable на кириллическом файле со stdout JSON и exit 0, native PDF
Save As с readback заголовка `%PDF-`. Это полезный preflight, **не приёмка
окончательного 0.6.0 установщика**: source после него изменился.

Для финального дистрибутива остаётся зафиксировать исходный SHA, SHA-256,
версию Windows, PASS/FAIL/UNRUN по применимым сценариям:

- Чистая установка/удаление, association/second launch/drop, Unicode paths,
  восстановление начального документа, сохранность пользовательских моделей.
- Две независимые модели, dirty/Undo/Save/Close, duplicate paths, clipboard Cut,
  вкладки, палитра, реальная клавиатура/drag/focus и DPI.
- NTFS/file conflict/recovery/backup, cancellation/error и reopened bytes;
  действительные alias/8.3/hardlink возможности целевой системы.
- SVG/PNG/PDF/HTML, системная печать, страницы/масштаб/кириллица/шрифты;
  Exchange import/schema из пакета, templates и настройки после перезапуска.
- Встроенный MinGit с реальным сервером, SSH/HTTPS credentials, direct/proxy,
  отказ авторизации/сети; отключение разрешения и ручное OS credential removal.
- Физический второй монитор, отключение дисплея и физическая печать остаются
  UNRUN до фактического исполнения. DOM/adapters/PDF не заменяют эти проверки.

Реальные source-пробелы продолжают исправляться до окончательной фиксации;
формальный pending не означает, что они автоматически считаются реализованными.
[Windows guide](../WINDOWS.md) и [исторические сценарии](WINDOWS-ACCEPTANCE.md)
дают маршрут приёмки. Опубликованный tag/release и соответствие его байтов
принятому дистрибутиву фиксируются отдельным окончательным шагом.
