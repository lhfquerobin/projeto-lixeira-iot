import { CONFIG } from "./config.js";
import { conectarMQTT } from "./mqtt.js";
import { carregarEstado, registrarLeitura, salvarEstado } from "./armazenamento.js";

const elemento = (id) => document.getElementById(id);
const numero = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const hora = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" });
let conectado = false;
let recebeuNestaConexao = false;
let ultimaRecepcao = null;
let estado = carregarEstado();
let falhaSensor = false;

function atualizarSituacao() {
  const recente = conectado && recebeuNestaConexao && ultimaRecepcao !== null
    && Date.now() - ultimaRecepcao <= CONFIG.tempoSemDadosMs;
  elemento("painel").dataset.ativo = recente;
  elemento("estado-leitura").textContent = recente ? "Recebendo leituras" : "Aguardando dados";
  elemento("descricao-leitura").textContent = recente
    ? "Peso informado pelo sensor da lixeira."
    : ultimaRecepcao === null
      ? "Inicie a simulação no Wokwi para acompanhar o peso."
      : "A última leitura está desatualizada. Confira o dispositivo e a rede.";
  elemento("rotulo-peso").textContent = recente || ultimaRecepcao === null ? "Peso atual" : "Último peso recebido";
  elemento("atualizacao").textContent = ultimaRecepcao === null ? "Nenhuma leitura"
    : `Há ${Math.floor((Date.now() - ultimaRecepcao) / 1000)} s`;
  if (falhaSensor) {
    elemento("estado-leitura").textContent = "Falha no sensor";
    elemento("descricao-leitura").textContent = "O ESP32 informou leitura inválida. O último peso foi preservado.";
  }
}

function mostrarPeso(peso, telemetria) {
  falhaSensor = false;
  elemento("alerta-local").textContent = telemetria.alerta ? "Ligado" : "Desligado";
  recebeuNestaConexao = true;
  const salvou = registrarLeitura(estado, peso);
  ultimaRecepcao = estado.ultimaLeitura.instanteMs;
  elemento("peso").textContent = numero.format(peso);
  elemento("aviso").textContent = salvou ? "" : "O navegador não permitiu salvar os dados. Eles serão mantidos apenas nesta página.";
  mostrarHistorico();
  atualizarSituacao();
}

function mostrarHistorico() {
  elemento("historico-vazio").hidden = estado.leituras.length > 0;
  elemento("tabela").hidden = estado.leituras.length === 0;
  const linhas = estado.leituras.map((leitura) => {
    const linha = document.createElement("tr");
    for (const texto of [hora.format(new Date(leitura.instanteMs)), `${numero.format(leitura.peso)} kg`]) {
      const celula = document.createElement("td");
      celula.textContent = texto;
      linha.append(celula);
    }
    return linha;
  });
  elemento("leituras").replaceChildren(...linhas);
}

function restaurarTela() {
  falhaSensor = false;
  elemento("alerta-local").textContent = "Aguardando atualização";
  estado = carregarEstado();
  ultimaRecepcao = estado.ultimaLeitura?.instanteMs ?? null;
  recebeuNestaConexao = false;
  elemento("peso").textContent = estado.ultimaLeitura ? numero.format(estado.ultimaLeitura.peso) : "—";
  mostrarHistorico();
  atualizarSituacao();
}

function mostrarConexao(estado, detalhe = "") {
  conectado = estado === "conectado";
  // Depois de uma queda, so uma nova mensagem torna a leitura atual novamente.
  if (!conectado) recebeuNestaConexao = false;
  const textos = {
    conectado: "Broker conectado",
    conectando: "Conectando ao broker",
    desconectado: "Broker desconectado",
    erro: "Falha na conexão",
  };
  elemento("conexao").textContent = textos[estado];
  elemento("conexao").dataset.estado = estado;
  elemento("aviso").textContent = detalhe;
  atualizarSituacao();
}

elemento("topico").textContent = CONFIG.topico;
elemento("limpar").addEventListener("click", () => {
  estado.leituras = [];
  elemento("aviso").textContent = salvarEstado(estado) ? "" : "Não foi possível salvar a limpeza do histórico neste navegador.";
  mostrarHistorico();
});

restaurarTela();
globalThis.addEventListener?.("pageshow", (evento) => {
  if (evento.persisted) restaurarTela(); // Botao Voltar do navegador.
});
conectarMQTT({
  aoReceber: mostrarPeso,
  aoMudarEstado: mostrarConexao,
  aoRejeitar: (motivo) => { elemento("aviso").textContent = motivo; },
  aoFalhaSensor() {
    falhaSensor = true;
    recebeuNestaConexao = false;
    elemento("alerta-local").textContent = "Desligado (falha do sensor)";
    atualizarSituacao();
  },
});
setInterval(atualizarSituacao, 1000);
