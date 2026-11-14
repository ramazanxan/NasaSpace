# NasaSpace backend (Java)

Бэкенд планировщика маршрутов по Марсу. Контракт с фронтендом:
[`docs/API.md`](../docs/API.md) (описание для людей) и [`docs/openapi.yaml`](../docs/openapi.yaml) (OpenAPI 3.1).
Реализовать нужно ровно эти эндпоинты, без дополнительных полей.

## Рекомендуемый стек

- Java 21, Spring Boot 3 (spring-boot-starter-web, validation)
- springdoc-openapi (`springdoc-openapi-starter-webmvc-ui`): Swagger UI на `/swagger-ui.html`,
  OpenAPI JSON на `/v3/api-docs`. Фронт может сгенерировать из него типы через `openapi-typescript`.
- Maven или Gradle, JUnit 5 для тестов.
- Базы данных нет: всё держим в памяти.

## Структура пакетов

```
com.nasaspace
├── api/        REST-контроллеры, DTO (records), ApiErrorBody, @RestControllerAdvice, CORS
├── terrain/    загрузка сеток высот в память, TerrainGrid, слои slope/hazard
├── routing/    A*, Dijkstra, модель стоимости, режимы rover/astronaut, trails
├── places/     список мест и поиск
└── sun/        положение Солнца (sunState)
```

## DTO (records, поля один в один с контрактом)

```java
public record LonLat(double lon, double lat) {}

public record RoutePoint(
    double lon,
    double lat,
    double height,    // м от ареоида MOLA
    double distance,  // м от начала маршрута, у первой точки 0
    double slope      // градусы
) {}

public record RouteStats(
    double length,    // м
    double ascent,    // м, суммарный набор
    double descent,   // м, суммарный спуск (положительное число)
    double maxSlope,  // градусы
    double sols       // length / метры за сол режима, округление до 0.1
) {}

public enum TravelMode { rover, astronaut } // в JSON строчными: "rover" / "astronaut"

public record Route(
    String regionId,
    TravelMode mode,
    List<RoutePoint> points,
    RouteStats stats
) {}

public record RouteRequest(String regionId, LonLat from, LonLat to, TravelMode mode) {}

public record RouteDebug(String algorithm, List<double[]> visited, Route route) {} // route может быть null

public record ApiErrorBody(String code, String message) {}
```

Имена JSON-полей camelCase, как в записях. `ApiErrorBody.code` это одно из:
`OUT_OF_REGION`, `UNREACHABLE`, `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL`.
Значения `TravelMode` в JSON строчные (`rover`, `astronaut`), поэтому лучше назвать константы так же или
использовать `@JsonValue`/`@JsonProperty`. Поле `RouteDebug.route` должно сериализоваться как `null`, а не пропускаться.

Ошибки: бросайте своё `ApiException(status, code, message)` и превращайте в `ApiErrorBody` в одном
`@RestControllerAdvice`. Так же ловите ошибки валидации, битый JSON и неизвестный путь (`BAD_REQUEST`/`NOT_FOUND`)
и любое необработанное исключение (`INTERNAL`): фронт ждёт `{code, message}` на любом не-2xx.

## CORS

Разрешить origin фронта на Vercel и `http://localhost:5173`, методы GET/POST/OPTIONS, заголовок Content-Type.
Адреса вынесите в конфиг:

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Value("${nasaspace.cors.origins:http://localhost:5173}")
    private String[] origins; // добавьте адрес Vercel через переменную окружения

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(origins)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept");
    }
}
```

## Сетки в памяти (без БД)

- При старте загрузите по одной сетке высот на район (5-6 штук) и держите в `Map<String, TerrainGrid>`.
  Рекомендуемый размер 257 x 257, `double[]` или `float[]` в порядке row-major от северо-западного угла
  (`i = row * width + col`), как в ответе API.
- Уклон считайте один раз при загрузке (центральные разности, края фиксируются) и кэшируйте; слой `hazard` тоже.
- Источник данных: файлы в ресурсах (например, GeoTIFF/PNG/бинарные `.bin` с данными MOLA/HiRISE, нарезанные под bbox района)
  или временно синтетика. Все объекты неизменяемы после загрузки, значит потокобезопасны без блокировок.
- Ответы `/terrain` и `/layers` около 66 тыс. чисел: включите gzip (`server.compression.enabled=true`,
  `server.compression.mime-types=application/json`).
- Места (`places`) и список районов держите как статический список в памяти; `height`/`slope` места берите
  билинейной выборкой из сетки.
- Расстояния считаются на сфере радиусом 3 389 500 м.
- Координаты в ответах: долгота -180..180, восток положителен.

## Эталонный алгоритм

Эталонная реализация маршрутизации лежит во фронтенде: `frontend/src/api/mock/router.ts`
(поиск по сетке с шагом 2 через узел, 8 соседей, модель стоимости, лимиты режимов
rover 20 градусов / 150 м за сол и astronaut 30 градусов / 6000 м за сол, ошибки `OUT_OF_REGION` и `UNREACHABLE`).
Там же формат `visited` для `/route/debug`. Остальные ориентиры:

- `frontend/src/api/mock/terrain.ts`: раскладка сетки и расчёт уклона;
- `frontend/src/api/mock/index.ts`: поиск мест, `/trails`, математика `/sun`;
- `frontend/src/map/geo.ts`: `toGrid`/`fromGrid`, расстояние на сфере, билинейная выборка.

Алгоритм можно улучшить, но контракт ответа (поля, единицы, ошибки) менять нельзя без правки
`frontend/src/api/types.ts` и `docs/openapi.yaml` одновременно.

## Проверка совместимости

Чек-лист в конце [`docs/API.md`](../docs/API.md), раздел "Чек-лист: как проверить, что бэкенд совместим".
