#pragma once

// Copie para config.h antes de compilar. config.h não entra no Git.
// Configuração de demonstração no Wokwi; não são credenciais privadas.
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_SENHA = "";

// Broker público de testes, sem autenticação nem TLS.
const char* MQTT_SERVIDOR = "broker.hivemq.com";
constexpr int MQTT_PORTA = 1883;

// Tópico herdado do protótipo. Altere para um identificador próprio
// e configure o mesmo tópico no cliente que receberá as mensagens.
const char* MQTT_TOPICO = "lixeira/luizh/8c8f694e/peso";
