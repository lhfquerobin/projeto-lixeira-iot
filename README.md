# Lixeira monitorada por peso

Projeto de Internet das Coisas com ESP32, célula de carga/HX711 e interface web. O LED vermelho acende quando o peso passa de 4 kg, inclusive sem internet. Com rede disponível, o ESP32 publica os dados por MQTT.

**Integrantes:** Luiz Henrique Floriano Querobin, Kauã Ferreira Rocha e Sara Ferreira da Silva.

**Projeto Wokwi:** https://wokwi.com/projects/479428246932679681

**Interface online:** https://lhfquerobin.github.io/projeto-lixeira-iot/

Testamos a versão local e confirmamos o funcionamento da versão compartilhada no Wokwi.

## Componentes e ligações

| Componente | Ligação |
| --- | --- |
| HX711 de 5 kg | DT no GPIO 32, SCK no GPIO 33, VCC no 3V3 e GND no GND do circuito virtual. |
| Botão de tara | GPIO 25 e GND, com pull-up interno. |
| LED vermelho | GPIO 27, resistor de 330 ohms, anodo do LED e catodo no GND. |
| Chave de rede | Terminal 2 no GPIO 26, terminal 1 no GND e terminal 3 aberto. |

A chave à direita habilita a rede; à esquerda, desliga o rádio. Conferimos o fator 420 no modelo virtual, mas ele não substitui a calibração física. Antes de montar hardware real, é necessário conferir a alimentação e a compatibilidade elétrica do HX711.

## Executar no Wokwi web

1. Use um projeto **Arduino ESP32** e copie o programa de `firmware/lixeira_iot/lixeira_iot.ino` para **`sketch.ino`**. Não use `main.c`: o código precisa ser compilado como C++.
2. Adicione o circuito de `diagram.json` e a lista de bibliotecas de `firmware/lixeira_iot/libraries.txt`.
3. Crie `config.h` com o conteúdo de `firmware/lixeira_iot/config.example.h`. O exemplo usa apenas configurações públicas de demonstração.
4. Inicie com carga zero para a tara. Altere o peso no HX711: em 4 kg o LED fica apagado e acima disso acende. O botão do GPIO 25 refaz a tara.
5. Desligue a chave de rede e varie a carga para conferir a atuação local. Depois, religue para retomar o envio MQTT.

## Executar localmente no Windows

Pré-requisitos: Python 3 disponível no terminal e extensão Wokwi instalada e ativada no VS Code.

Na raiz do projeto, compile com:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

O script prepara ferramentas locais, cria a configuração a partir do exemplo quando ela ainda não existe e compila com PlatformIO. A primeira preparação requer internet. Depois, no VS Code, execute **Wokwi: Start Simulator** pela paleta de comandos. Recompile após alterar o firmware.

## Abrir a interface

Na raiz, execute e mantenha o terminal aberto:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory frontend
```

Acesse http://127.0.0.1:8000 e mantenha a simulação em execução. A primeira lixeira recebe dados; as outras duas são inativas. Clique no cartão para abrir os detalhes.

O percentual compara o peso com 5 kg, sem medir o volume ocupado. A página preserva a última leitura e seis registros no navegador. Após 5 s sem atualização, mantém o valor e avisa que está desatualizado. Use sempre o mesmo endereço, porta e navegador para compartilhar os dados entre as páginas.

O receptor MQTT fica separado da apresentação. O firmware também separa a leitura e o LED da tarefa que cuida da rede, para que a reconexão não bloqueie a decisão local.

## Publicar a interface no GitHub Pages

O projeto inclui publicação automática da pasta `frontend` pelo GitHub Actions. No repositório, abra **Settings → Pages** e selecione **GitHub Actions** como origem. Após enviar os arquivos para a branch `main` ou `master`, acompanhe a execução **Publicar frontend no GitHub Pages** na aba **Actions**. A execução também pode ser iniciada manualmente nessa aba.

O endereço do site aparece ao final da publicação e nas configurações do Pages. O workflow publica somente a interface, sem o firmware ou as configurações locais do dispositivo.

O fluxo é **Wokwi → broker MQTT → navegador**. Mantenha a simulação em execução para receber novos dados e use o mesmo tópico nos dois lados. O navegador se conecta por WSS, compatível com o HTTPS do Pages. O histórico salvo pertence a cada navegador e endereço, portanto os dados locais não são transferidos automaticamente para o site publicado.

## Comunicação

- Broker público: `broker.hivemq.com`.
- ESP32: MQTT na porta 1883.
- Navegador: `wss://broker.hivemq.com:8884/mqtt`.
- Tópico: `lixeira/luizh/8c8f694e/peso`, igual no firmware e na interface.
- Publicação aproximadamente a cada segundo, sem retenção e com QoS 0.

Exemplo real que capturamos durante a simulação:

```json
{
  "versao": 1,
  "dispositivo": "lixeira-01",
  "peso_kg": 4.5,
  "capacidade_kg": 5.0,
  "limite_kg": 4.0,
  "alerta": true,
  "leitura_valida": true,
  "tempo_ativo_ms": 197866,
  "sequencia": 189
}
```

Peso, capacidade e limite são expressos em quilogramas. O alerta informa a decisão do ESP32. Em falha de leitura, o peso é nulo, a validade e o alerta são falsos e o LED apaga. Tempo ativo e sequência reiniciam com o dispositivo. O receptor valida o formato, tipos, faixas e coerência do alerta, com limite de 512 bytes.

O Wi-Fi já integra o ESP32 e atende ao acompanhamento dentro da cobertura de um ponto de acesso. Uma mensagem pequena por segundo é suficiente para o peso. O protótipo considera alimentação contínua, sem medições de alcance, consumo ou autonomia.

## Validação e limitações

Testamos cargas de 0, 1,25, 4 e 4,5 kg e conferimos a publicação MQTT e a apresentação na página. Também verificamos a tara por botão, o controle com rádio desligado e o retorno da conexão no circuito virtual. A compilação e os oito testes automatizados do frontend passaram. Ainda precisamos testar a desconexão do sensor, a queda exclusiva do broker e a execução em outra máquina.

O broker não exige autenticação. Terceiros podem ler ou publicar no tópico, e o ESP32 envia sem TLS. O WSS protege apenas navegador-broker. Não use credenciais privadas na configuração pública da página. A regra não usa histerese e pode precisar de filtragem em uma balança física.

## Créditos e uso de IA

Base do circuito e firmware: https://wokwi.com/projects/305569599398609473.

Referência visual: https://www.behance.net/gallery/249142983/Stay-Product-Platform-Redesign.

A interface utiliza MQTT.js 5.16.1, incluída com sua licença MIT. Origem e integridade estão descritas junto à biblioteca.

Usamos ferramentas de IA como apoio ao desenvolvimento, à revisão e à documentação. Verificamos os resultados por meio de compilação, testes e simulação.
