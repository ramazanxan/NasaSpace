package com.example.nasaproject;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;

/** API v1, see docs/CONTRACT-v1.md. */
@RestController
@RequestMapping("/api/v1")
public class RouteController {

    private final RoutingService service;
    private final LayerService layers;

    public RouteController(RoutingService service, LayerService layers) {
        this.service = service;
        this.layers = layers;
    }

    /** Plan a route. Body: see RouteRequest. */
    @PostMapping("/routes/plan")
    public RouteResponse plan(@RequestBody(required = false) RouteRequest request) {
        return service.plan(request);
    }

    /** Backend state, loaded layers, profiles and model notes. */
    @GetMapping("/grid/info")
    public GridInfo info() {
        return service.info();
    }

    /** Everything known about the cell under a point, with passability for each profile. */
    @GetMapping("/cells/at")
    public Map<String, Object> cellAt(@RequestParam(required = false) Double lon,
                                      @RequestParam(required = false) Double lat,
                                      @RequestParam(required = false) Double hour) {
        return service.cellAt(lon, lat, hour);
    }

    /** Analysis layer catalog with legend stops. */
    @GetMapping("/cells/nearest-open")
    public Map<String, Object> nearestOpen(@RequestParam(required = false) Double lon,
                                           @RequestParam(required = false) Double lat,
                                           @RequestParam(required = false) String mode,
                                           @RequestParam(required = false) Double hour) {
        return service.nearestOpen(lon, lat, mode, hour);
    }

    @GetMapping("/layers")
    public LayerService.Catalog layers() {
        return layers.catalog();
    }

    /** One analysis layer as an equirectangular RGBA PNG over the catalog bbox. */
    @GetMapping("/layers/{id}.png")
    public ResponseEntity<byte[]> layerPng(@PathVariable String id,
                                           @RequestParam(required = false) String mode,
                                           @RequestParam(required = false) Double hour,
                                           @RequestParam(required = false) Integer width) {
        byte[] png = layers.png(id, mode, hour, width);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(300)).cachePublic())
                .body(png);
    }
}
