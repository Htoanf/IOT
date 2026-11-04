package com.hanchitoan.iotbackend.controller;

import com.hanchitoan.iotbackend.service.MqttService;
import com.hanchitoan.iotbackend.repository.DeviceHistoryRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {
    private final MqttService mqttService;
    private final DeviceHistoryRepository historyRepository;

    public DeviceController(MqttService mqttService, DeviceHistoryRepository historyRepository) {
        this.mqttService = mqttService;
        this.historyRepository = historyRepository;
    }

    @GetMapping
    public List<DeviceStatus> getDevices() {
        return List.of(lastConfirmedStatus(1), lastConfirmedStatus(2), lastConfirmedStatus(3));
    }

    private DeviceStatus lastConfirmedStatus(int deviceId) {
        String name = "LED " + deviceId;
        return historyRepository.findFirstByDeviceIdAndStatusOrderByIdDesc(deviceId, "SUCCESS")
                .map(event -> new DeviceStatus(deviceId, name, event.getState(), event.getCreatedAt()))
                .orElseGet(() -> new DeviceStatus(deviceId, name, "UNKNOWN", null));
    }

    @PostMapping("/{deviceId}/control")
    public ResponseEntity<ControlResponse> control(
            @PathVariable int deviceId, @Valid @RequestBody ControlRequest request) {
        mqttService.controlDevice(deviceId, request.state());
        return ResponseEntity.accepted().body(new ControlResponse(deviceId, request.state(), "PUBLISHED"));
    }

    public record ControlRequest(@NotBlank @Pattern(regexp = "ON|OFF") String state) {}

    // PUBLISHED confirms sending to the broker; ESP32 acknowledgement is a separate step.
    public record ControlResponse(int deviceId, String state, String status) {}

    // Last acknowledged state; this does not indicate whether the ESP32 is currently online.
    public record DeviceStatus(int id, String name, String state, LocalDateTime lastConfirmedAt) {}
}
