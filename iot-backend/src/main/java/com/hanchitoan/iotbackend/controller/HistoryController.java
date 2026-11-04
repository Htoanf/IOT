package com.hanchitoan.iotbackend.controller;

import com.hanchitoan.iotbackend.entity.DeviceHistory;
import com.hanchitoan.iotbackend.repository.DeviceHistoryRepository;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

@RestController
@RequestMapping("/api/history")
public class HistoryController {
    private final DeviceHistoryRepository repository;

    public HistoryController(DeviceHistoryRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<DeviceHistory> getHistory() {
        return repository.findAll(Sort.by(Sort.Direction.DESC, "id"));
    }
}
