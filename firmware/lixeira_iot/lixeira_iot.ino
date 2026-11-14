#include <HX711.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <math.h>
#include "config.h"

constexpr int PINO_DT = 32;
constexpr int PINO_SCK = 33;
constexpr int PINO_BOTAO_TARA = 25;
constexpr int PINO_LED = 27;
constexpr int PINO_CHAVE_REDE = 26;
constexpr float CAPACIDADE_KG = 5.0f;
constexpr float LIMITE_KG = 4.0f;
const char* DISPOSITIVO = "lixeira-01";
float fatorCalibracao = 420.0f; // Wokwi 5 kg: 2100 unidades / 5 kg.

HX711 balanca;
WiFiClient conexaoWiFi;
PubSubClient mqtt(conexaoWiFi);
String comandoSerial;

// O loop controla sensor e LED. So a tarefa de rede usa WiFi e MQTT.
// Uma copia protegida impede que a rede leia metade de uma atualizacao.
struct Estado {
  float peso = 0;
  bool leituraValida = false;
  bool alerta = false;
  bool redeAtiva = true;
};
Estado estado;
portMUX_TYPE travaEstado = portMUX_INITIALIZER_UNLOCKED;

Estado copiarEstado() {
  portENTER_CRITICAL(&travaEstado);
  Estado copia = estado;
  portEXIT_CRITICAL(&travaEstado);
  return copia;
}

void atualizarPeso(float peso, bool valido) {
  valido = valido && isfinite(peso) && fabsf(peso) <= CAPACIDADE_KG;
  // R1 e R2: esta decisao nao depende do broker nem do navegador.
  bool alerta = valido && peso > LIMITE_KG;
  digitalWrite(PINO_LED, alerta ? HIGH : LOW);
  portENTER_CRITICAL(&travaEstado);
  estado.peso = peso;
  estado.leituraValida = valido;
  estado.alerta = alerta;
  portEXIT_CRITICAL(&travaEstado);
}

void fazerTara() {
  atualizarPeso(0, false);
  Serial.println("TARA: mantenha a plataforma parada.");
  if (balanca.wait_ready_timeout(1000)) {
    balanca.tare(1);
    Serial.println("TARA: concluida.");
  } else {
    Serial.println("ERRO: HX711 sem resposta na tara.");
  }
}

int ultimaLeituraBotao = HIGH;
int estadoEstavelBotao = HIGH;
unsigned long instanteMudancaBotao = 0;
unsigned long ultimaLeitura = 0;
unsigned long ultimaRespostaSensor = 0;

void verificarBotao() {
  int leitura = digitalRead(PINO_BOTAO_TARA);
  if (leitura != ultimaLeituraBotao) {
    instanteMudancaBotao = millis();
    ultimaLeituraBotao = leitura;
  }
  if (millis() - instanteMudancaBotao >= 50 && leitura != estadoEstavelBotao) {
    estadoEstavelBotao = leitura;
    if (leitura == LOW) fazerTara();
  }
}

void executarComando(String comando) {
  comando.trim();
  if (comando == "t") {
    fazerTara();
  } else if (comando.startsWith("f ")) {
    String texto = comando.substring(2);
    char* fim;
    float fator = strtof(texto.c_str(), &fim);
    if (fim != texto.c_str() && *fim == '\0' && isfinite(fator) && fator != 0) {
      fatorCalibracao = fator;
      balanca.set_scale(fator);
      atualizarPeso(0, false);
      Serial.printf("CALIBRACAO: %.4f\r\n", fator);
    } else {
      Serial.println("ERRO: fator invalido.");
    }
  }
}

void verificarSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (comandoSerial.length()) executarComando(comandoSerial);
      comandoSerial = "";
    } else if (comandoSerial.length() < 64) {
      comandoSerial += c;
    }
  }
}

void lerPeso() {
  if (millis() - ultimaLeitura < 500) return;
  ultimaLeitura = millis();
  if (balanca.is_ready()) {
    ultimaRespostaSensor = millis();
    float peso = roundf(balanca.get_units(1) * 1000.0f) / 1000.0f;
    atualizarPeso(peso, true);
    Estado atual = copiarEstado();
    Serial.printf("LOCAL peso=%.3f kg valido=%d LED=%d rede=%d\r\n", peso, atual.leituraValida, atual.alerta, atual.redeAtiva);
  } else if (millis() - ultimaRespostaSensor >= 1500) {
    atualizarPeso(0, false);
    Serial.println("ERRO: HX711 sem resposta. LED desligado.");
  }
}

void tarefaRede(void*) {
  String cliente = "lixeira-" + String(esp_random(), HEX);
  mqtt.setServer(MQTT_SERVIDOR, MQTT_PORTA);
  mqtt.setSocketTimeout(2);
  mqtt.setBufferSize(512);
  unsigned long ultimaTentativa = 0, ultimoEnvio = 0;
  uint32_t sequencia = 0;
  bool tentou = false, radioLigado = false;

  for (;;) {
    Estado atual = copiarEstado();
    if (!atual.redeAtiva) {
      if (radioLigado) {
        mqtt.disconnect();
        WiFi.disconnect(true);
        radioLigado = false;
        Serial.println("REDE: desligada. Sensor e LED continuam locais.");
      }
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }
    if (!radioLigado) {
      WiFi.mode(WIFI_STA);
      WiFi.setAutoReconnect(true);
      WiFi.begin(WIFI_SSID, WIFI_SENHA, 6);
      radioLigado = true;
      tentou = false;
      Serial.println("REDE: religando.");
    }
    if (WiFi.status() == WL_CONNECTED) {
      if (!mqtt.connected() && (!tentou || millis() - ultimaTentativa >= 5000)) {
        tentou = true;
        ultimaTentativa = millis();
        if (mqtt.connect(cliente.c_str())) Serial.println("MQTT: conectado.");
        else Serial.printf("MQTT: falha %d. A regra local continua.\r\n", mqtt.state());
      }
      if (mqtt.connected()) {
        mqtt.loop();
        if (millis() - ultimoEnvio >= 1000) {
          ultimoEnvio = millis();
          atual = copiarEstado();
          char peso[24];
          if (atual.leituraValida) snprintf(peso, sizeof(peso), "%.3f", atual.peso);
          else snprintf(peso, sizeof(peso), "null");
          char mensagem[320];
          snprintf(mensagem, sizeof(mensagem),
            "{\"versao\":1,\"dispositivo\":\"%s\",\"peso_kg\":%s,\"capacidade_kg\":%.3f,\"limite_kg\":%.3f,\"alerta\":%s,\"leitura_valida\":%s,\"tempo_ativo_ms\":%lu,\"sequencia\":%lu}",
            DISPOSITIVO, peso, CAPACIDADE_KG, LIMITE_KG, atual.alerta ? "true" : "false",
            atual.leituraValida ? "true" : "false", (unsigned long)millis(), (unsigned long)++sequencia);
          // QoS 0 e sem retencao: os dados salvos pelo site tem horario proprio.
          if (mqtt.publish(MQTT_TOPICO, mensagem, false)) Serial.printf("MQTT_TX %s\r\n", mensagem);
          else Serial.println("MQTT: falha de publicacao.");
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_BOTAO_TARA, INPUT_PULLUP);
  pinMode(PINO_LED, OUTPUT);
  pinMode(PINO_CHAVE_REDE, INPUT_PULLUP);
  estado.redeAtiva = digitalRead(PINO_CHAVE_REDE) == HIGH;
  digitalWrite(PINO_LED, LOW);
  balanca.begin(PINO_DT, PINO_SCK);
  pinMode(PINO_DT, INPUT_PULLUP);
  balanca.set_scale(fatorCalibracao);
  Serial.println("LIXEIRA IoT: LED GPIO 27, alerta acima de 4 kg.");
  fazerTara();
  ultimaRespostaSensor = millis();
  if (xTaskCreatePinnedToCore(tarefaRede, "rede", 8192, nullptr, 1, nullptr, 0) != pdPASS) {
    Serial.println("ERRO: tarefa de rede nao criada. Sensor e LED permanecem locais.");
  }
  Serial.println("Comandos: t | f VALOR. Chave GPIO 26: rede OFF/ON.");
}

void loop() {
  // A chave altera apenas o radio; a medicao e o LED continuam funcionando.
  bool redeAtiva = digitalRead(PINO_CHAVE_REDE) == HIGH;
  portENTER_CRITICAL(&travaEstado);
  estado.redeAtiva = redeAtiva;
  portEXIT_CRITICAL(&travaEstado);
  verificarBotao();
  verificarSerial();
  lerPeso();
  delay(1);
}
