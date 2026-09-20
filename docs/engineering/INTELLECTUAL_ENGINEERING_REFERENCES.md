# Intellectual & Engineering References of Sails Protocol

Vale a pena relembrar isso porque esses autores não “criaram o Sails”, mas ajudaram a fortalecer áreas fundamentais que o Sails precisava resolver para não virar só mais uma implementação de marketplace P2P.

Os três que você citou já tiveram papéis bem diferentes na evolução do nosso pensamento:

- **John Carvalho** entrou muito forte na parte de soberania, self-custody, credible exit, confiança explícita, open source e coordenação P2P. O aprendizado mais útil para o Sails foi reforçar que a referência prática não pode virar autoridade do protocolo, que o usuário deve conseguir sair, que a infraestrutura precisa ser substituível e que reputação ou integração não podem virar uma nova forma de gatekeeping. Isso conversa diretamente com nossa separação entre reference implementation e protocol truth, além da tese de rail neutrality e independent implementation.
- **Nick Szabo** foi especialmente importante na parte de contratos, verificabilidade, minimização de confiança, autoridade programável e social scalability. A influência dele apareceu muito quando começamos a tratar “autorização verificável” como uma propriedade própria, em vez de confiar no comportamento de uma aplicação ou operador. Isso se conecta muito bem ao nosso kernel de Intent, Authority, Conditions, Evidence e Outcome.
- **Yuri Villas Boas** apareceu mais como provocador intelectual em torno de estruturas econômicas, incentivos, comportamento de mercado e coordenação. No nosso processo ele ajudou a empurrar perguntas que não são meramente técnicas, como: “quem captura valor?”, “qual incentivo existe para cooperar?”, “onde aparece uma autoridade econômica escondida?”, “como evitar que um participante racional explore o sistema?”. Foi importante para a evolução da parte econômica e adversarial do Sails.

| Reference | Area |
|---|---|
| John Carvalho | SOVEREIGNTY / EXIT / P2P |
| Nick Szabo | TRUST MINIMIZATION / CONTRACTS / VERIFIABILITY |
| Yuri Villas Boas | INCENTIVES / ECONOMIC BEHAVIOR / MARKET STRUCTURE |
| Bitcoin / Satoshi engineering philosophy | PROTOCOL CONSERVATISM / MINIMAL CORE |
| Linux / Unix philosophy | OPEN SYSTEMS / SMALL CORE + EXTENSIBLE EDGES |
| Apple | UX COHERENCE / PRODUCT INTEGRATION |
| Tether WDK | COMPOSABLE WALLET INFRASTRUCTURE |
| Pears / HyperDHT / Nostr | P2P TRANSPORT |
| Mostro / RoboSats / HodlHodl | OPEN P2P MARKET DESIGN |

**Mas tem uma distinção que eu gostaria de preservar institucionalmente:**

> **We borrow properties, not personalities.**

Ou seja, não importa se uma pessoa está certa em tudo. A gente extrai aquilo que ela resolveu bem em uma área específica, transforma em uma propriedade ou pergunta testável e confronta com o Sails.

### John Carvalho

credible exit / self custody / explicit trust

↓

**Sails question:**

Can a participant leave without losing identity, history or economic freedom?

### Nick Szabo

verifiable authority / minimized trust

↓

**Sails question:**

Can an independent implementation verify who had authority to authorize this economic transition?

### Yuri Villas Boas

economic incentives / strategic behavior

↓

**Sails question:**

Can a rational operator gain more by withholding liquidity, multiplying nodes or gaming reputation than by cooperating honestly?

Essa transformação de “ideia de autor” em **propriedade testável** é o que realmente fez diferença.

E isso também evita um erro comum: copiar tecnologia ou arquitetura porque alguém admirado usa.

Nossa regra deveria ser:

> **Author → Insight → Property → Adversarial Question → Evidence → Sails Decision**

Não:

> Author → Copy implementation.
