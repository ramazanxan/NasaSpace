# NasaSpace API: контракт для Java-бэкенда

Документ для разработчиков бэкенда. Машиночитаемая версия: [`openapi.yaml`](./openapi.yaml)
(OpenAPI 3.1). Типы на стороне фронта: `frontend/src/api/types.ts`, вызовы:
`frontend/src/api/client.ts`. Эталонное поведение (моки в браузере): `frontend/src/api/mock/`.

Если документ и код расходятся, правда в `types.ts` и `client.ts`. Контракт меняется
только одновременно в `types.ts` и `openapi.yaml`.

## 1. Соглашения

| Что | Правило |
|---|---|
| Координаты | Планетоцентрические градусы на эллипсоиде Марса. Долгота положительна **на восток**, диапазон **-180..180** (не 0..360). Широта -90..90. |
| bbox | `[west, south, east, north]` в градусах. Проверка попадания точки включает границы (`>=`, `<=`). |
| Высоты | Метры относительно ареоида MOLA (уровень "моря" Марса). Могут быть отрицательными (дно Езеро около -2600, вершина Олимпа около 21000+). |
| Расстояния | Метры. |
| Уклоны | Градусы. |
| Длительности | Марсианские сутки (сол). |
| Радиус Марса | 3 389 500 м (среднее, IAU 2015); на нём считаются расстояния и метры на градус. |
| Формат | JSON, UTF-8. Поля в camelCase. Все поля, указанные как обязательные, присутствуют всегда. |

### Раскладка сеток (террейн и слои)

- Сетка покрывает `bbox` целиком; крайние отсчёты лежат **на границах** bbox
  (первый столбец на `west`, последний на `east`, первая строка на `north`, последняя на `south`).
- Порядок: row-major, **от северо-западного угла**: индекс `i = row * width + col`.
  `row = 0` это северный край, `col = 0` это западный край.
- `heights.length == width * height` (то же для `values` в слоях).
- Координаты узла: `lon = west + col / (width - 1) * (east - west)`,
  `lat = north - row / (height - 1) * (north - south)`.
- Моки отдают 257 x 257. Размер может быть другим, фронт читает `width`/`height` из ответа,
  но рекомендуется 257 (рельеф и маршрутизация на фронте отлажены на нём).
- `resolution` это расстояние по земле между соседними отсчётами, метры (в моках считается по
  восточно-западному шагу на средней широте района: `(east - west) / (width - 1) * (π/180 * R * cos(latMid))`).
- Высоты в моках целые, но тип `number` допускает дробные.
- Ответы `/terrain` и `/layers` большие (около 66 тыс. чисел), включите gzip.

### Ошибки

Любой ответ не 2xx обязан иметь JSON-тело:

```json
{ "code": "NOT_FOUND", "message": "Район atlantis не найден" }
```

`message` показывается пользователю как есть. Пишите по-русски, коротко, с подсказкой, что
делать дальше. Если тела нет или оно не JSON, фронт покажет "Ошибка сервера (статус)".

## 2. Эндпоинты

В примерах `BASE=http://localhost:8080`.

### GET /regions

Список из 5-6 смоделированных районов. Фронт показывает его в списке районов. Идентификаторы в моках:
`jezero`, `gale`, `olympus`, `melas`, `utopia`, `elysium`.

```bash
curl -s "$BASE/regions"
```

```json
[
  {
    "id": "jezero",
    "name": "Кратер Езеро",
    "summary": "Древнее озеро с дельтой реки, место посадки Perseverance",
    "bbox": [76.9, 17.9, 78.1, 18.9],
    "center": { "lon": 77.5, "lat": 18.4 },
    "baseHeight": -2600
  }
]
```

Bbox районов из моков:

| id | bbox [W, S, E, N] | center | baseHeight, м |
|---|---|---|---|
| jezero | 76.9, 17.9, 78.1, 18.9 | 77.5, 18.4 | -2600 |
| gale | 136.9, -5.9, 138.3, -4.3 | 137.55, -5.0 | -4500 |
| olympus | -134.9, 17.6, -132.7, 19.7 | -133.8, 18.65 | 21000 |
| melas | -73.4, -11.4, -70.8, -9.4 | -72.1, -10.4 | -3800 |
| utopia | 109.3, 24.6, 110.6, 25.6 | 109.95, 25.1 | -4100 |
| elysium | 135.0, 4.0, 136.2, 5.0 | 135.6, 4.5 | -2600 |

Поля `shape` и `relief` из моков в контракт **не входят**, их отдавать не нужно.

### GET /terrain/{regionId}

Сетка высот района (`TerrainGrid`).

```bash
curl -s "$BASE/terrain/jezero"
```

```json
{
  "regionId": "jezero",
  "bbox": [76.9, 17.9, 78.1, 18.9],
  "width": 257,
  "height": 257,
  "resolution": 263.2,
  "heights": [-2210, -2214, -2219, -2223]
}
```

(`heights` в примере сокращён: на деле `width * height` значений.)

Ошибки: `404 NOT_FOUND` для неизвестного `regionId`.

### GET /layers/{regionId}/{kind}

`kind` это `slope` или `hazard`. Раскладка та же, что у террейна (тот же `bbox`, `width`, `height`).

- `slope`: уклон в градусах в каждом узле (в моках центральные разности по высотам с
  фиксацией на краях сетки, округление до 0.1).
- `hazard`: опасность 0..1 (в моках `slope / 30 + шум камней`, обрезка до 1).
  Формула не часть контракта, важен диапазон 0..1.

```bash
curl -s "$BASE/layers/jezero/slope"
```

```json
{
  "regionId": "jezero",
  "kind": "slope",
  "bbox": [76.9, 17.9, 78.1, 18.9],
  "width": 257,
  "height": 257,
  "values": [2.4, 3.1, 1.8, 0.9]
}
```

Ошибки: `404 NOT_FOUND` для неизвестного района, `400 BAD_REQUEST` для неизвестного `kind`.

### GET /places?q=&limit=

Поиск мест. Фронт всегда шлёт `limit=8`. Сопоставление в моках: регистронезависимая подстрока
по `name` и `description`; пустой `q` возвращает первые `limit` мест. Пустой результат это
`200 []`. Фронт может отменять запрос (AbortController) при быстром наборе текста.

`height` и `slope` это значения рельефа в позиции места (в моках билинейная выборка из сетки).

```bash
curl -s "$BASE/places?q=Perseverance&limit=8"
```

```json
[
  {
    "id": "octavia-butler",
    "name": "Посадка Perseverance",
    "kind": "landing-site",
    "regionId": "jezero",
    "position": { "lon": 77.4508, "lat": 18.4447 },
    "height": -2613,
    "slope": 1.8,
    "description": "Площадка «Октавия Батлер», где Perseverance сел 18 февраля 2021 года."
  }
]
```

`kind`: `landing-site`, `crater`, `mountain`, `canyon`, `plain`, `feature`.

Ошибки: `400 BAD_REQUEST` для некорректного `limit` (не число или меньше 1).

### POST /route

Строит маршрут. Заголовок `Content-Type: application/json`.

Режимы (эталон `mock/router.ts`, `MODE_LIMITS`):

| mode | макс. уклон | метры за сол |
|---|---|---|
| rover | 20 градусов | 150 |
| astronaut | 30 градусов | 6000 |

```bash
curl -s -X POST "$BASE/route" \
  -H "Content-Type: application/json" \
  -d '{"regionId":"jezero","from":{"lon":77.4508,"lat":18.4447},"to":{"lon":77.38,"lat":18.5},"mode":"rover"}'
```

```json
{
  "regionId": "jezero",
  "mode": "rover",
  "points": [
    { "lon": 77.4508, "lat": 18.4447, "height": -2613, "distance": 0,    "slope": 1.8 },
    { "lon": 77.4414, "lat": 18.4492, "height": -2609, "distance": 1180, "slope": 3.2 },
    { "lon": 77.38,   "lat": 18.5,    "height": -2541, "distance": 9460, "slope": 4.7 }
  ],
  "stats": { "length": 9460, "ascent": 112, "descent": 44, "maxSlope": 11.3, "sols": 63.1 }
}
```

Что требуется от результата (как делает референс):

- `points[0]` и `points[last]` совпадают по `lon`/`lat` с `from` и `to` запроса; `distance` первой точки 0,
  далее накопленная длина вдоль маршрута (метры, в моках целые).
- `height` и `slope` берутся из террейна в узле.
- `stats.length` = `distance` последней точки; `ascent` и `descent` это суммы положительных и
  отрицательных перепадов высоты между соседними точками (**оба неотрицательные**, `descent` положительное число);
  `maxSlope` максимум `slope` по точкам; `sols = length / метры за сол`, округление до 0.1.
- Маршрут не должен проходить по узлам с уклоном больше лимита режима.

Ошибки:

- `404 NOT_FOUND`: неизвестный `regionId`.
- `422 OUT_OF_REGION`: `from` или `to` вне bbox района ("Точка вне зоны: выберите место внутри района").
- `422 UNREACHABLE`: начальная или конечная точка круче лимита режима ("Точка слишком крутая: больше 20° для этого режима"),
  либо путь не найден ("Цель недостижима: путь перекрыт слишком крутыми склонами").
- `400 BAD_REQUEST`: неверное тело (нет полей, неизвестный `mode`, координаты вне допустимых диапазонов).

### POST /route/debug?algorithm=astar|dijkstra

Тот же запрос, что `/route`, плюс порядок раскрытия клеток поиска для анимации сравнения A* и Dijkstra
(`algorithm` обязателен). Ответ `RouteDebug`:

```bash
curl -s -X POST "$BASE/route/debug?algorithm=dijkstra" \
  -H "Content-Type: application/json" \
  -d '{"regionId":"jezero","from":{"lon":77.4508,"lat":18.4447},"to":{"lon":77.38,"lat":18.5},"mode":"rover"}'
```

```json
{
  "algorithm": "dijkstra",
  "visited": [[77.4508, 18.4447], [77.4555, 18.4447], [77.4508, 18.4494]],
  "route": null
}
```

- `visited`: пары `[lon, lat]` в порядке раскрытия (извлечения из очереди). Для A* их заметно меньше, чем для
  Dijkstra, ради этого сравнения эндпоинт и существует.
- `route` это `Route` или `null`. **Отличие от `/route`:** когда путь просто не найден, отвечайте `200` и `route: null`.
  Ошибки `OUT_OF_REGION` и `UNREACHABLE` для слишком крутой начальной/конечной точки остаются `422`, как в `/route`.
- Ошибки те же, что у `/route`; неизвестный `algorithm` это `400 BAD_REQUEST`.

### GET /trails?regionId=

Тропы района: рёбра дорожного графа как полилинии. В моках это три маршрута режима `astronaut`
между фиксированными точками района (идентификаторы вида `jezero-t0`, имена "Тропа 1"). Бэкенд волен отдавать свой граф.

```bash
curl -s "$BASE/trails?regionId=jezero"
```

```json
[
  {
    "id": "jezero-t0",
    "regionId": "jezero",
    "name": "Тропа 1",
    "points": [{ "lon": 77.08, "lat": 18.4 }, { "lon": 77.5, "lat": 18.41 }, { "lon": 77.92, "lat": 18.4 }]
  }
]
```

Ошибки: `404 NOT_FOUND` для неизвестного района. Если троп нет, `200 []`.

### GET /sun?lon=&lat=&sol=&hour=

Положение Солнца. `hour` это местное среднее солнечное время (LMST), часы 0..24, и возвращается как `lmst`.
`sol` фронт передаёт числом. Эталонная математика: функция `sunState` в `frontend/src/api/mock/index.ts`
(упрощённая модель Allison and McEwen 2000: солнечная долгота `Ls`, склонение, часовой угол).

```bash
curl -s "$BASE/sun?lon=77.45&lat=18.44&sol=120&hour=14.5"
```

```json
{ "sol": 120, "lmst": 14.5, "elevation": 38.2, "azimuth": 262.4, "hoursToSunset": 3.4 }
```

- `elevation`: градусы над горизонтом, отрицательно ночью.
- `azimuth`: градусы по часовой стрелке от севера, 0..360.
- `hoursToSunset`: часов до заката, `null`, если Солнце под горизонтом.
- Значения округляются до 0.1.

Ошибки: `400 BAD_REQUEST` для нечисловых или внеплановых значений (`hour` вне 0..24, `lat` вне -90..90).

## 3. Коды ошибок

| HTTP | code | Когда |
|---|---|---|
| 400 | `BAD_REQUEST` | Невалидные параметры запроса или тело: неизвестный `kind`, `mode`, `algorithm`; нечисловые `lon`/`lat`/`sol`/`hour`; отсутствуют обязательные поля; битый JSON. |
| 404 | `NOT_FOUND` | Неизвестный `regionId` (в пути или в `regionId` запроса/тела). Неизвестный путь тоже. |
| 422 | `OUT_OF_REGION` | `from` или `to` вне bbox района (только маршруты). |
| 422 | `UNREACHABLE` | Начальная или конечная точка круче лимита режима, либо путь между точками не найден (только `/route`; в `/route/debug` второй случай даёт `200` и `route: null`). |
| 500 | `INTERNAL` | Любая непредвиденная ошибка. Тело всё равно `{code, message}`, не stack trace. |

Не используйте другие `code`: `ApiErrorCode` на фронте это ровно эти пять значений.

## 4. CORS

Фронт ходит в бэкенд из браузера с другого origin, поэтому бэкенд обязан разрешить:

- **Origin фронтенда на Vercel** (точный адрес продакшн-деплоя; превью-деплои при необходимости по маске `https://*.vercel.app`);
- `http://localhost:5173` (Vite dev-сервер).

Методы: `GET`, `POST`, `OPTIONS`. Заголовки: `Content-Type` (и `Accept`).
`POST` с `Content-Type: application/json` вызывает preflight `OPTIONS`, он должен отвечать `2xx`
с нужными `Access-Control-Allow-*` заголовками. Куки и авторизация не используются, `allowCredentials` не нужен.
Origins лучше вынести в конфигурацию (переменная окружения), а не хардкодить. CORS-заголовки должны быть и на ответах с ошибками.

## 5. Как фронтенд переключается с моков на бэкенд

В `frontend/src/api/client.ts` базовый адрес берётся из переменной окружения `VITE_API_URL`
(завершающие `/` обрезаются):

- `VITE_API_URL` пуст или не задан: всё работает на моках в браузере (режим по умолчанию, бэкенд не нужен).
- `VITE_API_URL=http://localhost:8080`: фронт делает реальные запросы `fetch(`${VITE_API_URL}${path}`)`.

Локально:

```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8080
npm --prefix frontend run dev      # http://localhost:5173
```

На Vercel: переменная `VITE_API_URL` в настройках проекта (Environment Variables), значение
публичный адрес бэкенда; после изменения нужен новый деплой (Vite вшивает значение при сборке).
Пути не содержат префикса: `GET {VITE_API_URL}/regions`, а не `/api/regions`. Если бэкенд живёт под префиксом,
укажите его в самом `VITE_API_URL` (например `https://host/api`).

Если запрос вообще не прошёл (сеть, CORS, бэкенд не запущен), фронт показывает
"Сервер маршрутов не отвечает. Проверьте, что бэкенд запущен".

### Генерация типов из Swagger

Когда бэкенд публикует OpenAPI (springdoc: `/v3/api-docs`), фронт может перегенерировать TypeScript-типы
через `openapi-typescript` (в `frontend/package.json` есть скрипт `api:types`:
`openapi-typescript ../docs/openapi.yaml -o src/api/schema.gen.ts`). Можно направить его на живой Swagger бэкенда
(`openapi-typescript http://localhost:8080/v3/api-docs -o src/api/schema.gen.ts`) и сверить с `types.ts`.
Для этого OpenAPI бэкенда должен совпадать с `docs/openapi.yaml` по именам полей и схемам.

## 6. Чек-лист: как проверить, что бэкенд совместим

1. [ ] `GET /regions` возвращает 5-6 районов; у каждого `id`, `name`, `summary`, `bbox` (4 числа W,S,E,N), `center`, `baseHeight`.
2. [ ] `GET /terrain/{id}` для каждого района: `heights.length == width * height`, порядок row-major от северо-западного угла,
   `bbox` совпадает с регионом, `resolution` в метрах.
3. [ ] Рельеф визуально правильный: север сверху (в узле `row=0` высоты северного края), запад слева. Проверка: для Gale гора Шарп восточнее и южнее центра.
4. [ ] `GET /layers/{id}/slope` и `/hazard`: тот же `width`/`height`/`bbox`, `slope` в градусах, `hazard` в 0..1.
5. [ ] `GET /places?q=&limit=8`: пустой `q` даёт места, неизвестный текст даёт `[]` и `200`; у каждого места `height`, `slope`, `regionId`, `position`.
6. [ ] `POST /route` rover и astronaut в одном районе: первая/последняя точка равны `from`/`to`, `distance` монотонно растёт с 0,
   `stats.length` равна `distance` последней точки, `stats.sols` равны `length / 150` (rover) или `length / 6000` (astronaut), округление 0.1.
7. [ ] Маршрут rover не содержит точек с `slope > 20`, astronaut с `slope > 30`.
8. [ ] `POST /route` с точкой вне bbox даёт `422 OUT_OF_REGION`; с точкой на крутом склоне даёт `422 UNREACHABLE`; с неизвестным районом даёт `404 NOT_FOUND`; с `mode: "x"` даёт `400 BAD_REQUEST`.
9. [ ] `POST /route/debug?algorithm=astar` и `=dijkstra`: `visited` непустой, у A* заметно меньше, чем у Dijkstra на той же паре точек; `route` совпадает по длине (оба оптимальны).
10. [ ] `GET /trails?regionId=` возвращает массив полилиний `{id, regionId, name, points[]}` с точками внутри bbox.
11. [ ] `GET /sun`: ночью `elevation < 0` и `hoursToSunset: null`; днём `hoursToSunset` число; `lmst` равно переданному `hour`.
12. [ ] Все ошибки 4xx/5xx это JSON `{code, message}` с одним из пяти кодов, `message` по-русски.
13. [ ] CORS: `curl -i -X OPTIONS "$BASE/route" -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
    отвечает `2xx` с `Access-Control-Allow-Origin: http://localhost:5173`.
14. [ ] Swagger бэкенда (`/v3/api-docs`) валиден и совпадает с `docs/openapi.yaml`; `openapi-typescript` генерирует типы без ошибок, `tsc` на фронте проходит.
15. [ ] Фронт с `VITE_API_URL=http://localhost:8080`: открыть район, построить маршрут, включить слои уклона и опасности, поиск, троп и Солнце, без ошибок в консоли и вкладке Network.
