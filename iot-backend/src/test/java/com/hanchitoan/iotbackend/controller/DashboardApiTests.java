package com.hanchitoan.iotbackend.controller;

import com.hanchitoan.iotbackend.entity.SensorData;
import com.hanchitoan.iotbackend.repository.SensorDataRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DashboardApiTests {
    private final SensorDataRepository repository = mock(SensorDataRepository.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
            new DashboardController(repository), new SensorController(repository)).build();

    @Test
    void latestPreservesZeroAndReportsMissingSensorsAsNull() throws Exception {
        SensorData light = new SensorData("light", 0.0, "lux");
        when(repository.findFirstBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc("light"))
                .thenReturn(Optional.of(light));
        mvc.perform(get("/api/dashboard/latest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temperature").isEmpty())
                .andExpect(jsonPath("$.humidity").isEmpty())
                .andExpect(jsonPath("$.light.value").value(0.0))
                .andExpect(jsonPath("$.light.unit").value("lux"))
                .andExpect(jsonPath("$.light.createdAt").isNotEmpty());
    }

    @Test
    void recentReturnsIndependentSeriesOldestFirstWithoutFillingMissingValues() throws Exception {
        SensorData older = new SensorData("temperature", 28.5, "C");
        older.setCreatedAt(LocalDateTime.of(2026, 11, 1, 10, 0));
        SensorData newer = new SensorData("temperature", 29.1, "C");
        newer.setCreatedAt(older.getCreatedAt().plusSeconds(2));
        when(repository.findBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc("temperature", PageRequest.of(0, 2)))
                .thenReturn(List.of(newer, older));
        mvc.perform(get("/api/sensors/recent?limit=2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temperature.length()").value(2))
                .andExpect(jsonPath("$.temperature[0].value").value(28.5))
                .andExpect(jsonPath("$.temperature[1].value").value(29.1))
                .andExpect(jsonPath("$.humidity").isEmpty())
                .andExpect(jsonPath("$.light").isEmpty());
    }

    @Test
    void recentDefaultsToFifteenAndReturnsEmptySeriesWithoutData() throws Exception {
        mvc.perform(get("/api/sensors/recent"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temperature").isEmpty())
                .andExpect(jsonPath("$.humidity").isEmpty())
                .andExpect(jsonPath("$.light").isEmpty());
        verify(repository).findBySensorTypeAndValueIsNotNullOrderByCreatedAtDescIdDesc("temperature", PageRequest.of(0, 15));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "101", "abc", "1.5", "999999999999"})
    void invalidLimitDoesNotQueryDatabase(String limit) throws Exception {
        mvc.perform(get("/api/sensors/recent").param("limit", limit))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(repository);
    }
}
