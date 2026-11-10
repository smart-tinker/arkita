# Лицензии компонентов

Исходный код Arkita распространяется по MIT; полный текст находится в `LICENSE`.
Готовый HTML включает сторонний код. `THIRD-PARTY-NOTICES.txt` и встроенный
пункт меню «Лицензии компонентов» содержат copyright и тексты условий;
`vendor/inventory.json` связывает записи с источниками и хешами.

- Используется официальный неизменённый Mermaid Tiny 12.1.0, опубликованный под MIT
- Включённые компоненты используют MIT, ISC, BSD-3-Clause и Apache-2.0
- Для DOMPurify 3.4.12 выбран вариант **Apache-2.0** из двойной лицензии `(MPL-2.0 OR Apache-2.0)`; исходный комментарий о двойном лицензировании сохранён
- Реализация ELK и её EPL-лицензия отсутствуют в этой Tiny-сборке. Это подтверждается проверкой поставляемого артефакта и описанием сборки, а не выбором Dagre в настройках
- Встроенных бинарных шрифтов и внешних пакетов иконок нет; интерфейс использует системные шрифты и собственные SVG-иконки

## Ограничения инвентаризации

Официальный Tiny-архив не содержит полного SBOM/source map. Инвентаризация сочетает подтверждённые совпадения с источниками и консервативные дополнительные notices. Поэтому она не заявляется минимальным или юридически сертифицированным списком зависимостей.

Для **jison-lex 0.3.4** upstream README и заголовок исходника объявляют MIT, но в проверенном исходном дереве не найден отдельный полный `LICENSE`. В notices этот факт отмечен явно; стандартные условия MIT приведены отдельно, без выдуманной строки copyright. Обобщённое поле `licenseSource` в инвентаризации не означает, что для этой записи найден отдельный upstream-файл с полным текстом лицензии.

Сохраняйте notices вместе с распространяемой сборкой. Лицензия собственного кода проекта не заменяет лицензии включённых компонентов. Этот технический обзор не является юридической гарантией.

## Experimental visual descriptors

The bounded draft model-visualization facts are attributed to Kalin Maldzhanski / Linked.Archi, [ArchiMate 4.0 Visual Notation Set](https://meta.linked.archi/archimate4/notation/), v4.0 draft, modified 2026-05-16; its page links [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: independent SVG geometry and text badges, local dark-theme/interaction palettes, and a limited selection for the existing Schemka preview vocabulary. No endorsement or normative equivalence is claimed. No upstream icons, ontology code or specification definitions are embedded. See [docs/NOTATION-SOURCES.md](docs/NOTATION-SOURCES.md) for the evidence boundary. ArchiMate is a trademark of The Open Group.
