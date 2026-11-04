package com.hanchitoan.iotbackend.controller;

import com.hanchitoan.iotbackend.entity.SensorData;
import com.hanchitoan.iotbackend.repository.SensorDataRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/sensors")
public class SensorController {

    private final SensorDataRepository repository;

    public SensorController(SensorDataRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public SensorData createSensorData(@RequestBody SensorData sensorData) {
        return repository.save(sensorData);
    }

    @GetMapping
    public List<SensorData> getAllSensorData() {
        return repository.findAll();
    }

    @GetMapping("/recent")
    public SensorSeries getRecent(@RequestParam(defaultValue = "15") int limit) {
        if (limit < 1 || limit > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
        }
        return new SensorSeries(recent("temperature", limit), recent("humidity", limit), recent("light", limit));
    }

    private List<SensorData> recent(String sensorType, int limit) {
        // Limit in SQL, then return oldest first for plotting each independent series.
        List<SensorData> readings = new ArrayList<>(
                repository.findBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc(
                        sensorType, PageRequest.of(0, limit)));
        Collections.reverse(readings);
        return readings;
    }

    public record SensorSeries(List<SensorData> temperature, List<SensorData> humidity, List<SensorData> light) {}
}
