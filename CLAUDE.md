# DadosVR

Rio de Dados: corrida de barquinhos num rio sinuoso pintado num tabuleiro, em VR para o Meta Quest 3
no navegador (WebXR), sem instalar nada. Você está numa varanda de palafita à beira do rio, ao
entardecer, numa mesa com o tabuleiro, uma bandeja de feltro, o copo dos dados e a bacia do
redemoinho. Na sua vez pega os 3 dados do copo, chacoalha na mão e joga na bandeja (física de
verdade: vale a face que ficou para cima), escolhe quais dados usar e decide se para e rema ou se
arrisca jogar de novo. Contra 3 pilotos do computador, cada um com um jeito de arriscar, em 3 rios.
Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/DadosVR/** e apertar "Entrar
em VR" (ainda não publicado). Para atualizar o site: commitar e rodar `python publicar.py DadosVR` na
pasta `C:\claude code`.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8823` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar os dados | Botão lateral (aperto) com a mão até 15 cm do copo (o anel do copo fica verde) | Arrastar a partir do copo |
| Chacoalhar e jogar | Mexer a mão (chacoalho com som e vibração) e soltar o aperto em cima da bandeja: a velocidade da mão vira a do lançamento | Soltar o mouse em cima da bandeja (a velocidade do mouse vira a força); clique parado ou Espaço/Enter: lançamento sorteado |
| Escolher os dados | Apontar o controle para o dado e gatilho (anel verde) | Clicar no dado ou teclas 1, 2, 3 |
| Parar e remar / jogar de novo | Botões do painel atrás do tabuleiro (apontar + gatilho) | Botões do painel (canto de baixo) ou Enter / R |
| Só com as mãos | Pinça no copo pega os dados; soltar a pinça joga; pinça apontando escolhe | |
| Acelerar | | Segurar Shift (×3) |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

No VR o painel de ações fica atrás do tabuleiro, na altura dos olhos, e a placa dos pilotos (casa de
cada um, de quem é a vez) fica à esquerda. O anel branco no tabuleiro mostra onde o barco vai parar
com os dados escolhidos. "Recentralizar" (na pausa) põe você de novo de frente para a mesa.

### Regras

- 4 barcos: você (laranja) e os 3 pilotos. Você joga primeiro. Todos começam na largada.
- **A vez:** joga os dados da mão (3) na bandeja. Cada **1** vai para a bacia do **redemoinho** (marca).
  **Dois 1 na mesma vez = redemoinho:** perde tudo o que juntou na vez e passa a vez.
- Dos dados que não são 1, escolhe **pelo menos um** para usar (soma casas). Depois: **parar e remar** o
  total, ou **jogar de novo** os dados que sobraram na mão (o que já juntou só vale se não der redemoinho).
- **Embalo:** usou os 3 dados? Pode jogar os 3 de novo, **uma vez por vez**, mas o redemoinho já está
  girando (conta como uma marca): qualquer 1 derruba. Usou os 3 de novo: para sozinho.
- O barco anda casa por casa e só a casa onde **para** tem efeito:
  - **Correnteza** (azul com setas): empurra 3 casas para a frente.
  - **Cachoeira** (branca, com espuma): volta ~5 casas, até o remanso (casa comum).
  - **Pedra** (cinza, só nos rios 2 e 3): encalha; a próxima vez começa com 2 dados.
  - **Ponte** (amarela, uma em cada curva em U): se passar ou parar na entrada e os dados usados na vez
    tiverem **3 seguidos** (2-3-4, 3-4-5 ou 4-5-6), atravessa e corta a curva (pula 11 a 14 casas).
  - **Marola:** parou na casa de outro barco, ele volta 1 casa.
- Quem chega ao cais faz a rodada terminar (os outros ainda jogam a vez deles). Colocação: no cais
  primeiro (quem sobrou mais casas além do cais ganha), depois quem ficou mais longe.
- **Rios** (em `js/rules.js`, casas especiais sorteadas com semente fixa, sempre iguais):
  1 **Rio Manso** (79 casas, 3 retas, 9 correntezas, 3 cachoeiras, 2 pontes), 2 **Rio das Pedras**
  (83 casas, 11 pedras, 4 cachoeiras, 5 correntezas), 3 **Rio das Cachoeiras** (97 casas, 4 retas,
  9 cachoeiras, 3 pontes). Chegar em 1º ou 2º libera o próximo rio.
- **Pilotos** (em `js/ai.js`): **Dona Lia** (cautelosa: para cedo, ~25% de redemoinho), **Seu Bento**
  (calculista: faz a conta da esperança 2 lances à frente), **Capitã Faísca** (arrojada: não para
  com menos de 14, ~50% de redemoinho).
- Progresso salvo no navegador (localStorage, chave `dadosvr.v1`): melhor colocação, vitórias e
  corridas por rio, som, FPS e "Rápido" (computador e barcos mais rápidos).

## Como testar

- `node tests/run.js` (ou `npm test`): rios (tamanho, pontes cortando a curva, casas especiais
  separadas e cabendo no tabuleiro), movimento (passo a passo, correnteza, cachoeira, ponte com e sem
  sequência, cais, pedra, marola), a vez (redemoinho com dois 1, não usar 1, pelo menos um dado,
  embalo e o limite de um, encalhado com 2 dados, rodada até o fim e colocação, chance de redemoinho),
  física dos dados (dado deitado fica quieto, quique cada vez mais baixo, **4500 faces com cada uma
  ~1/6** e qui² baixo, nenhum sai da bandeja, todos param), pilotos (não param na cachoeira, param
  quando chegam ao cais, cada um com o seu risco, robô anda mais que a cautelosa, decisão rápida),
  robô correndo 30 corridas em cada rio (todas terminam, 3 a 9 rodadas) e **teste de fumaça do
  `main.js`** num navegador de mentira (`tests/fakedom.js`): o robô joga uma corrida inteira em cada
  rio com os dados de física, passando por jogar, rolar, escolher e remar, e o progresso é salvo.
  Termina com "Tudo certo" (sai com código 1 se algo falhar). Não toca som. Leva uns 15 s.
- No navegador (console): `dev.autoplay = true` faz o robô jogar por você (`dev.autoRestart = true`
  corre de novo sozinho), `dev.advance(20)` avança 20 s na hora, `dev.state()` mostra tela, fase, vez,
  barcos, a vez atual e os dados, `dev.loadLevel(2)` começa no rio 2 (1 a 3), `dev.vrPreview(true)`
  mostra a mesa de onde fica a cabeça no VR (com o painel no lugar do VR), `dev.resetSave()` apaga o
  progresso. `window.dados` tem `race`, `save`, `camera`, `scene`, `renderer`.
- **Só dá para testar no óculos:** pegar os dados com o aperto e a pinça, chacoalhar (vibração e
  som), força do lançamento com a mão, apontar para escolher os dados, posição do painel e da placa,
  conforto e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar e dica do PC |
| `js/rules.js` | Rios (`RIVERS`, `buildRiver`: caminho com retas sinuosas e curvas em U, casas, pontes, casas especiais), `resolveMove`, `hasSequence`, `Race` (a vez, redemoinho, embalo, rodada, colocação), `bustChance`, `rng`. Sem navegador |
| `js/dice.js` | Física dos dados: cubo rígido, contato vértice-plano e vértice-cubo com impulso e atrito, quique, dormir quando para, tapinha em dado torto, `randomToss`, `settle`, `topFace`, `orientationFor`. Sem navegador |
| `js/ai.js` | Pilotos (`PILOTS`) e robô (`ROBOT`): conta da esperança olhando lances à frente, com jeito de arriscar de cada um (`decide`, `playTurnInstant`). Sem navegador |
| `js/main.js` | Liga tudo: render, VR (pegar/chacoalhar/soltar, apontar), mouse/teclado, turnos, animação dos barcos, painel de ações, menus, placa, HUD, `dev` |
| `js/scene.js` | Varanda, céu, rio de fora, mesa, tabuleiro pintado em canvas (rio, casas, ícones), água animada, cachoeiras, pedras, pontes, árvores, cais, bandeja, copo, bacia do redemoinho, barcos, dados |
| `js/ui.js` | Painel 3D em canvas (menus e painel de ações) e placas de texto |
| `js/audio.js` | Sons sintetizados: rio, chacoalho, dados batendo (feltro, madeira, dado), redemoinho, remada, correnteza, cachoeira, ponte, pedra, marola, embalo, fanfarra |
| `js/save.js` | Progresso e opções salvos, rio liberado |
| `tests/run.js`, `tests/fakedom.js` | Testes e o navegador de mentira do teste de fumaça |
| `serve.py` | Servidor local sem cache (porta 8823, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: mesa centrada na origem, tampo em y = 0,76 m, jogador do lado +z olhando para -z.
Tabuleiro (1,14 × 0,74 m) centrado em (0; -0,17); as casas usam x/z do tabuleiro. Bandeja (38 × 27 cm)
em (0; 0,42), copo à direita dela, bacia do redemoinho mais à direita, tábua dos dados usados à
esquerda. A física dos dados usa a bandeja como origem (fundo em y = 0).

## Regras e convenções do projeto

- `rules.js`, `dice.js` e `ai.js` não podem usar navegador nem Three.js: os testes rodam no Node.
- `main.js` roda no teste de fumaça com `globalThis.__DADOSVR_HEADLESS__` (renderizador falso): não
  usar nada do navegador que não esteja em `tests/fakedom.js` sem acrescentar lá.
- Mexeu em regras, rios, física ou IA: rodar `npm test`. Mudou a física dos dados: o teste de justiça
  (qui² e cada face perto de 1/6) tem que continuar passando.
- Testes nunca tocam som.

## Decisões

- **Redemoinho = dois 1 na mesma vez** (somando os lances da vez), e não dois 1 no mesmo lance: no mesmo
  lance quase nunca acontece e não haveria risco de verdade.
- **Embalo só uma vez por vez e já com uma marca:** com embalo à vontade a conta mandava sempre jogar
  de novo e uma vez boa levava o barco de uma ponta à outra (corridas de 1 a 2 rodadas). Assim a vez
  rende ~14 casas, cai no redemoinho de 25% (cautelosa) a 50% (arrojada) e a corrida dura 3 a 5 rodadas.
- Rios com 79 a 97 casas (casas de 4 cm) para caber essa média.
- Ponte é de graça (atravessar não gasta casa) e automática: sempre ajuda.
- Física própria dos dados (sem biblioteca): passo de 1/360 s, 3 iterações de contato, atrito de
  feltro 0,45, quique 0,32 no feltro e 0,45 na madeira. A ordem em que os vértices recebem o impulso
  roda entre permutações fixas: com ordem fixa uma face saía mais que outra.
- O sorteio com semente é sfc32 (com splitmix32): o mulberry32 com sementes pequenas deixava os
  lançamentos do teste puxados para algumas faces.
- Dado que fica torto (encostado) leva um tapinha; se passar de 8 s vale a face mais para cima.
- IA: conta exata da esperança com todas as jogadas possíveis (agrupadas) e memória; Lia olha 1
  lance à frente, Bento e Faísca 2. Chegar ao cais sempre para.
- O computador joga os dados com a mesma física (lançamento sorteado), para ser justo e bonito.
- Painel de ações no VR atrás do tabuleiro, na altura dos olhos (não tampa o rio); no PC no canto de
  baixo à esquerda.
- Porta do servidor local 8823.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: pegar e chacoalhar os dados (raio de 15 cm do copo), força da mão
  (ganho 1, máximo 2,6 m/s), pinça, apontar para escolher, tamanho do painel atrás do tabuleiro,
  vibração e FPS.
- A dificuldade dos pilotos foi calibrada só com IA contra IA.
- Ainda não publicado no site nem listado no `SiteJogos` e na tabela da pasta raiz.
