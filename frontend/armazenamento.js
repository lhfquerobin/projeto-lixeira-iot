import { CONFIG } from "./config.js";

// As duas paginas compartilham esta chave no mesmo endereco do navegador.
export const CHAVE_ARMAZENAMENTO = `lixeira-iot:v1:${CONFIG.broker}:${CONFIG.topico}`;
const vazio = () => ({ ultimaLeitura: null, leituras: [] });

function leituraValida(leitura) {
  return leitura && Number.isFinite(leitura.peso)
    && Math.abs(leitura.peso) <= CONFIG.pesoMaximoKg
    && Number.isFinite(leitura.instanteMs) && leitura.instanteMs > 0
    && leitura.instanteMs <= Date.now();
}

export function carregarEstado() {
  try {
    const estado = JSON.parse(localStorage.getItem(CHAVE_ARMAZENAMENTO));
    if (!estado || !Array.isArray(estado.leituras) || estado.leituras.length > 6
      || !estado.leituras.every(leituraValida)
      || (estado.ultimaLeitura !== null && !leituraValida(estado.ultimaLeitura))
      || (estado.ultimaLeitura === null && estado.leituras.length > 0)) return vazio();
    return estado;
  } catch {
    return vazio(); // Primeiro acesso, dados corrompidos ou armazenamento bloqueado.
  }
}

export function salvarEstado(estado) {
  try {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(estado));
    return true;
  } catch {
    return false; // A interface continua funcionando em memoria.
  }
}

export function registrarLeitura(estado, peso) {
  const leitura = { peso, instanteMs: Date.now() };
  estado.ultimaLeitura = leitura;
  estado.leituras = [leitura, ...estado.leituras].slice(0, 6);
  return salvarEstado(estado);
}
