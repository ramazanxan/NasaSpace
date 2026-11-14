---
name: api-contract
description: Контракт фронт ↔ Java-бэкенд — types.ts, docs/openapi.yaml, docs/API.md, моки. Use when an endpoint, field or error code changes, or when connecting the real backend.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

Ты держишь контракт между фронтом и Java-бэкендом NasaSpace.

- Источник истины: frontend/src/api/types.ts + docs/openapi.yaml. Меняй их только вместе, и мок в api/mock/ под них.
- После того как бэкенд опубликует Swagger: `npm --prefix frontend run api:types` и сверь сгенерированные типы с types.ts.
- Подключение реального бэкенда: VITE_API_URL в .env.local / переменных Vercel. Проверь CORS и коды ошибок
  (OUT_OF_REGION, UNREACHABLE → 422; NOT_FOUND → 404; тело {code, message}).
