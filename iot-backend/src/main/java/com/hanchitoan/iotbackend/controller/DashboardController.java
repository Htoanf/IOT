package com.hanchitoan.iotbackend.controller;

import com.hanchitoan.iotbackend.entity.SensorData;
import com.hanchitoan.iotbackend.repository.SensorDataRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final SensorDataRepository repository;

    public DashboardController(SensorDataRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/latest")
    public LatestSensors getLatest() {
        return new LatestSensors(latest("temperature"), latest("humidity"), latest("light"));
    }

    private SensorData latest(String sensorType) {
        return repository.findFirstBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc(sensorType)
                .orElse(null);
    }

    public record LatestSensors(SensorData temperature, SensorData humidity, SensorData light) {}
}
