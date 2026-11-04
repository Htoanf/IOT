package com.hanchitoan.iotbackend.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "device_history")
public class DeviceHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Integer deviceId;

    @Column(nullable = false)
    private String status;

    @Column(nullable = false)
    private String state;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected DeviceHistory() {}

    public DeviceHistory(int deviceId, String status, String state) {
        this.deviceId = deviceId;
        this.status = status;
        this.state = state;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Integer getDeviceId() { return deviceId; }
    public String getStatus() { return status; }
    public String getState() { return state; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
