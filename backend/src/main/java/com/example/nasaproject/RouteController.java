package com.example.nasaproject;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class RouteController {

    private final RoutingService service;

    public RouteController(RoutingService service) { this.service = service; }

    /** Построить маршрут. Тело: см. RouteRequest. */
    @PostMapping("/routes/plan")
    public RouteResponse plan(@RequestBody RouteRequest request) {
        return service.plan(request);
    }

    /** Проверка состояния и параметров модели. */
    @GetMapping("/grid/info")
    public GridInfo info() {
        return service.info();
    }
}
