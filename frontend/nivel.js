import { CONFIG } from "./config.js";

// Percentual por peso, limitado ao intervalo de preenchimento do icone.
export function calcularPorcentagem(peso) {
  return Math.max(0, Math.min(100, peso / CONFIG.capacidadeKg * 100));
}
