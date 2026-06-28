#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "driver/adc.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_websocket_client.h"
#include "esp_crt_bundle.h"

#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

#include "esp_mac.h"
#include "cJSON.h"

static const char *TAG = "APMIS";
static char device_id[13];

// ─── Pin / timing ─────────────────────────────────────────────────────────────
#define BUTTON_GPIO         GPIO_NUM_16
#define LED_BLE_ADV         GPIO_NUM_21
#define LED_BLE_CONN        GPIO_NUM_19

#define MOISTURE_RAW_DRY    3100
#define MOISTURE_RAW_WET    1400
#define MOISTURE_POLL_MS    10000

// ─── NVS ──────────────────────────────────────────────────────────────────────
#define NVS_WIFI_NS         "wifi"   // ssid + password (keep legacy namespace)
#define NVS_SLOTS_NS        "apmis"  // plant slot config

#define NVS_KEY_SSID        "ssid"
#define NVS_KEY_PASS        "password"

// ─── WiFi ─────────────────────────────────────────────────────────────────────
#define WIFI_CONNECTED_BIT  BIT0
#define WIFI_FAIL_BIT       BIT1

// ─── Plant slots ──────────────────────────────────────────────────────────────
#define MAX_SLOTS    4
#define SLOT_ID_LEN  32

typedef struct {
    char    id[SLOT_ID_LEN];
    uint8_t sensor_gpio;
    uint8_t pump_gpio;
    uint8_t min_moisture;
    uint8_t max_moisture;
    uint8_t auto_water;
    bool    pump_on;
} plant_slot_t;

static plant_slot_t     slots[MAX_SLOTS];
static int              slot_count = 0;
static SemaphoreHandle_t slots_mutex = NULL;

// ─── BLE UUIDs ────────────────────────────────────────────────────────────────
static const ble_uuid128_t gatt_svc_uuid =
    BLE_UUID128_INIT(0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12,
                     0x34, 0x12, 0x34, 0x12, 0x34, 0x12,
                     0x78, 0x56, 0x34, 0x12);

static const ble_uuid128_t gatt_chr_cred_uuid =
    BLE_UUID128_INIT(0xbd, 0x9a, 0x78, 0x56, 0x34, 0x12,
                     0x34, 0x12, 0x34, 0x12, 0x34, 0x12,
                     0x78, 0x56, 0x34, 0x12);

static const ble_uuid128_t gatt_chr_status_uuid =
    BLE_UUID128_INIT(0xbe, 0x9a, 0x78, 0x56, 0x34, 0x12,
                     0x34, 0x12, 0x34, 0x12, 0x34, 0x12,
                     0x78, 0x56, 0x34, 0x12);

static QueueHandle_t button_event_queue = NULL;
static int wifi_retry_count = 0;

static EventGroupHandle_t wifi_event_group;
static uint16_t ble_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t status_chr_val_handle;

static esp_websocket_client_handle_t ws_client = NULL;
static bool ws_connected = false;

// ─── WebSocket TX queue ──────────────────────────────────────────────────────
// All outgoing frames are funneled through this queue and sent by a dedicated
// task. Sending directly from the websocket event callback (e.g. echoing pump
// status while handling a received command) blocks the client's receive task,
// which stalls processing of *incoming* frames — so a follow-up pump_off could
// sit unprocessed until the blocking send finally returned. Decoupling the send
// keeps command handling responsive regardless of transient link jitter.
static QueueHandle_t ws_tx_queue = NULL;

// Tick at which the WS link went down (0 = currently up / never connected).
// Used by the moisture task to fail manual pumps off if the link stays down,
// so a dropped connection can't leave a pump running indefinitely.
#define LINK_FAILSAFE_MS 30000
static TickType_t ws_down_since = 0;

// Takes ownership of the heap-allocated `json` (from cJSON_PrintUnformatted).
static void ws_enqueue_text(char *json) {
    if (!ws_tx_queue || !json) { free(json); return; }
    if (xQueueSend(ws_tx_queue, &json, 0) != pdTRUE) {
        ESP_LOGW(TAG, "WS TX queue full, dropping message");
        free(json);
    }
}

static void ws_tx_task(void *arg) {
    char *json;
    while (1) {
        if (xQueueReceive(ws_tx_queue, &json, portMAX_DELAY)) {
            if (ws_connected) {
                esp_websocket_client_send_text(ws_client, json, strlen(json), portMAX_DELAY);
            }
            free(json);
        }
    }
}

// ─── NVS helpers ─────────────────────────────────────────────────────────────

static esp_err_t nvs_read_str(const char *ns, const char *key, char *out, size_t max_len) {
    nvs_handle_t h;
    esp_err_t err = nvs_open(ns, NVS_READONLY, &h);
    if (err != ESP_OK) return err;
    size_t len = max_len;
    err = nvs_get_str(h, key, out, &len);
    nvs_close(h);
    return err;
}

static esp_err_t nvs_write_str(const char *ns, const char *key, const char *value) {
    nvs_handle_t h;
    esp_err_t err = nvs_open(ns, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    err = nvs_set_str(h, key, value);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    return err;
}

static esp_err_t nvs_read_u8(const char *ns, const char *key, uint8_t *out) {
    nvs_handle_t h;
    esp_err_t err = nvs_open(ns, NVS_READONLY, &h);
    if (err != ESP_OK) return err;
    err = nvs_get_u8(h, key, out);
    nvs_close(h);
    return err;
}

static esp_err_t nvs_write_u8(const char *ns, const char *key, uint8_t value) {
    nvs_handle_t h;
    esp_err_t err = nvs_open(ns, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    err = nvs_set_u8(h, key, value);
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    return err;
}

// ─── Slot NVS save / load ────────────────────────────────────────────────────

static void nvs_save_slots(void) {
    nvs_handle_t h;
    if (nvs_open(NVS_SLOTS_NS, NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_u8(h, "slot_count", (uint8_t)slot_count);
    char key[16];
    for (int i = 0; i < slot_count; i++) {
        snprintf(key, sizeof(key), "s%d_id", i);  nvs_set_str(h, key, slots[i].id);
        snprintf(key, sizeof(key), "s%d_sp", i);  nvs_set_u8(h, key, slots[i].sensor_gpio);
        snprintf(key, sizeof(key), "s%d_pp", i);  nvs_set_u8(h, key, slots[i].pump_gpio);
        snprintf(key, sizeof(key), "s%d_min", i); nvs_set_u8(h, key, slots[i].min_moisture);
        snprintf(key, sizeof(key), "s%d_max", i); nvs_set_u8(h, key, slots[i].max_moisture);
        snprintf(key, sizeof(key), "s%d_aw", i);  nvs_set_u8(h, key, slots[i].auto_water);
    }
    nvs_commit(h);
    nvs_close(h);
    ESP_LOGI(TAG, "Saved %d slots to NVS", slot_count);
}

static void nvs_load_slots(void) {
    nvs_handle_t h;
    if (nvs_open(NVS_SLOTS_NS, NVS_READONLY, &h) != ESP_OK) return;
    uint8_t count = 0;
    if (nvs_get_u8(h, "slot_count", &count) != ESP_OK) { nvs_close(h); return; }
    int n = count > MAX_SLOTS ? MAX_SLOTS : count;
    char key[16];
    for (int i = 0; i < n; i++) {
        snprintf(key, sizeof(key), "s%d_id", i);
        size_t len = SLOT_ID_LEN;
        if (nvs_get_str(h, key, slots[i].id, &len) != ESP_OK) continue;
        snprintf(key, sizeof(key), "s%d_sp", i);  nvs_get_u8(h, key, &slots[i].sensor_gpio);
        snprintf(key, sizeof(key), "s%d_pp", i);  nvs_get_u8(h, key, &slots[i].pump_gpio);
        snprintf(key, sizeof(key), "s%d_min", i); nvs_get_u8(h, key, &slots[i].min_moisture);
        snprintf(key, sizeof(key), "s%d_max", i); nvs_get_u8(h, key, &slots[i].max_moisture);
        snprintf(key, sizeof(key), "s%d_aw", i);  nvs_get_u8(h, key, &slots[i].auto_water);
        slots[i].pump_on = false;
        // Configure pump GPIO as output
        gpio_set_direction((gpio_num_t)slots[i].pump_gpio, GPIO_MODE_OUTPUT);
        gpio_set_level((gpio_num_t)slots[i].pump_gpio, 0);
    }
    slot_count = n;
    nvs_close(h);
    ESP_LOGI(TAG, "Loaded %d slots from NVS", slot_count);
}

// ─── ADC / moisture ──────────────────────────────────────────────────────────

static adc1_channel_t gpio_to_adc1_channel(int gpio) {
    switch (gpio) {
        case 36: return ADC1_CHANNEL_0;
        case 37: return ADC1_CHANNEL_1;
        case 38: return ADC1_CHANNEL_2;
        case 39: return ADC1_CHANNEL_3;
        case 32: return ADC1_CHANNEL_4;
        case 33: return ADC1_CHANNEL_5;
        case 34: return ADC1_CHANNEL_6;
        case 35: return ADC1_CHANNEL_7;
        default: return ADC1_CHANNEL_MAX; // invalid
    }
}

static void moisture_adc_init(void) {
    adc1_config_width(ADC_WIDTH_BIT_12);
}

// Returns 0-100% or -1 if the GPIO is not a valid ADC1 pin.
static int moisture_read_gpio(int gpio) {
    adc1_channel_t ch = gpio_to_adc1_channel(gpio);
    if (ch >= ADC1_CHANNEL_MAX) {
        ESP_LOGW(TAG, "GPIO %d is not a valid ADC1 pin", gpio);
        return -1;
    }
    adc1_config_channel_atten(ch, ADC_ATTEN_DB_11);
    int sum = 0;
    for (int i = 0; i < 8; i++) {
        sum += adc1_get_raw(ch);
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    int raw = sum / 8;
    int pct = (MOISTURE_RAW_DRY - raw) * 100 / (MOISTURE_RAW_DRY - MOISTURE_RAW_WET);
    if (pct < 0)   pct = 0;
    if (pct > 100) pct = 100;
    return pct;
}

// ─── Button ISR + Task ────────────────────────────────────────────────────────

static void IRAM_ATTR button_isr_handler(void *arg) {
    uint32_t gpio_num = (uint32_t)arg;
    xQueueSendFromISR(button_event_queue, &gpio_num, NULL);
}

static void ws_send_pump_status(const char *status, const char *slot_id);

static void button_task(void *arg) {
    uint32_t gpio_num;
    while (1) {
        if (xQueueReceive(button_event_queue, &gpio_num, portMAX_DELAY)) {
            vTaskDelay(pdMS_TO_TICKS(50));
            if (gpio_get_level(BUTTON_GPIO) == 0) {
                // Toggle slot 0 pump if configured, otherwise do nothing
                if (xSemaphoreTake(slots_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
                    if (slot_count > 0) {
                        slots[0].pump_on = !slots[0].pump_on;
                        gpio_set_level((gpio_num_t)slots[0].pump_gpio, slots[0].pump_on ? 1 : 0);
                        const char *status = slots[0].pump_on ? "pump_on" : "pump_off";
                        char sid[SLOT_ID_LEN];
                        strncpy(sid, slots[0].id, sizeof(sid));
                        xSemaphoreGive(slots_mutex);
                        ESP_LOGI(TAG, "Pump %s (button)", status);
                        ws_send_pump_status(status, sid);
                    } else {
                        xSemaphoreGive(slots_mutex);
                    }
                }
                while (gpio_get_level(BUTTON_GPIO) == 0) vTaskDelay(pdMS_TO_TICKS(10));
                vTaskDelay(pdMS_TO_TICKS(50));
                xQueueReset(button_event_queue);
            }
        }
    }
}

// ─── GPIO init ────────────────────────────────────────────────────────────────

static void gpio_init_base(void) {
    gpio_config_t button_conf = {
        .pin_bit_mask  = (1ULL << BUTTON_GPIO),
        .mode          = GPIO_MODE_INPUT,
        .pull_up_en    = GPIO_PULLUP_ENABLE,
        .pull_down_en  = GPIO_PULLDOWN_DISABLE,
        .intr_type     = GPIO_INTR_NEGEDGE,
    };
    gpio_config(&button_conf);

    gpio_config_t led_conf = {
        .pin_bit_mask  = (1ULL << LED_BLE_ADV) | (1ULL << LED_BLE_CONN),
        .mode          = GPIO_MODE_OUTPUT,
        .pull_up_en    = GPIO_PULLUP_DISABLE,
        .pull_down_en  = GPIO_PULLDOWN_DISABLE,
        .intr_type     = GPIO_INTR_DISABLE,
    };
    gpio_config(&led_conf);
    gpio_set_level(LED_BLE_ADV, 0);
    gpio_set_level(LED_BLE_CONN, 0);
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────

static void wifi_event_handler(void *arg, esp_event_base_t base,
                               int32_t event_id, void *event_data) {
    if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (wifi_retry_count < 10) {
            wifi_retry_count++;
            ESP_LOGW(TAG, "WiFi disconnected. Retrying...");
            esp_wifi_connect();
        } else {
            xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
        }
    } else if (base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "WiFi connected — IP: " IPSTR, IP2STR(&event->ip_info.ip));
        wifi_retry_count = 0;
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static bool wifi_connect(const char *ssid, const char *password) {
    wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    esp_event_handler_instance_t inst_any_id, inst_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, &inst_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, &inst_got_ip));
    wifi_config_t wifi_cfg = {0};
    strncpy((char *)wifi_cfg.sta.ssid,     ssid,     sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, password, sizeof(wifi_cfg.sta.password) - 1);
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());
    // Keep the radio fully powered. With the default modem sleep the RF
    // front-end naps between beacons; under the supply/RF disturbance a running
    // pump causes, that makes missed beacons (bcn_timeout) and link drops far
    // more likely. Trading power for link stability is the right call here.
    esp_wifi_set_ps(WIFI_PS_NONE);
    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT, pdFALSE, pdFALSE, pdMS_TO_TICKS(15000));
    if (bits & WIFI_CONNECTED_BIT) return true;
    ESP_LOGE(TAG, "WiFi connection failed");
    return false;
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

static void ws_send_identification(void) {
    if (!ws_connected) return;
    cJSON *msg = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "type", "identify");
    cJSON_AddStringToObject(msg, "role", "esp32");
    cJSON_AddStringToObject(msg, "deviceId", device_id);
    char *s = cJSON_PrintUnformatted(msg);
    cJSON_Delete(msg);
    ws_enqueue_text(s);
}

// status: "pump_on" or "pump_off"; slot_id may be NULL for legacy callers
static void ws_send_pump_status(const char *status, const char *slot_id) {
    if (!ws_connected) return;
    cJSON *msg = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "type", "status_update");
    cJSON_AddStringToObject(msg, "status", status);
    if (slot_id) cJSON_AddStringToObject(msg, "slotId", slot_id);
    char *s = cJSON_PrintUnformatted(msg);
    cJSON_Delete(msg);
    ESP_LOGI(TAG, "WS pump: %s slot=%s", status, slot_id ? slot_id : "none");
    ws_enqueue_text(s);
}

static void ws_send_slot_moisture(const char *slot_id, int pct) {
    if (!ws_connected) return;
    cJSON *msg = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "type", "moisture_update");
    cJSON_AddStringToObject(msg, "slotId", slot_id);
    cJSON_AddNumberToObject(msg, "moisture", pct);
    char *s = cJSON_PrintUnformatted(msg);
    cJSON_Delete(msg);
    ws_enqueue_text(s);
}

// Apply a config array received from the server and persist to NVS.
static void apply_slot_config(cJSON *slots_arr) {
    int n = cJSON_GetArraySize(slots_arr);
    if (n > MAX_SLOTS) n = MAX_SLOTS;

    xSemaphoreTake(slots_mutex, portMAX_DELAY);

    // Turn off all existing pumps before overwriting
    for (int i = 0; i < slot_count; i++) {
        if (slots[i].pump_on) {
            ws_send_pump_status("pump_off", slots[i].id);
        }
        gpio_set_level((gpio_num_t)slots[i].pump_gpio, 0);
    }

    slot_count = n;
    for (int i = 0; i < n; i++) {
        cJSON *s   = cJSON_GetArrayItem(slots_arr, i);
        cJSON *sid = cJSON_GetObjectItem(s, "slotId");
        cJSON *sp  = cJSON_GetObjectItem(s, "sensorPin");
        cJSON *pp  = cJSON_GetObjectItem(s, "pumpPin");
        cJSON *mn  = cJSON_GetObjectItem(s, "minMoisture");
        cJSON *mx  = cJSON_GetObjectItem(s, "maxMoisture");
        cJSON *aw  = cJSON_GetObjectItem(s, "autoWater");

        memset(&slots[i], 0, sizeof(plant_slot_t));
        if (cJSON_IsString(sid)) strncpy(slots[i].id, sid->valuestring, SLOT_ID_LEN - 1);
        if (cJSON_IsNumber(sp))  slots[i].sensor_gpio  = (uint8_t)sp->valueint;
        if (cJSON_IsNumber(pp))  slots[i].pump_gpio    = (uint8_t)pp->valueint;
        if (cJSON_IsNumber(mn))  slots[i].min_moisture = (uint8_t)mn->valueint;
        if (cJSON_IsNumber(mx))  slots[i].max_moisture = (uint8_t)mx->valueint;
        if (cJSON_IsBool(aw))    slots[i].auto_water   = cJSON_IsTrue(aw) ? 1 : 0;
        slots[i].pump_on = false;

        // Configure pump GPIO as output
        gpio_set_direction((gpio_num_t)slots[i].pump_gpio, GPIO_MODE_OUTPUT);
        gpio_set_level((gpio_num_t)slots[i].pump_gpio, 0);

        ESP_LOGI(TAG, "Slot %d: id=%s sensorGPIO=%d pumpGPIO=%d min=%d%% max=%d%% auto=%d",
                 i, slots[i].id, slots[i].sensor_gpio, slots[i].pump_gpio,
                 slots[i].min_moisture, slots[i].max_moisture, slots[i].auto_water);
    }

    nvs_save_slots();
    xSemaphoreGive(slots_mutex);
}

static void ws_event_handler(void *handler_args, esp_event_base_t base,
                              int32_t event_id, void *event_data) {
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    switch (event_id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WS connected");
            ws_connected = true;
            ws_down_since = 0;
            ws_send_identification();
            break;

        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WS disconnected");
            ws_connected = false;
            if (ws_down_since == 0) ws_down_since = xTaskGetTickCount();
            break;

        case WEBSOCKET_EVENT_DATA:
            if (data->op_code != 0x1) break;
            {
                char payload[1024] = {0};
                if (data->data_len >= (int)sizeof(payload)) {
                    ESP_LOGE(TAG, "WS payload too large (%d bytes)", data->data_len);
                    break;
                }
                memcpy(payload, data->data_ptr, data->data_len);

                cJSON *json = cJSON_Parse(payload);
                if (!json) break;

                cJSON *cmd_item = cJSON_GetObjectItem(json, "cmd");
                if (!cJSON_IsString(cmd_item)) { cJSON_Delete(json); break; }
                const char *cmd = cmd_item->valuestring;

                if (strcmp(cmd, "config") == 0) {
                    // Full slot config pushed from server
                    cJSON *arr = cJSON_GetObjectItem(json, "slots");
                    if (cJSON_IsArray(arr)) {
                        apply_slot_config(arr);
                        ESP_LOGI(TAG, "Config applied: %d slots", slot_count);
                    }

                } else if (strcmp(cmd, "pump_on") == 0 || strcmp(cmd, "pump_off") == 0) {
                    bool turn_on = (strcmp(cmd, "pump_on") == 0);
                    cJSON *pp  = cJSON_GetObjectItem(json, "pumpPin");
                    cJSON *sid = cJSON_GetObjectItem(json, "slotId");

                    if (!cJSON_IsNumber(pp)) { cJSON_Delete(json); break; }
                    int pin = pp->valueint;

                    gpio_set_direction((gpio_num_t)pin, GPIO_MODE_OUTPUT);
                    gpio_set_level((gpio_num_t)pin, turn_on ? 1 : 0);

                    // Update matching slot's pump_on state
                    if (cJSON_IsString(sid)) {
                        xSemaphoreTake(slots_mutex, portMAX_DELAY);
                        for (int i = 0; i < slot_count; i++) {
                            if (strcmp(slots[i].id, sid->valuestring) == 0) {
                                slots[i].pump_on = turn_on;
                                break;
                            }
                        }
                        xSemaphoreGive(slots_mutex);
                    }

                    ESP_LOGI(TAG, "Pump %s (WS) pin=%d", turn_on ? "ON" : "OFF", pin);
                    ws_send_pump_status(turn_on ? "pump_on" : "pump_off",
                                        cJSON_IsString(sid) ? sid->valuestring : NULL);

                } else if (strcmp(cmd, "pump_toggle") == 0) {
                    cJSON *pp  = cJSON_GetObjectItem(json, "pumpPin");
                    cJSON *sid = cJSON_GetObjectItem(json, "slotId");
                    if (!cJSON_IsNumber(pp)) { cJSON_Delete(json); break; }
                    int pin = pp->valueint;

                    bool new_state = false;
                    xSemaphoreTake(slots_mutex, portMAX_DELAY);
                    for (int i = 0; i < slot_count; i++) {
                        if (cJSON_IsString(sid) && strcmp(slots[i].id, sid->valuestring) == 0) {
                            slots[i].pump_on = !slots[i].pump_on;
                            new_state = slots[i].pump_on;
                            break;
                        }
                    }
                    xSemaphoreGive(slots_mutex);

                    gpio_set_direction((gpio_num_t)pin, GPIO_MODE_OUTPUT);
                    gpio_set_level((gpio_num_t)pin, new_state ? 1 : 0);
                    ESP_LOGI(TAG, "Pump %s (WS toggle) pin=%d", new_state ? "ON" : "OFF", pin);
                    ws_send_pump_status(new_state ? "pump_on" : "pump_off",
                                        cJSON_IsString(sid) ? sid->valuestring : NULL);
                }

                cJSON_Delete(json);
            }
            break;

        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGE(TAG, "WS error");
            break;
    }
}

static void ws_connect(void) {
    if (ws_client != NULL) {
        ESP_LOGW(TAG, "WS already initialized");
        return;
    }
    if (!ws_tx_queue) {
        ws_tx_queue = xQueueCreate(16, sizeof(char *));
        xTaskCreate(ws_tx_task, "ws_tx", 4096, NULL, 5, NULL);
    }
    esp_websocket_client_config_t config = {
        .uri                 = "wss://apmis-production-f541.up.railway.app/",
        .reconnect_timeout_ms = 5000,
        .network_timeout_ms   = 10000,
        .ping_interval_sec    = 20,
        .crt_bundle_attach    = esp_crt_bundle_attach,
    };
    ESP_LOGI(TAG, "WS connecting to %s", config.uri);
    ws_client = esp_websocket_client_init(&config);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);
    esp_websocket_client_start(ws_client);
}

// ─── Moisture task ────────────────────────────────────────────────────────────

static void moisture_task(void *arg) {
    while (1) {
        if (xSemaphoreTake(slots_mutex, pdMS_TO_TICKS(500)) == pdTRUE) {
            int n = slot_count;
            plant_slot_t local[MAX_SLOTS];
            memcpy(local, slots, n * sizeof(plant_slot_t));
            xSemaphoreGive(slots_mutex);

            for (int i = 0; i < n; i++) {
                int pct = moisture_read_gpio(local[i].sensor_gpio);
                if (pct < 0) continue;

                ESP_LOGI(TAG, "Slot %d (%s): moisture=%d%% min=%d%% max=%d%% auto=%d pump=%d",
                         i, local[i].id, pct,
                         local[i].min_moisture, local[i].max_moisture,
                         local[i].auto_water, local[i].pump_on);

                ws_send_slot_moisture(local[i].id, pct);

                // Failsafe: a manually-controlled pump can only be switched off
                // from the app, so if the link stays down it would otherwise be
                // stranded ON. Shut it off once we're past the grace window.
                if (local[i].pump_on && !local[i].auto_water && ws_down_since != 0 &&
                    (xTaskGetTickCount() - ws_down_since) > pdMS_TO_TICKS(LINK_FAILSAFE_MS)) {
                    gpio_set_level((gpio_num_t)local[i].pump_gpio, 0);
                    xSemaphoreTake(slots_mutex, portMAX_DELAY);
                    slots[i].pump_on = false;
                    xSemaphoreGive(slots_mutex);
                    local[i].pump_on = false;
                    ESP_LOGW(TAG, "Failsafe: pump OFF slot=%s (link down %d s)",
                             local[i].id, LINK_FAILSAFE_MS / 1000);
                    continue;
                }

                if (!local[i].auto_water) continue;

                if (pct < local[i].min_moisture && !local[i].pump_on) {
                    gpio_set_level((gpio_num_t)local[i].pump_gpio, 1);
                    xSemaphoreTake(slots_mutex, portMAX_DELAY);
                    slots[i].pump_on = true;
                    xSemaphoreGive(slots_mutex);
                    local[i].pump_on = true;
                    ESP_LOGI(TAG, "Auto: pump ON slot=%s (%d%% < %d%%)",
                             local[i].id, pct, local[i].min_moisture);
                    ws_send_pump_status("pump_on", local[i].id);

                } else if (pct >= local[i].max_moisture && local[i].pump_on) {
                    gpio_set_level((gpio_num_t)local[i].pump_gpio, 0);
                    xSemaphoreTake(slots_mutex, portMAX_DELAY);
                    slots[i].pump_on = false;
                    xSemaphoreGive(slots_mutex);
                    local[i].pump_on = false;
                    ESP_LOGI(TAG, "Auto: pump OFF slot=%s (%d%% >= %d%%)",
                             local[i].id, pct, local[i].max_moisture);
                    ws_send_pump_status("pump_off", local[i].id);
                }
            }
        }

        vTaskDelay(pdMS_TO_TICKS(MOISTURE_POLL_MS));
    }
}

// ─── BLE provisioning ─────────────────────────────────────────────────────────

static void ble_send_status(const char *json_str) {
    if (ble_conn_handle == BLE_HS_CONN_HANDLE_NONE) return;
    struct os_mbuf *om = ble_hs_mbuf_from_flat(json_str, strlen(json_str));
    ble_gatts_notify_custom(ble_conn_handle, status_chr_val_handle, om);
}

// Reboot a moment after the BLE write callback has returned. Calling
// esp_restart() directly inside the callback tears down the link before the
// GATT stack can send the write-response / status notification, which makes the
// app report a false "device disconnected" error even though the credentials
// were saved. Deferring the restart lets the ACK reach the app first.
static void deferred_restart_task(void *arg) {
    vTaskDelay(pdMS_TO_TICKS(1000));
    ESP_LOGI(TAG, "Restarting to apply WiFi credentials");
    esp_restart();
}

static int gatt_cred_write_cb(uint16_t conn_handle, uint16_t attr_handle,
                               struct ble_gatt_access_ctxt *ctxt, void *arg) {
    char buf[256] = {0};
    uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
    if (len >= sizeof(buf)) len = sizeof(buf) - 1;
    ble_hs_mbuf_to_flat(ctxt->om, buf, len, NULL);
    ESP_LOGI(TAG, "BLE received: %s", buf);
    cJSON *json = cJSON_Parse(buf);
    if (!json) {
        ESP_LOGE(TAG, "Invalid JSON");
        return BLE_ATT_ERR_UNLIKELY;
    }
    cJSON *ssid_item = cJSON_GetObjectItem(json, "ssid");
    cJSON *pass_item = cJSON_GetObjectItem(json, "password");
    if (!cJSON_IsString(ssid_item) || !cJSON_IsString(pass_item)) {
        ESP_LOGE(TAG, "Missing ssid or password");
        cJSON_Delete(json);
        return BLE_ATT_ERR_UNLIKELY;
    }
    nvs_write_str(NVS_WIFI_NS, NVS_KEY_SSID, ssid_item->valuestring);
    nvs_write_str(NVS_WIFI_NS, NVS_KEY_PASS, pass_item->valuestring);
    ESP_LOGI(TAG, "Credentials saved to NVS");
    cJSON_Delete(json);
    ble_send_status("{\"status\":\"ok\"}");
    // Defer the reboot so this callback can return and the BLE stack can
    // acknowledge the write before the connection drops.
    xTaskCreate(deferred_restart_task, "deferred_restart", 2048, NULL, 5, NULL);
    return 0;
}

static int gatt_status_access_cb(uint16_t conn_handle, uint16_t attr_handle,
                                  struct ble_gatt_access_ctxt *ctxt, void *arg) {
    return 0;
}

static const struct ble_gatt_svc_def gatt_services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &gatt_svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid      = &gatt_chr_cred_uuid.u,
                .access_cb = gatt_cred_write_cb,
                .flags     = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
            },
            {
                .uuid       = &gatt_chr_status_uuid.u,
                .access_cb  = gatt_status_access_cb,
                .val_handle = &status_chr_val_handle,
                .flags      = BLE_GATT_CHR_F_NOTIFY,
            },
            { 0 }
        },
    },
    { 0 }
};

static void ble_advertise(void);

static int ble_gap_event_handler(struct ble_gap_event *event, void *arg) {
    switch (event->type) {
        case BLE_GAP_EVENT_CONNECT:
            if (event->connect.status == 0) {
                ble_conn_handle = event->connect.conn_handle;
                gpio_set_level(LED_BLE_ADV, 0);
                gpio_set_level(LED_BLE_CONN, 1);
                ESP_LOGI(TAG, "BLE connected");
            } else {
                ESP_LOGE(TAG, "BLE connection failed");
                ble_advertise();
            }
            break;
        case BLE_GAP_EVENT_DISCONNECT:
            ble_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            gpio_set_level(LED_BLE_CONN, 0);
            ESP_LOGI(TAG, "BLE disconnected, resuming adv");
            ble_advertise();
            break;
        default:
            break;
    }
    return 0;
}

static void ble_advertise(void) {
    struct ble_gap_adv_params adv_params = {0};
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    static char ble_name[20];
    snprintf(ble_name, sizeof(ble_name), "APMIS_%s", device_id);
    fields.name = (uint8_t *)ble_name;
    fields.name_len = strlen(ble_name);
    fields.name_is_complete = 1;
    ble_gap_adv_set_fields(&fields);
    ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER,
                      &adv_params, ble_gap_event_handler, NULL);
    gpio_set_level(LED_BLE_ADV, 1);
    gpio_set_level(LED_BLE_CONN, 0);
    ESP_LOGI(TAG, "BLE advertising as %s", ble_name);
}

static void ble_on_sync(void) { ble_advertise(); }

static void ble_host_task(void *param) {
    nimble_port_run();
    nimble_port_freertos_deinit();
}

static void ble_provisioning_start(void) {
    nimble_port_init();
    ble_svc_gap_init();
    ble_svc_gatt_init();
    ble_gatts_count_cfg(gatt_services);
    ble_gatts_add_svcs(gatt_services);
    char gap_name[20];
    snprintf(gap_name, sizeof(gap_name), "APMIS_%s", device_id);
    ble_svc_gap_device_name_set(gap_name);
    ble_hs_cfg.sync_cb = ble_on_sync;
    nimble_port_freertos_init(ble_host_task);
    ESP_LOGI(TAG, "BLE provisioning started");
}

// ─── app_main ─────────────────────────────────────────────────────────────────

void app_main(void) {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(device_id, sizeof(device_id), "%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    ESP_LOGI(TAG, "Device ID: %s", device_id);

    slots_mutex = xSemaphoreCreateMutex();
    configASSERT(slots_mutex);

    gpio_init_base();
    moisture_adc_init();

    // Load saved slot config from NVS so auto-water works immediately on boot
    nvs_load_slots();

    button_event_queue = xQueueCreate(10, sizeof(uint32_t));
    xTaskCreate(button_task, "button_task", 2048, NULL, 10, NULL);
    gpio_install_isr_service(0);
    gpio_isr_handler_add(BUTTON_GPIO, button_isr_handler, (void *)BUTTON_GPIO);

    bool button_held = (gpio_get_level(BUTTON_GPIO) == 0);

    char ssid[64] = {0};
    char password[64] = {0};
    bool has_creds = (nvs_read_str(NVS_WIFI_NS, NVS_KEY_SSID, ssid, sizeof(ssid)) == ESP_OK &&
                      nvs_read_str(NVS_WIFI_NS, NVS_KEY_PASS, password, sizeof(password)) == ESP_OK &&
                      strlen(ssid) > 0);

    if (!has_creds || button_held) {
        if (button_held) ESP_LOGI(TAG, "Button held — entering BLE provisioning");
        else             ESP_LOGI(TAG, "No saved credentials — entering BLE provisioning");
        ble_provisioning_start();
    } else {
        ESP_LOGI(TAG, "Connecting to WiFi: %s", ssid);
        if (wifi_connect(ssid, password)) {
            ws_connect();
            xTaskCreate(moisture_task, "moisture_task", 4096, NULL, 5, NULL);
        } else {
            ESP_LOGE(TAG, "WiFi failed — entering BLE provisioning");
            ble_provisioning_start();
        }
    }
}
