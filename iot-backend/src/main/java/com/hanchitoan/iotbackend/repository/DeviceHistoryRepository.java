package com.hanchitoan.iotbackend.repository;

import com.hanchitoan.iotbackend.entity.DeviceHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DeviceHistoryRepository extends JpaRepository<DeviceHistory, Long> {
    Optional<DeviceHistory> findFirstByDeviceIdAndStatusOrderByIdDesc(Integer deviceId, String status);
}
