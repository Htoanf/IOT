package com.hanchitoan.iotbackend.repository;

import com.hanchitoan.iotbackend.entity.SensorData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import java.util.List;
import java.util.Optional;

public interface SensorDataRepository extends JpaRepository<SensorData, Long> {
    Optional<SensorData> findFirstBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc(String sensorType);

    List<SensorData> findBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc(
            String sensorType, Pageable pageable);
}
