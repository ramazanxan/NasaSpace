# NasaSpace — фронтенд

Планирование маршрутов ровера и астронавта по 3D-рельефу Марса.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
```

Без бэкенда всё работает на встроенных моках (`src/api/mock/`). Чтобы подключить Java-бэкенд:

```bash
cp .env.example .env.local
# VITE_API_URL=http://localhost:8080
```

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run dev` | dev-сервер |
| `npm run build` | проверка типов и сборка в `dist/` |
| `npm run lint` | oxlint |
| `npm run api:types` | типы из `../docs/openapi.yaml` в `src/api/schema.gen.ts` |

## Деплой

Vercel: Root Directory — `frontend`, остальное берётся из `vercel.json`.
Переменная окружения `VITE_API_URL` — адрес бэкенда. Ключ Cesium ion не нужен:
подложка — открытые тайлы NASA Mars Trek, рельеф — из нашего API.

Структура и правила — в [../CLAUDE.md](../CLAUDE.md), контракт API — в [../docs/API.md](../docs/API.md).
