import { CONFIG } from "./config.js";
import { conectarMQTT } from "./mqtt.js";
import { calcularPorcentagem } from "./nivel.js";
import { carregarEstado, registrarLeitura } from "./armazenamento.js";

const elemento = (id) => document.getElementById(id);
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
let conectado = false;
let ultimoPeso = null;
let ultimaRecepcao = null;
let estado = carregarEstado();
let falhaSensor = false;

function atualizarLixeira() {
  const recente = conectado && ultimaRecepcao !== null
    && Date.now() - ultimaRecepcao <= CONFIG.tempoSemDadosMs;
  const porcentagem = ultimoPeso === null ? null : calcularPorcentagem(ultimoPeso);
  const alerta = porcentagem !== null && porcentagem > CONFIG.alertaPercentual;
  elemento("lixeira-01").dataset.recente = recente;
  elemento("lixeira-01").dataset.conhecido = ultimoPeso !== null;
  elemento("lixeira-01").dataset.alerta = alerta;
  elemento("porcentagem").textContent = porcentagem === null ? "—" : numero.format(porcentagem);
  // O corpo desenhado no SVG tem 105 unidades de altura.
  const altura = (porcentagem ?? 0) / 100 * 105;
  elemento("nivel-lixeira").setAttribute("height", altura);
  elemento("nivel-lixeira").setAttribute("y", 145 - altura);
  elemento("estado-cartao").textContent = ultimoPeso === null ? "Aguardando dados"
    : alerta ? `Acima de ${CONFIG.alertaPercentual}%${recente ? "" : " · Sem atualização"}`
    : recente ? "Recebendo dados" : "Sem atualização";
  if (falhaSensor) elemento("estado-cartao").textContent = "Falha no sensor · último valor salvo";
}

function restaurarTela() {
  estado = carregarEstado();
  ultimoPeso = estado.ultimaLeitura?.peso ?? null;
  ultimaRecepcao = null; // Exibe o valor salvo, aguardando telemetria nova.
  atualizarLixeira();
}
restaurarTela();
globalThis.addEventListener?.("pageshow", (evento) => {
  if (evento.persisted) restaurarTela();
});
conectarMQTT({
  aoReceber(peso) {
    falhaSensor = false;
    ultimoPeso = peso;
    const salvou = registrarLeitura(estado, peso);
    ultimaRecepcao = estado.ultimaLeitura.instanteMs;
    elemento("aviso").textContent = salvou ? "" : "O navegador não permitiu salvar os dados. Eles serão mantidos apenas nesta página.";
    atualizarLixeira();
  },
  aoMudarEstado(estado, detalhe = "") {
    conectado = estado === "conectado";
    if (!conectado) ultimaRecepcao = null;
    elemento("aviso").textContent = detalhe;
    atualizarLixeira();
  },
  aoRejeitar(motivo) { elemento("aviso").textContent = motivo; },
  aoFalhaSensor() {
    falhaSensor = true;
    ultimaRecepcao = null;
    atualizarLixeira();
  },
});
atualizarLixeira();
setInterval(atualizarLixeira, 1000);
