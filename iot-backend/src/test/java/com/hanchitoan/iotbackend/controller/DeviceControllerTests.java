package com.hanchitoan.iotbackend.controller;

import com.hanchitoan.iotbackend.service.MqttService;
import com.hanchitoan.iotbackend.entity.DeviceHistory;
import com.hanchitoan.iotbackend.repository.DeviceHistoryRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DeviceControllerTests {
    private final MqttService mqtt = mock(MqttService.class);
    private final DeviceHistoryRepository history = mock(DeviceHistoryRepository.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new DeviceController(mqtt, history)).build();

    @Test
    void returnsUnknownUntilSuccessfulAcknowledgementExists() throws Exception {
        mvc.perform(get("/api/devices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].name").value("LED 1"))
                .andExpect(jsonPath("$[0].state").value("UNKNOWN"))
                .andExpect(jsonPath("$[0].lastConfirmedAt").isEmpty())
                .andExpect(jsonPath("$[1].id").value(2))
                .andExpect(jsonPath("$[1].state").value("UNKNOWN"))
                .andExpect(jsonPath("$[2].id").value(3))
                .andExpect(jsonPath("$[2].name").value("LED 3"))
                .andExpect(jsonPath("$[2].state").value("UNKNOWN"));
        verifyNoInteractions(mqtt);
    }

    @Test
    void controlDoesNotOverwriteLastConfirmedState() throws Exception {
        DeviceHistory acknowledged = new DeviceHistory(1, "SUCCESS", "ON");
        when(history.findFirstByDeviceIdAndStatusOrderByIdDesc(1, "SUCCESS"))
                .thenReturn(Optional.of(acknowledged));
        mvc.perform(post("/api/devices/1/control").contentType(MediaType.APPLICATION_JSON)
                .content("{\"state\":\"OFF\"}"))
                .andExpect(status().isAccepted());
        mvc.perform(get("/api/devices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].state").value("ON"))
                .andExpect(jsonPath("$[0].lastConfirmedAt").isNotEmpty())
                .andExpect(jsonPath("$[1].state").value("UNKNOWN"));
        verify(mqtt).controlDevice(1, "OFF");
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3})
    void returnsPublishedAfterSendingCommand(int deviceId) throws Exception {
        mvc.perform(post("/api/devices/" + deviceId + "/control").contentType(MediaType.APPLICATION_JSON)
                .content("{\"state\":\"ON\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.deviceId").value(deviceId))
                .andExpect(jsonPath("$.state").value("ON"))
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
        verify(mqtt).controlDevice(deviceId, "ON");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"state\":null}", "{\"state\":\"\"}",
            "{\"state\":\"on\"}", "{\"state\":\"TOGGLE\"}", "{\"state\":true}", "{"})
    void rejectsInvalidBodyWithoutSendingCommand(String payload) throws Exception {
        mvc.perform(post("/api/devices/1/control").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(mqtt);
    }
}
