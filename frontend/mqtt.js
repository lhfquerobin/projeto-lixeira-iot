import { CONFIG } from "./config.js";

// Valida o contrato JSON v1 antes de entregar os dados para a tela.
export function interpretarMensagem(texto) {
  try {
    const m = JSON.parse(texto);
    if (!m || m.versao !== 1 || m.dispositivo !== CONFIG.dispositivo
      || m.capacidade_kg !== CONFIG.capacidadeKg
      || m.limite_kg !== CONFIG.capacidadeKg * CONFIG.alertaPercentual / 100
      || typeof m.alerta !== "boolean" || typeof m.leitura_valida !== "boolean"
      || !Number.isInteger(m.tempo_ativo_ms) || m.tempo_ativo_ms < 0 || m.tempo_ativo_ms > 0xffffffff
      || !Number.isInteger(m.sequencia) || m.sequencia < 0 || m.sequencia > 0xffffffff) return null;
    if (m.leitura_valida) {
      if (!Number.isFinite(m.peso_kg) || Math.abs(m.peso_kg) > CONFIG.pesoMaximoKg
        || m.alerta !== (m.peso_kg > m.limite_kg)) return null;
    } else if (m.peso_kg !== null || m.alerta !== false) return null;
    return m;
  } catch {
    return null;
  }
}

// Este arquivo cuida apenas de MQTT. Nao acessa HTML nem altera a tela.
export function conectarMQTT({ aoReceber, aoMudarEstado, aoRejeitar, aoFalhaSensor }) {
  if (!globalThis.mqtt) {
    aoMudarEstado("erro", "Não foi possível carregar a biblioteca MQTT.");
    return;
  }

  aoMudarEstado("conectando");
  const cliente = globalThis.mqtt.connect(CONFIG.broker, {
    clientId: "painel-" + crypto.randomUUID(),
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    resubscribe: false, // Assinamos explicitamente em cada evento connect.
  });

  let inscrito = false;

  // 1. Quando conectar, assina o mesmo topico do ESP32.
  cliente.on("connect", () => {
    cliente.subscribe(CONFIG.topico, { qos: 0 }, (erro, permissoes) => {
      if (erro || !permissoes?.length || permissoes.some((p) => p.qos === 128)) {
        aoMudarEstado("erro", "O broker não autorizou a assinatura do tópico.");
        return;
      }
      inscrito = true;
      aoMudarEstado("conectado");
    });
  });

  // 2. Entrega peso e estado local, ou avisa falha do sensor.
  cliente.on("message", (topico, mensagem, pacote) => {
    if (!inscrito || topico !== CONFIG.topico) return;
    if (pacote?.retain) {
      aoRejeitar("Mensagem retida ignorada; aguardando uma nova leitura.");
      return;
    }
    if (mensagem.length > 512) {
      aoRejeitar("Mensagem muito longa; esperado JSON de até 512 bytes.");
      return;
    }
    const dados = interpretarMensagem(mensagem.toString());
    if (dados === null) {
      aoRejeitar("Mensagem inválida: confira o JSON v1 e a configuração do dispositivo.");
      return;
    }
    if (!dados.leitura_valida) {
      aoFalhaSensor?.();
      return;
    }
    aoReceber(dados.peso_kg, dados);
  });

  // 3. A biblioteca reconecta automaticamente; avisamos a interface.
  cliente.on("reconnect", () => {
    inscrito = false;
    aoMudarEstado("conectando");
  });
  cliente.on("close", () => {
    inscrito = false;
    aoMudarEstado("desconectado");
  });
  cliente.on("error", () => {
    inscrito = false;
    aoMudarEstado("erro", "Falha de conexão. Tentando novamente automaticamente.");
  });

  return cliente;
}
