# Hệ thống giám sát môi trường IoT

Project giám sát nhiệt độ, độ ẩm và ánh sáng từ ESP32; điều khiển ba LED qua MQTT; lưu dữ liệu vào MySQL và hiển thị trên Web Dashboard.

## Thành phần

- `dashboard.html`, `data-sensor.html`, `history.html`, `profile.html`: giao diện HTML/CSS/JavaScript.
- `iot-backend/`: Java 21, Spring Boot 4.1.1, Spring Data JPA và Eclipse Paho MQTT.
- `esp32/esp32_iot_current/`: firmware ESP32 dùng WiFi, PubSubClient và DHT sensor library.
- Mosquitto: broker MQTT cổng 2005; MySQL: database `iot_db`.

## Chạy backend trên Windows

1. Cài Java 21, MySQL và Mosquitto. Tạo database `iot_db` trong MySQL.
2. Chạy Mosquitto với listener cổng 2005 và tài khoản MQTT của bạn.
3. Mở PowerShell trong thư mục `iot-backend`, cấu hình biến môi trường rồi chạy:

```powershell
$env:JAVA_HOME = "C:\duong-dan-den\jdk-21"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:DB_USERNAME = "ten_tai_khoan_mysql"
$env:DB_PASSWORD = "mat_khau_mysql_cua_ban"
$env:MQTT_USERNAME = "ten_tai_khoan_mqtt"
$env:MQTT_PASSWORD = "mat_khau_mqtt_cua_ban"
.\mvnw.cmd spring-boot:run
```

Các giá trị mặc định là backend `http://localhost:8080`, MySQL `jdbc:mysql://localhost:3306/iot_db` và MQTT `tcp://localhost:2005`. Có thể thay bằng `SERVER_PORT`, `DB_URL` và `MQTT_BROKER`. Mật khẩu thật không được lưu trong repository.

Kiểm tra backend: mở `http://localhost:8080/api/test`; kết quả mong đợi là `IoT Backend is running`.

## Chạy giao diện

Mở thư mục project bằng VS Code, dùng Live Server để mở `dashboard.html` qua HTTP, ví dụ `http://127.0.0.1:5500/dashboard.html`. Backend mặc định tại cổng 8080. Dashboard và Data Sensors tải lại dữ liệu khoảng 2 giây sau mỗi lượt tải; History tải khi mở trang hoặc bấm Tải lại. Profile là trang tĩnh.

## ESP32

Mở `esp32/esp32_iot_current/esp32_iot_current.ino` trong Arduino IDE, cài board ESP32 và các thư viện PubSubClient, DHT sensor library cùng dependency cần thiết. Thay các chuỗi `YOUR_*` bằng cấu hình Wi-Fi và MQTT trên máy của bạn trước khi nạp. ESP32 phải dùng IP LAN của máy chạy broker, không dùng `localhost`.

| Thành phần | GPIO |
|---|---|
| DHT11 | 4 |
| Cảm biến ánh sáng | 34 |
| LED 1 | 25 |
| LED 2 | 26 |
| LED 3 | 27 |

MQTT dùng `sensor/data`, `device/status` và `device/control/1`, `/2`, `/3`. Lệnh điều khiển là chuỗi `ON` hoặc `OFF`. Firmware còn hỗ trợ `device/control/all`; backend hiện điều khiển từng ID 1–3. Ánh sáng là lux ước tính, chưa hiệu chuẩn.

## REST API

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/api/test` | Kiểm tra HTTP backend |
| GET | `/api/dashboard/latest` | Bản ghi mới nhất của từng loại cảm biến |
| GET | `/api/sensors/recent?limit=15` | Tối đa 15 điểm mỗi loại; limit hợp lệ 1–100 |
| GET | `/api/sensors` | Danh sách dữ liệu cảm biến |
| POST | `/api/sensors` | Lưu một bản ghi cảm biến |
| GET | `/api/devices` | Trạng thái xác nhận cuối của ba LED |
| POST | `/api/devices/{deviceId}/control` | JSON `{"state":"ON"}` hoặc `{"state":"OFF"}` |
| GET | `/api/history` | Lịch sử phản hồi thiết bị |

HTTP 202/PUBLISHED xác nhận backend đã publish lệnh; phản hồi ESP32 được xử lý riêng. Trạng thái trong `/api/devices` chưa phải chỉ báo online. Database có hai bảng nghiệp vụ `sensor_data` và `device_history`. Lọc và phân trang bảng hiện được xử lý tại frontend.

## Kiểm thử backend

Trong thư mục `iot-backend`, dùng Java 21 và chạy ba bộ test không phụ thuộc phần cứng:

```powershell
.\mvnw.cmd "-Dtest=MqttServiceTests,DeviceControllerTests,DashboardApiTests" test
```

Repository không bao gồm báo cáo Word, dữ liệu MySQL, thư mục build hoặc cấu hình đăng nhập trên máy phát triển. Project hiện phục vụ môi trường thử nghiệm local; chưa triển khai đăng nhập và phân quyền API.