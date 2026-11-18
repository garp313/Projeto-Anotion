// Emojis do seletor de ícone, por categoria, com palavras em português para a busca.
// Formato de cada linha: "emoji palavra palavra ...". Para qualquer outro emoji, a pessoa pode colar.
const RAW: [string, string][] = [
  ["Trabalho", `
📄 página documento arquivo
📝 nota anotação escrever
📋 prancheta lista checklist
📌 alfinete fixar importante
📎 clipe anexo
📁 pasta
📂 pasta aberta
🗂️ divisórias arquivo organizar
🗃️ caixa arquivo
🗄️ arquivo gaveta
📚 livros estudo biblioteca
📖 livro leitura
📓 caderno
📒 caderno amarelo
📔 caderno decorado
📕 livro vermelho
📗 livro verde
📘 livro azul
📙 livro laranja
🔖 marcador
🏷️ etiqueta tag
💼 maleta trabalho negócio
🗓️ calendário agenda
📅 calendário data
📆 calendário mês
⏰ despertador alarme prazo
⏱️ cronômetro tempo
⌛ ampulheta tempo
🕒 relógio hora
📊 gráfico barras dashboard relatório indicador kpi
📈 gráfico alta crescimento meta
📉 gráfico queda
🧮 ábaco cálculo conta
💰 dinheiro saco financeiro
💵 dinheiro nota dólar
💳 cartão pagamento
🧾 recibo nota fiscal
🏦 banco
📦 caixa pacote entrega logística estoque
📮 caixa correio
📬 caixa postal
✉️ envelope email carta
📧 email e-mail
📨 email recebido
📤 enviar saída
📥 receber entrada
📞 telefone
📱 celular
💻 notebook computador
🖥️ computador desktop
⌨️ teclado
🖨️ impressora
🖱️ mouse
💾 disquete salvar
💿 cd
🔌 tomada plug
🔋 bateria
💡 ideia lâmpada
🔦 lanterna
🔍 lupa buscar pesquisa
🔎 lupa pesquisa
🔒 cadeado segurança privado
🔓 aberto desbloqueado
🔑 chave acesso senha
🗝️ chave antiga
🔨 martelo
🛠️ ferramentas configuração
🔧 chave inglesa manutenção
⚙️ engrenagem configuração processo
🧰 caixa ferramentas
🧲 ímã
🧪 tubo ensaio teste experimento
🔬 microscópio pesquisa
🔭 telescópio
📡 antena satélite
🧭 bússola direção
🗺️ mapa
📏 régua
📐 esquadro
✂️ tesoura
🖊️ caneta
✏️ lápis
🖍️ giz
🖌️ pincel
📢 megafone anúncio
📣 megafone comunicado
🔔 sino notificação aviso
📰 jornal notícia
🗞️ jornal
🎫 ingresso ticket
🏆 troféu vitória conquista
🥇 medalha ouro primeiro
🎖️ medalha
🏅 medalha esporte
`],
  ["Símbolos", `
✅ certo concluído feito
☑️ caixa marcada
✔️ certo
❌ errado cancelado
❎ errado
⭕ círculo
🚫 proibido bloqueado
⛔ proibido entrada
⚠️ atenção alerta aviso
❗ exclamação importante
❓ pergunta dúvida
‼️ urgente
💯 cem perfeito
🔴 vermelho círculo
🟠 laranja círculo
🟡 amarelo círculo
🟢 verde círculo
🔵 azul círculo
🟣 roxo círculo
⚫ preto círculo
⚪ branco círculo
🟥 vermelho quadrado
🟧 laranja quadrado
🟨 amarelo quadrado
🟩 verde quadrado
🟦 azul quadrado
🟪 roxo quadrado
⬛ preto quadrado
⬜ branco quadrado
🔺 triângulo vermelho
🔻 triângulo baixo
🔶 losango laranja
🔷 losango azul
⭐ estrela favorito
🌟 estrela brilho
✨ brilho novo
💫 tontura estrela
❤️ coração amor vermelho
🧡 coração laranja
💛 coração amarelo
💚 coração verde
💙 coração azul
💜 coração roxo
🖤 coração preto
🤍 coração branco
💔 coração partido
➕ mais adicionar
➖ menos
✖️ vezes
➗ dividir
♻️ reciclar
🔁 repetir
🔄 atualizar sincronizar
🔃 recarregar
⬆️ cima
⬇️ baixo
⬅️ esquerda
➡️ direita
↗️ diagonal
🔀 aleatório
▶️ play iniciar
⏸️ pausa
⏹️ parar
⏩ avançar
🆕 novo
🆗 ok
🆙 up
🆓 grátis
ℹ️ informação info
🔗 link corrente
#️⃣ hashtag número
🔢 números
🔤 letras abc
💲 cifrão dinheiro
©️ copyright
®️ registrado
™️ marca
`],
  ["Pessoas", `
😀 sorriso feliz
😃 feliz
😄 rindo
😁 sorriso
😆 gargalhada
😅 suor alívio
😂 chorando rir
🙂 sorriso leve
😉 piscada
😊 feliz corado
😍 apaixonado
🤩 deslumbrado
😎 óculos legal
🤓 nerd
🧐 monóculo analisar
🤔 pensando dúvida
🤨 desconfiado
😐 neutro
😴 dormindo sono
😮 surpreso
😱 assustado
😭 chorando
😡 bravo raiva
🤯 explodindo mente
🥳 festa comemoração
🤝 aperto mão acordo parceria
👍 joinha positivo
👎 negativo
👏 palmas
🙌 celebrar
🙏 obrigado por favor
💪 força
👀 olhos olhar ver
🧠 cérebro mente ideia
👤 pessoa usuário
👥 pessoas equipe time grupo
🧑‍💻 programador desenvolvedor
👨‍💼 executivo negócio
👩‍💼 executiva negócio
🧑‍🏫 professor aula
🧑‍🔧 técnico manutenção
🧑‍🎨 artista design
🧑‍🔬 cientista
🧑‍⚕️ saúde médico
👷 obra construção
🕵️ detetive investigar
🦸 herói
🧙 mago
👶 bebê
`],
  ["Natureza", `
🌱 broto início planta
🌿 erva folha
🍀 trevo sorte
🌳 árvore
🌲 pinheiro
🌴 palmeira
🌵 cacto
🌷 tulipa flor
🌹 rosa flor
🌻 girassol flor
🌸 cerejeira flor
💐 buquê flores
🍁 folha outono
🍂 folhas
🌍 mundo terra global
🌎 mundo américas
🌐 globo internet
🌙 lua noite
☀️ sol dia
⛅ nuvem sol
☁️ nuvem
🌧️ chuva
⛈️ tempestade
❄️ neve frio
🔥 fogo urgente quente
💧 gota água
🌊 onda mar
🌈 arco-íris
⚡ raio energia rápido
🐶 cachorro
🐱 gato
🐭 rato
🐰 coelho
🦊 raposa
🐻 urso
🐼 panda
🐨 coala
🐯 tigre
🦁 leão
🐮 vaca
🐷 porco
🐸 sapo
🐵 macaco
🐔 galinha
🐧 pinguim
🐦 pássaro
🦉 coruja
🦋 borboleta
🐝 abelha
🐞 joaninha bug
🐛 lagarta bug
🐢 tartaruga devagar
🐍 cobra
🐙 polvo
🐬 golfinho
🐳 baleia
🦈 tubarão
🦄 unicórnio
🐉 dragão
`],
  ["Comida", `
🍎 maçã
🍊 laranja
🍋 limão
🍌 banana
🍉 melancia
🍇 uva
🍓 morango
🍒 cereja
🍍 abacaxi
🥑 abacate
🥕 cenoura
🌽 milho
🍞 pão
🧀 queijo
🍔 hambúrguer
🍟 batata frita
🍕 pizza
🌭 cachorro-quente
🌮 taco
🍣 sushi
🍜 lámen
🍝 macarrão
🥗 salada
🍿 pipoca
🍩 rosquinha
🍪 biscoito
🎂 bolo aniversário
🍰 bolo fatia
🍫 chocolate
🍬 bala doce
🍦 sorvete
☕ café
🍵 chá
🧃 suco
🥤 refrigerante
🍺 cerveja
🍷 vinho
🥂 brinde comemoração
🍽️ prato refeição
`],
  ["Viagem", `
🚀 foguete lançamento projeto
✈️ avião viagem
🛫 decolagem
🚗 carro
🚕 táxi
🚌 ônibus
🚚 caminhão entrega logística frete
🚛 carreta logística transporte
🚜 trator
🏍️ moto
🚲 bicicleta
🛴 patinete
🚆 trem
🚇 metrô
🚢 navio
⛵ barco
⚓ âncora porto
🛳️ navio cruzeiro
🚁 helicóptero
🛰️ satélite
🚦 semáforo
🚧 obra em construção
⛽ combustível posto
🏠 casa início home
🏡 casa jardim
🏢 prédio empresa escritório
🏬 loja shopping
🏪 loja conveniência
🏭 fábrica indústria
🏗️ construção
🏥 hospital
🏫 escola
🏛️ governo
⛪ igreja
🏟️ estádio
🗽 estátua
🗼 torre
🏰 castelo
⛺ barraca acampamento
🏖️ praia férias
🏝️ ilha
🏔️ montanha
🌋 vulcão
🗻 monte
🧳 mala viagem
🛒 carrinho compras
🎡 roda gigante
`],
  ["Atividades", `
🎯 alvo meta objetivo
🎨 paleta arte design
🎵 música nota
🎶 música
🎧 fone áudio
🎤 microfone
🎬 cinema vídeo filme
📷 câmera foto
📸 foto flash
🎥 filmadora
📺 tv televisão
🎮 videogame jogo
🕹️ joystick
🎲 dado jogo sorte
🧩 quebra-cabeça peça
♟️ xadrez estratégia
🎭 teatro
🎉 festa confete comemoração
🎊 confete
🎁 presente
🎈 balão
🎄 natal
🎃 abóbora
⚽ futebol bola
🏀 basquete
🏈 futebol americano
⚾ beisebol
🎾 tênis
🏐 vôlei
🏓 pingue-pongue
🥊 boxe
🏋️ academia peso
🚴 ciclismo
🏃 corrida correr
🧘 meditação yoga
⛳ golfe
🎣 pesca
🏁 bandeira chegada fim
🚩 bandeira vermelha
🏳️ bandeira branca
🇧🇷 brasil bandeira
`],
];

export type EmojiCategory = { name: string; items: { e: string; k: string }[] };

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map(([name, text]) => ({
  name,
  items: text.trim().split("\n").map((line) => {
    const [e, ...words] = line.trim().split(" ");
    return { e, k: words.join(" ") };
  }),
}));

export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((c) => c.items);
