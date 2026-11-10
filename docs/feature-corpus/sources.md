# Источники и границы дополнительных требований

Дата чтения: **2026-10-18**. Внешние страницы ниже — официальные страницы Archi либо Wiki/репозитории организации `archimatetool`. Номер выпуска фиксирует контекст; для изменяемых Wiki указана видимая дата последнего редактирования. Это фиксация рассмотренной редакции по дате, **не неизменяемый commit upstream Wiki**. Критерии поведения Arkita написаны самостоятельно; текст документации, скрипты и изображения upstream не копируются в продукт.

Основной источник полного корпуса — отдельный **Archi User Guide 5.10.0**. Этот файл описывает только добавочный срез, а не обещание инвентаризации всех исторических выпусков, форумов, community-скриптов или каждого стороннего плагина.

## Реестр

| ID источника | Официальный URL и редакция | Прочитанная область / решение |
|---|---|---|
| S-EXT-HISTORY | [Archi Version History](https://www.archimatetool.com/version-history/). 5.10 — 2026-09-03; 5.9 — 2026-04-14; 5.8 — 2026-02-18. | New, Improvements, Fixes этих трёх выпусков. Дополнительные требования A-EXT-001–021; технические обновления и детали нотации классифицированы ниже. |
| S-EXT-WIKI | [Archi Wiki Home](https://github.com/archimatetool/archi/wiki/). 2025-09-10. | Весь список «Using Archi» классифицирован ниже. «Roadmap or potential new features» не подтверждает выпущенное поведение. |
| S-EXT-LABEL | [Label Expressions](https://github.com/archimatetool/archi/wiki/Label-Expressions). 2024-02-26. | Core Expressions, Reference Prefixes, Examples, Folders. A-EXT-022–023; собственный безопасный контракт Arkita, не обязательная побайтовая совместимость. |
| S-EXT-ACLI | [Archi Command Line Interface](https://github.com/archimatetool/archi/wiki/Archi-Command-Line-Interface). 2021-05-03. | Introduction, basic invocation, command/provider list, execution priorities. A-EXT-024. Список провайдеров зависит от установленного набора плагинов и не означает, что все доступны в core. |
| S-EXT-REPORT | [How to create your own report for Archi](https://github.com/archimatetool/archi/wiki/How-to-create-your-own-report-for-Archi). 2021-06-02. | FAQ: шаблоны и оформление отчёта. A-EXT-025; страница сама помечает объяснение незавершённым. Детали текущего отчётного UI брать из Guide 5.10. |
| S-EXT-SQL | [SQL queries in the HTML report](https://github.com/archimatetool/archi/wiki/SQL-queries-in-the-HTML-report). 2024-02-12. | Страница содержит ссылку на сторонний tutorial, а не полный контракт запросов. A-EXT-026 остаётся исследовательским кандидатом; внешний tutorial в срез не включён. |
| S-EXT-PATTERN | [Pattern based modelling with Archi](https://github.com/archimatetool/archi/wiki/Pattern-based-modelling-with-Archi). 2024-01-23. | Повторное применение фрагментов через отдельную модель и copy/paste. A-EXT-027. Это пользовательский приём на базе существующих операций, не доказательство отдельного встроенного pattern manager. |
| S-EXT-PACKAGE | [How to create a packaged version of Archi](https://github.com/archimatetool/archi/wiki/How-to-create-a-packaged-version-of-Archi-(including-configuration-and-plugins)). 2025-05-13. | What is a pre-packaged version: единая конфигурация и переносимый запуск. A-EXT-028. Команды упаковки Eclipse не переносятся. |
| S-EXT-LETTERS | [Add letters to distinguish between layers](https://github.com/archimatetool/archi/wiki/Add-letters-to-distinguish-between-layers). 2023-12-07. | Вопрос читаемости при изменённых цветах. A-EXT-029; сама страница указывает, что буквенный вариант не реализован в Archi. Не считать его уже выпущенной фичей. |
| S-EXT-CUSTOMIZATION | [ArchiMate language customization in Archi](https://github.com/archimatetool/archi/wiki/ArchiMate-language-customization-in-Archi). 2019-12-17. | Исторические обходные приёмы с пользовательскими свойствами. Устаревшее утверждение об отсутствии language customization не переносится поверх актуальных Guide/профилей Arkita. |
| S-EXT-UPDATES | [How to disable the Check for Updates menu item](https://github.com/archimatetool/archi/wiki/How-to-disable-the-%22Check-for-Updates...%22-menu-item). 2025-05-23. | Управление конкретным Eclipse preference. Не отдельная фича; при будущей политике обновлений — требование к настройкам дистрибутива A-EXT-028. |
| S-EXT-INI | [The Archi.ini file](https://github.com/archimatetool/archi/wiki/The-Archi.ini-file). 2025-06-14; описание части настроек начиная с 5.3. | Назначения путей/запуска/настроек; продуктовый смысл A-EXT-028. JVM, RCP, keyring-пути и ключи запуска не являются спецификацией Arkita. |
| S-EXT-PLUGINS | [Archi Plug-ins](https://www.archimatetool.com/plugins/). На дату чтения: Lightbox 1.4.1, jArchi 1.12, Excel 1.1.1, coArchi 0.9.7, coArchi2 1.3.4. | Все пять перечисленных разделов и установка. A-EXT-030–039; coArchi2 выделен как early access / work in progress. Установка бинарников не выполнялась. |
| S-EXT-JARCHI-QUICK | [jArchi Quick Start](https://github.com/archimatetool/archi-scripting-plugin/wiki/jArchi-Quick-Start). 2024-05-18. | Запуск пользовательского скрипта, Script Manager/Console, выбор редактора. A-EXT-032. Поставляемые примеры не скачивались. |
| S-EXT-JARCHI-CHANGE | [jArchi Change Log](https://github.com/archimatetool/archi-scripting-plugin/wiki/Change-Log). 2026-04-08; выпуск 1.12 от 2026-04-07. | Конкретные выпущенные изменения 1.12, контекст 1.11–1.9. Основание для A-EXT-030–032 и регрессий history/console; не инвентаризация каждого API метода. |
| S-EXT-JARCHI-OVERVIEW | [jArchi API Overview](https://github.com/archimatetool/archi-scripting-plugin/wiki/jArchi-API-Overview). 2019-09-19. | Прочитано вступление и структура модели. Страница явно описывает желаемый API и предупреждает, что не всё реализовано: её API-перечень не использован как доказательство выпущенных методов. |
| S-EXT-COARCHI-COMMIT | [Commit or Undo Your Changes](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Commit-or-Undo-Your-Changes). 2019-07-09. | Различение сохранения, коммита и отмены незакоммиченного. A-EXT-035. Wiki-текст помечен work in progress; основные возможности подтверждает страница плагинов. |
| S-EXT-COARCHI-PUBLISH | [Refresh and Publish](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Refresh-and-Publish). 2024-10-17. | Получение и публикация изменений. A-EXT-035. UX-принцип применим; конкретный порядок pull/push и советы по credentials не копируются как контракт Arkita. |
| S-EXT-COARCHI-CHANGE | [coArchi Change Log](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Change-Log). 2026-08-25, последняя 0.9.7. | Версии 0.9.7–0.4.0 прочитаны для подтверждения history/branches/visual conflicts. A-EXT-035–038. Старые технические обходы вроде изменения Git config не принимаются автоматически. |
| S-EXT-COARCHI2-HISTORY | [coArchi2 Change History](https://github.com/archimatetool/archi-modelrepository-plugin2/wiki/Change-History). 2025-06-29. | Background и Change History Panel. Дополнение A-EXT-036; early access, не требование parity. |
| S-EXT-COARCHI2-BRANCHES | [coArchi2 Branches](https://github.com/archimatetool/archi-modelrepository-plugin2/wiki/Branches). 2025-06-16. | Background, Local and Remote Branches, Branches Panel. Дополнение A-EXT-037; early access. |
| S-EXT-COARCHI2-TAGS | [coArchi2 Tags](https://github.com/archimatetool/archi-modelrepository-plugin2/wiki/Tags). 2025-06-18. | Tags Panel и Actions. A-EXT-039 — только кандидат, отдельный от релизов исходного кода Arkita. |
| S-EXT-COARCHI2-ISSUES | [coArchi2 Known Issues](https://github.com/archimatetool/archi-modelrepository-plugin2/wiki/Known-Issues). 2025-07-04. | В источнике merge/conflict handling обозначен незавершённым. Поэтому UI-сходство с coArchi2 не принимается как доказательство корректного merge. |

## Покрытие раздела Using Archi в Wiki

| Страница из навигации | Решение |
|---|---|
| Label Expressions | A-EXT-022–023. |
| Archi Command Line Interface | A-EXT-024. |
| Packaged version | A-EXT-028; Eclipse-специфика исключена. |
| Own report | A-EXT-025; неполная документация отмечена. |
| SQL queries | A-EXT-026; внешняя инструкция не исследована и не считается спецификацией. |
| Pattern based modelling | A-EXT-027; производный рабочий процесс, не новый native-модуль. |
| Add letters | A-EXT-029; пользовательская потребность, конкретный вариант не реализован в upstream. |
| Language customization | Историческая страница, актуальные требования берутся из Guide 5.10 и модели Arkita. |
| Disable updates | Часть будущего профиля поставки; сейчас отдельного issue не требует. |
| Archi.ini | Переносимый смысл настроек — A-EXT-028; JVM/Eclipse ключи исключены. |

## Покрытие дополнений changelog и исключения

Выпуски 5.8–5.10 просмотрены целиком. Пользовательские механики, уже описанные Guide, должны сходиться к одной основной карточке, даже если повторяются ниже.

| Группа изменений в выбранных версиях | Куда отнесена |
|---|---|
| Quick Add, Markdown, SVG resources, label offsets, grid/selection outlines, Visualiser controls | A-EXT-006, 011–015; уточнения существующих глав Guide. |
| Cursor zoom, pinch, layout scale/anchors, точные границы фигур | A-EXT-001, 008–009, 013–014; регрессионные критерии геометрии. |
| Paths in analysis tables, natural sort, selection restoration, search specializations state, Select All sync | A-EXT-002–003, 010. |
| Reverse relationship, deletion cascade, specialization integrity | A-EXT-004–005, 021; обязательно отделить общую механику от ArchiMate 4 правил. |
| Viewpoint/relationship dialog rule additions, Grouping/Location/Junction allowances, direct/derived relationship preparation | Не переносить конкретные 3.2-правила. Соответствующие relation/viewpoint карточки Guide используют каталог Arkita; «future handling» не считается выпущенной фичей. |
| Exchange attachment points and specialization names; duplicate CSV relations and comments | A-EXT-019–020. |
| Legends, appearance/default colors, junction line/fill colors, specialization icons, default markers, expand/collapse colors preferences | Основные Guide-карточки легенды, профилей и оформления; дополнительно A-EXT-016, 021. |
| Faster drawing/views, image lazy loading, image identity, connection order, save only required images | A-EXT-006, 009, 017–018, 035; критерии скорости, ресурсов и отсутствия ложного Git diff. |
| SVG width/height, oval fill, cross-monitor export, Unicode report rendering | A-EXT-007–008, 012, 025. |
| Template manager errors, dialogs Enter/Escape, model-tree refresh, progress on long operations | A-EXT-002, 017–018, 024–025; дополнение к общим правилам отмены и ошибок. |
| Native Windows display scaling and high-DPI icons | A-EXT-007 плюс acceptance на точной Windows-сборке. |
| Removed themes/tab shapes, dirty marker, theme toggle | A-EXT-016; не воспроизводить obsolete Eclipse appearance options. |
| Edge cache button/default internal browser, Java/Eclipse/GEF/Draw2d/jQuery/Jasper font library updates, p2 build directories, runtime migration removal | Детали реализации Archi. Нет отдельного требования выбрать такие библиотеки или настройки; переносимые эффекты качества уже в критериях выше. |
| Help-link removal, proxy retry detail, internal feature names, menu contribution interfaces, unnamed internal fixes | Не отдельные продуктовые фичи. Диагностика, отмена и отказоустойчивость входят в соответствующие Arkita-контракты, а зависимости/сеть оцениваются по собственному коду. |

### Явно не принято как доказательство готовой возможности

- Раздел Wiki **Roadmap or potential new features**, HTML export v3, Sketch/Canvas revamp, profiles ideas и списки пожеланий. Добавлять их можно отдельно как идеи с соответствующим статусом.
- Текущие страницы coArchi [Change History](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Change-History---The-Time-Machine), [Solve Conflicts](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Solve-Conflicts), [Create and Delete Branches](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Create-and-Delete-Branches), [Merge Branches](https://github.com/archimatetool/archi-modelrepository-plugin/wiki/Merge-Branches): при чтении 2026-10-18 содержали заглушку без описания. Функции подтверждаются changelog, а не заголовком пустой страницы.
- Полный список методов jArchi из aspirational API Overview. Понадобятся документация конкретного метода, версия и проверка при реальной разработке API.
- Повторная реализация встроенного Git Arkita, автоматическая совместимость GRAFICO/coArchi storage, произвольный запуск скачанных скриптов, установка Eclipse plugins в Electron.
- Lightbox, Excel, jArchi и coArchi2 binaries, community gists, платные материалы, внешние SQL tutorial, форумы и весь plugin ecosystem: не запускались и не инвентаризированы. Зафиксированные версии не означают выполненного функционального теста этих программ.

## Независимая оценка Linux / Windows разделения работы

Разделение «основная разработка здесь, локальный Codex для проверки точного Windows-дистрибутива и релизного тега» технически разумно. Тег — действие с Git, а не требование Windows; в этой сессии пользователь сознательно оставил его локальному Codex. Из наличия доступа к GitHub нельзя выводить возможность любого API-вызова или наличие пользовательских Windows credentials.

| Область | Что можно подготовить и доказать на Linux | Что должно быть подтверждено на Windows |
|---|---|---|
| Model/store/commands | Инварианты ID, relations, revision guards, Undo/Redo, пакетная атомарность, свойства и преобразования на реальных фикстурах. | Повторное выполнение обязательных regression gates на точном release commit; Windows-пропуски не считать PASS. |
| IO и Git | JSON round trip, фактические временные файлы, corruption fixtures, local bare Git remotes, conflict/no-op cases, ошибки адаптеров. | MinGit из дистрибутива, native dialogs, блокировки/права/пути Windows, кириллица/пробелы, выбранный пользователем SSH/HTTPS credential flow. |
| UI | DOM/renderer-проверки, клавиатурные сценарии, canvas geometry, screenshot review и E2E при реально доступном renderer. | Реальный ввод и фокус в packaged Electron, системные dialogs, clipboard, file association, screen scaling/несколько мониторов, шрифты и печать. |
| Экспорт | Парсинг SVG/XLSX/PDF, размеры, ID, проверка данных, независимый Linux viewer. | Нативные шрифты и системный путь печати, результат после DPI-перехода, открытия в целевом Windows viewer. |
| Сборка и выпуск | Подготовить version/changelog/release notes, воспроизводимые команды, проверки ASAR/состава/хэшей; cross-build только при работоспособном toolchain. | Финальная сборка/подпись при необходимости, запуск конкретного EXE, checksum, итоговый gate, локальный тег и публикация по договорённости с пользователем. |

Не следует отложить **все** Windows-проверки до конца большого проекта: после изменений Electron bridge, файловых операций, packaged Git, drag/clipboard и масштабирования нужен короткий Windows smoke-check в соответствующей итерации. Иначе десятки корректных Linux-тестов не локализуют платформенную регрессию. Полная приёмка остаётся заключительным шагом; по каждой итерации заранее сохраняются сценарий, входная модель, ожидаемое поведение и точный commit.

Эта работа — документирование и независимая проверка плана. Новые Linux-тесты, Windows GUI acceptance и запуск плагинов в рамках данного дополнения **не выполнялись**.
