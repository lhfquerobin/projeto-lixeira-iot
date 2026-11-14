// Configuracao publica: o navegador consegue ler tudo neste arquivo.
export const CONFIG = {
  dispositivo: "lixeira-01",
  broker: "wss://broker.hivemq.com:8884/mqtt",
  topico: "lixeira/luizh/8c8f694e/peso", // Mesmo MQTT_TOPICO do ESP32.
  tempoSemDadosMs: 5000,
  pesoMaximoKg: 5, // Faixa do HX711 de 5 kg usado no diagram.json.
  capacidadeKg: 5, // Referencia para 100%; nao mede o volume da lixeira.
  alertaPercentual: 80, // Vermelho somente ACIMA deste valor.
};
