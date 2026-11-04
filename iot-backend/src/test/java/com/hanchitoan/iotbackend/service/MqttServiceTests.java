package com.hanchitoan.iotbackend.service;

import com.hanchitoan.iotbackend.entity.SensorData;
import com.hanchitoan.iotbackend.repository.SensorDataRepository;
import com.hanchitoan.iotbackend.repository.DeviceHistoryRepository;
import com.hanchitoan.iotbackend.entity.DeviceHistory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;
import static org.mockito.AdditionalMatchers.aryEq;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;

class MqttServiceTests {
    private final SensorDataRepository repository = mock(SensorDataRepository.class);
    private final DeviceHistoryRepository history = mock(DeviceHistoryRepository.class);
    private final MqttService service = new MqttService(repository, new ObjectMapper(), history);

    private void receiveTopic(String topic, String payload) {
        ReflectionTestUtils.setField(service, "sensorTopic", "sensor/data");
        ReflectionTestUtils.setField(service, "statusTopic", "device/status");
        ReflectionTestUtils.invokeMethod(service, "handleMessage", topic, payload);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"deviceId\":1,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":2,\"status\":\"SUCCESS\",\"state\":\"OFF\"}",
            "{\"deviceId\":3,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":3,\"status\":\"FAILED\",\"state\":\"UNKNOWN\"}",
            "{\"deviceId\":1,\"status\":\"FAILED\",\"state\":\"UNKNOWN\"}"})
    void storesReportedStatusOnlyInHistory(String payload) {
        receiveTopic("device/status", payload);
        ArgumentCaptor<DeviceHistory> record = ArgumentCaptor.forClass(DeviceHistory.class);
        verify(history).save(record.capture());
        var expected = new ObjectMapper().readTree(payload);
        assertEquals(expected.get("deviceId").asInt(), record.getValue().getDeviceId());
        assertEquals(expected.get("status").asString(), record.getValue().getStatus());
        assertEquals(expected.get("state").asString(), record.getValue().getState());
        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "null", "[]", "{}",
            "{\"deviceId\":null,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":\"1\",\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":1.5,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":4294967297,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":4,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":0,\"status\":\"SUCCESS\",\"state\":\"ON\"}",
            "{\"deviceId\":1,\"status\":\"SUCCESS\",\"state\":\"UNKNOWN\"}",
            "{\"deviceId\":1,\"status\":\"PUBLISHED\",\"state\":\"ON\"}",
            "{\"deviceId\":1,\"status\":\"SUCCESS\",\"state\":true}"})
    void rejectsInvalidStatusWithoutSaving(String payload) {
        receiveTopic("device/status", payload);
        verifyNoInteractions(repository, history);
    }

    @Test
    void ignoresOtherTopicsAndDoesNotCreateHistoryFromSensors() {
        receiveTopic("device/control/1", "ON");
        verifyNoInteractions(repository, history);
        receiveTopic("sensor/data", "{\"temperature\":28.5}");
        verify(repository).save(any(SensorData.class));
        verifyNoInteractions(history);
    }

    private void receive(String payload) {
        ReflectionTestUtils.invokeMethod(service, "saveSensorData", payload);
    }

    @Test
    void publishesAllDeviceCommandsWithoutRetainingThem() throws Exception {
        MqttClient client = mock(MqttClient.class);
        when(client.isConnected()).thenReturn(true);
        ReflectionTestUtils.setField(service, "mqttClient", client);
        ReflectionTestUtils.setField(service, "controlTopic", "device/control");
        service.controlDevice(1, "ON");
        service.controlDevice(2, "OFF");
        service.controlDevice(3, "ON");
        service.controlDevice(3, "OFF");
        verifyNoInteractions(history);
        verify(client).publish(eq("device/control/1"), aryEq("ON".getBytes(StandardCharsets.UTF_8)), eq(1), eq(false));
        verify(client).publish(eq("device/control/2"), aryEq("OFF".getBytes(StandardCharsets.UTF_8)), eq(1), eq(false));
        verify(client).publish(eq("device/control/3"), aryEq("ON".getBytes(StandardCharsets.UTF_8)), eq(1), eq(false));
        verify(client).publish(eq("device/control/3"), aryEq("OFF".getBytes(StandardCharsets.UTF_8)), eq(1), eq(false));
    }

    @Test
    void rejectsInvalidCommandsBeforePublishing() {
        MqttClient client = mock(MqttClient.class);
        ReflectionTestUtils.setField(service, "mqttClient", client);
        for (int id : new int[]{0, -1, 4}) {
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.controlDevice(id, "ON")).getStatusCode().value());
        }
        for (String state : new String[]{null, "", "on", "TOGGLE"}) {
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.controlDevice(1, state)).getStatusCode().value());
        }
        verifyNoInteractions(client);
    }

    @Test
    void returnsUnavailableWhenDisconnectedOrPublishFails() throws Exception {
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.controlDevice(1, "ON")).getStatusCode().value());
        MqttClient client = mock(MqttClient.class);
        ReflectionTestUtils.setField(service, "mqttClient", client);
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.controlDevice(1, "ON")).getStatusCode().value());
        verify(client, never()).publish(anyString(), any(byte[].class), anyInt(), anyBoolean());
        when(client.isConnected()).thenReturn(true);
        ReflectionTestUtils.setField(service, "controlTopic", "device/control");
        doThrow(new MqttException(32109)).when(client).publish(anyString(), any(byte[].class), anyInt(), anyBoolean());
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.controlDevice(1, "ON")).getStatusCode().value());
    }

    @Test
    void savesAllValidReadingsIncludingZero() {
        receive("{\"temperature\":28.5,\"humidity\":65,\"light\":0}");
        ArgumentCaptor<SensorData> records = ArgumentCaptor.forClass(SensorData.class);
        verify(repository, times(3)).save(records.capture());
        var saved = records.getAllValues();
        assertEquals("temperature", saved.get(0).getSensorType());
        assertEquals(28.5, saved.get(0).getValue());
        assertEquals("C", saved.get(0).getUnit());
        assertEquals("humidity", saved.get(1).getSensorType());
        assertEquals(65.0, saved.get(1).getValue());
        assertEquals("%", saved.get(1).getUnit());
        assertEquals("light", saved.get(2).getSensorType());
        assertEquals(0.0, saved.get(2).getValue());
        assertEquals("lux", saved.get(2).getUnit());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", ",\"light\":null", ",\"light\":\"420\"",
            ",\"light\":true", ",\"light\":{}", ",\"light\":[]", ",\"light\":1e400"})
    void skipsInvalidLightAndKeepsValidFields(String light) {
        receive("{\"temperature\":28.5,\"humidity\":65" + light + "}");
        ArgumentCaptor<SensorData> records = ArgumentCaptor.forClass(SensorData.class);
        verify(repository, times(2)).save(records.capture());
        assertEquals("temperature", records.getAllValues().get(0).getSensorType());
        assertEquals("humidity", records.getAllValues().get(1).getSensorType());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{", "null", "[]", "42", "{}",
            "{\"temperature\":null,\"humidity\":\"bad\",\"light\":false}"})
    void doesNotSaveInvalidPayloadOrInvalidFields(String payload) {
        receive(payload);
        verifyNoInteractions(repository);
    }
}
