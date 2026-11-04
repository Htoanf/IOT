package com.hanchitoan.iotbackend.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.hanchitoan.iotbackend.entity.SensorData;
import com.hanchitoan.iotbackend.repository.SensorDataRepository;
import com.hanchitoan.iotbackend.entity.DeviceHistory;
import com.hanchitoan.iotbackend.repository.DeviceHistoryRepository;

import org.eclipse.paho.client.mqttv3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class MqttService {

    private final SensorDataRepository sensorDataRepository;
    private final ObjectMapper objectMapper;
    private final DeviceHistoryRepository deviceHistoryRepository;

    @Value("${mqtt.broker}")
    private String broker;

    @Value("${mqtt.username}")
    private String username;

    @Value("${mqtt.password}")
    private String password;

    @Value("${mqtt.topic.sensor}")
    private String sensorTopic;

    @Value("${mqtt.topic.status}")
    private String statusTopic;

    @Value("${mqtt.topic.control}")
    private String controlTopic;

    private volatile MqttClient mqttClient;

    public MqttService(
            SensorDataRepository sensorDataRepository,
            ObjectMapper objectMapper,
            DeviceHistoryRepository deviceHistoryRepository) {

        this.sensorDataRepository = sensorDataRepository;
        this.objectMapper = objectMapper;
        this.deviceHistoryRepository = deviceHistoryRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void connect() {

        try {
            String clientId = "spring-backend-" + UUID.randomUUID();

            mqttClient = new MqttClient(
                    broker,
                    clientId,
                    new MemoryPersistence()
            );
            mqttClient.setTimeToWait(5000);

            MqttConnectOptions options = new MqttConnectOptions();

            options.setUserName(username);
            options.setPassword(password.toCharArray());
            options.setAutomaticReconnect(true);
            options.setCleanSession(true);

            mqttClient.setCallback(new MqttCallbackExtended() {

                @Override
                public void connectComplete(
                        boolean reconnect,
                        String serverURI) {

                    System.out.println("MQTT connected: " + serverURI);

                    try {
                        mqttClient.subscribe(sensorTopic);
                        System.out.println(
                                "Subscribed topic: " + sensorTopic
                        );
                        mqttClient.subscribe(statusTopic);
                        System.out.println("Subscribed topic: " + statusTopic);
                    } catch (MqttException e) {
                        e.printStackTrace();
                    }
                }

                @Override
                public void connectionLost(Throwable cause) {
                    System.out.println("MQTT connection lost");
                }

                @Override
                public void messageArrived(
                        String topic,
                        MqttMessage message) {

                    String payload =
                            new String(message.getPayload(), StandardCharsets.UTF_8);

                    System.out.println(
                            "MQTT received: " + payload
                    );

                    handleMessage(topic, payload);
                }

                @Override
                public void deliveryComplete(
                        IMqttDeliveryToken token) {
                }
            });

            mqttClient.connect(options);

        } catch (Exception e) {
            System.out.println(
                    "Cannot connect MQTT broker: "
                    + e.getMessage()
            );
        }
    }

    private void handleMessage(String topic, String payload) {
        if (sensorTopic.equals(topic)) {
            saveSensorData(payload);
        } else if (statusTopic.equals(topic)) {
            saveDeviceStatus(payload);
        }
    }

    private void saveDeviceStatus(String payload) {
        try {
            JsonNode json = objectMapper.readTree(payload);
            if (json == null || !json.isObject()) {
                System.out.println("Invalid device status: expected a JSON object");
                return;
            }
            JsonNode deviceId = json.get("deviceId");
            JsonNode status = json.get("status");
            JsonNode state = json.get("state");
            if (deviceId == null || !deviceId.isIntegralNumber() || !deviceId.canConvertToInt()
                    || (deviceId.asInt() < 1 || deviceId.asInt() > 3)
                    || status == null || !status.isString()
                    || state == null || !state.isString()) {
                System.out.println("Invalid device status: invalid or missing fields");
                return;
            }

            String result = status.asString();
            String reportedState = state.asString();
            boolean knownState = "ON".equals(reportedState) || "OFF".equals(reportedState);
            boolean valid = ("SUCCESS".equals(result) && knownState)
                    || ("FAILED".equals(result) && (knownState || "UNKNOWN".equals(reportedState)));
            if (!valid) {
                System.out.println("Invalid device status: unsupported status/state");
                return;
            }

            deviceHistoryRepository.save(new DeviceHistory(deviceId.asInt(), result, reportedState));
            System.out.println("Device status saved: device=" + deviceId.asInt()
                    + " status=" + result + " state=" + reportedState);
        } catch (Exception e) {
            // Keep malformed payloads and persistence failures inside the callback.
            System.out.println("Cannot save device status: " + e.getClass().getSimpleName());
        }
    }

    public void controlDevice(int deviceId, String state) {
        if (deviceId < 1 || deviceId > 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "deviceId must be between 1 and 3");
        }
        if (!"ON".equals(state) && !"OFF".equals(state)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "state must be ON or OFF");
        }

        MqttClient client = mqttClient;
        if (client == null || !client.isConnected()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "MQTT is not connected");
        }

        String topic = controlTopic + "/" + deviceId;
        try {
            client.publish(topic, state.getBytes(StandardCharsets.UTF_8), 1, false);
            System.out.println("MQTT command published: " + topic + " " + state);
        } catch (MqttException e) {
            System.out.println("MQTT command failed, reason code: " + e.getReasonCode());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Cannot publish MQTT command");
        }
    }

    private void saveSensorData(String payload) {

        try {
            JsonNode json = objectMapper.readTree(payload);

            if (json == null || !json.isObject()) {
                System.out.println("Invalid sensor data: expected a JSON object");
                return;
            }

            saveNumericField(json, "temperature", "C");
            saveNumericField(json, "humidity", "%");
            saveNumericField(json, "light", "lux");
        } catch (Exception e) {
            System.out.println(
                    "Invalid sensor data: "
                    + e.getMessage()
            );
        }
    }

    private void saveNumericField(JsonNode json, String sensorType, String unit) {
        JsonNode field = json.get(sensorType);
        if (field == null || !field.isNumber()) {
            System.out.println("Skipped sensor field: " + sensorType + " (missing, null or not a number)");
            return;
        }

        double value = field.asDouble();
        if (!Double.isFinite(value)) {
            System.out.println("Skipped sensor field: " + sensorType + " (not a finite number)");
            return;
        }

        sensorDataRepository.save(new SensorData(sensorType, value, unit));
        System.out.println("Sensor saved: " + sensorType + "=" + value + " " + unit);
    }
}
