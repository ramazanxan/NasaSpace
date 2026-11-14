# NasaSpace

Веб-приложение для планирования маршрутов ровера и астронавта по рельефу Марса.
Команда: один фронтендер (этот репозиторий, `frontend/`) и бэкенд на Java (алгоритмы
маршрутов, сетка рельефа, точки; без БД). Фронт и бэк соединяются в конце по контракту
из `frontend/src/api/types.ts` и `docs/openapi.yaml`.

## Стек фронта

Vite + React 19 + TypeScript, Cesium (эллипсоид Марса, подложка NASA Mars Trek),
Zustand, Recharts, lucide-react. Без Cesium ion: ключ не нужен.

```
frontend/src/
├── map/        Cesium-сцена, камера, рельеф, общий viewer (viewerRef.ts)
├── search/     строка поиска, список районов
├── place/      карточка места
├── route/      точки А/Б, линия, статистика, профиль высот
├── layers/     слои уклона/опасности, тропы, роверы
├── timeline/   солы, Солнце
├── api/        types.ts (контракт), client.ts, mock/ (бэкенд в браузере)
├── store/      Zustand: один стор, по срезу на фичу
├── ui/         общие контролы (primitives.tsx) — собирать UI только из них
└── styles/     tokens.css — все цвета/отступы/радиусы только отсюда
```

## Правила

- Пока `VITE_API_URL` пуст, всё работает на моках из `api/mock/`. Фронт не ждёт бэкенд.
- Контракт API меняется только в `api/types.ts` + `docs/openapi.yaml` одновременно.
- Моделируем 5–6 районов (`api/mock/regions.ts`), остальной Марс — только подложка.
- Каждая фича пишет в свою папку. Общие файлы (`App.tsx`, `store/`, `ui/`, `styles/tokens.css`,
  `map/`) меняет только лид.
- `*OnMap`-компоненты добавляют сущности в Cesium через `useViewer()` и обязательно
  удаляют их в cleanup. После изменений сцены — `viewer.scene.requestRender()`
  (включён requestRenderMode).
- Дизайн: тихий графитовый интерфейс, богатый только рельеф и маршрут. Акцент
  `--c-accent` (голубой марсианского заката) только для маршрута и выбранного.
  Без градиентов, свечения, эмодзи, КАПС-лейблов, восклицательных знаков.
  Отступы по сетке 4px, иконки lucide 16px stroke 1.5, текст в sentence case.
- Тексты интерфейса — по-русски, короткие, ошибки говорят, что делать дальше.

## Команды

```bash
npm --prefix frontend run dev      # http://localhost:5173
npm --prefix frontend run build    # tsc + vite build
npm --prefix frontend run lint
```

## Git

`main` — ветка для деплоя. Работа в ветках `feature/...`, слияние через PR.
