
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const DB_FILE = path.join(__dirname, "db.json");

let chamadaAtual = null;
let historicoChamadas = [];

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// =========================
// BANCO DE DADOS
// =========================

function criarBancoInicial() {
  return {
    usuarios: [],
    pacientes: [],
    triagens: [],
    consultas: [],
    estoque: [],
    historicoEstoque: []
  };
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const inicial = criarBancoInicial();
    writeDB(inicial);
    return inicial;
  }

  const conteudo = fs.readFileSync(DB_FILE, "utf8");
  const db = JSON.parse(conteudo);

  if (!db || typeof db !== "object" || Array.isArray(db)) {
    throw new Error("O formato do db.json é inválido.");
  }

  for (const chave of [
    "usuarios",
    "pacientes",
    "triagens",
    "consultas",
    "estoque",
    "historicoEstoque"
  ]) {
    if (db[chave] === undefined) db[chave] = [];

    if (!Array.isArray(db[chave])) {
      throw new Error(
        `A propriedade "${chave}" do db.json precisa ser uma lista.`
      );
    }
  }

  return db;
}

function writeDB(db) {
  const temporario = `${DB_FILE}.tmp`;

  fs.writeFileSync(
    temporario,
    JSON.stringify(db, null, 2),
    "utf8"
  );

  fs.renameSync(temporario, DB_FILE);
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function erroValidacao(res, mensagem, status = 400) {
  return res.status(status).json({ erro: mensagem });
}

function proximoId(lista) {
  const maiorId = lista.reduce((maior, item) => {
    const id = Number(item.id);
    return Number.isFinite(id) && id > maior ? id : maior;
  }, Date.now());

  return maiorId + 1;
}

// =========================
// LOGIN
// =========================

app.post("/login", (req, res) => {
  const usuario = texto(req.body?.usuario);
  const senha = typeof req.body?.senha === "string"
    ? req.body.senha
    : "";

  if (!usuario || !senha) {
    return erroValidacao(res, "Informe usuário e senha.");
  }

  const db = readDB();

  const encontrado = db.usuarios.find(u =>
    u.usuario === usuario && u.senha === senha
  );

  if (!encontrado) {
    return erroValidacao(res, "Login inválido.", 401);
  }

  return res.json({
    usuario: encontrado.usuario,
    tipo: encontrado.tipo
  });
});

// =========================
// ATENDIMENTO
// =========================

app.post("/atendimento", (req, res) => {
  const nome = texto(req.body?.nome);
  const cpf = texto(req.body?.cpf);

  if (!nome || !cpf) {
    return erroValidacao(res, "Preencha o nome e o CPF do paciente.");
  }

  const db = readDB();

  const paciente = {
    id: proximoId(db.pacientes),
    nome,
    cpf,
    data: texto(req.body?.data),
    sexo: texto(req.body?.sexo),
    nomeMae: texto(req.body?.nomeMae),
    estadoCivil: texto(req.body?.estadoCivil),
    endereco: texto(req.body?.endereco),
    telefone: texto(req.body?.telefone),
    email: texto(req.body?.email),
    contato: texto(req.body?.contato),
    tipo: texto(req.body?.tipo) || "Particular",
    status: "aguardando_triagem",
    createdAt: new Date().toISOString()
  };

  db.pacientes.push(paciente);
  writeDB(db);

  console.log("Paciente cadastrado:", paciente.id);

  return res.status(201).json({
    mensagem: "Paciente cadastrado com sucesso.",
    paciente
  });
});

// =========================
// LISTAR PACIENTES
// =========================

app.get("/pacientes", (req, res) => {
  const db = readDB();
  return res.json(db.pacientes);
});

// =========================
// TRIAGEM
// =========================

app.post("/triagem", (req, res) => {
  const nome = texto(req.body?.nome);
  const sintoma = texto(req.body?.sintoma || req.body?.sintomas);
  const pacienteId = req.body?.pacienteId ?? null;

  if (!nome) {
    return erroValidacao(
      res,
      "Selecione um paciente e informe o nome antes de salvar a triagem."
    );
  }

  const temperaturaInformada = req.body?.temperatura ?? req.body?.temp;

  const temperatura =
    temperaturaInformada === "" || temperaturaInformada == null
      ? null
      : Number(temperaturaInformada);

  if (
    temperatura !== null &&
    (!Number.isFinite(temperatura) || temperatura < 25 || temperatura > 45)
  ) {
    return erroValidacao(res, "Informe uma temperatura válida.");
  }

  let risco = texto(req.body?.risco).toLowerCase();

  const sintomasVermelhos = [
    "infarto",
    "avc",
    "convulsao",
    "hemorragia",
    "falta_ar_grave"
  ];

  const sintomasAmarelos = [
    "febre",
    "vomito",
    "diarreia",
    "falta_ar_moderada"
  ];

  if (
    (temperatura !== null && temperatura >= 39) ||
    sintomasVermelhos.includes(sintoma)
  ) {
    risco = "vermelho";
  } else if (
    (temperatura !== null && temperatura >= 38) ||
    sintomasAmarelos.includes(sintoma)
  ) {
    risco = "amarelo";
  } else if (!["verde", "amarelo", "vermelho"].includes(risco)) {
    risco = "verde";
  }

  const db = readDB();
  let paciente = null;

  if (pacienteId !== null) {
    paciente = db.pacientes.find(
      p => String(p.id) === String(pacienteId)
    );

    if (!paciente) {
      return erroValidacao(res, "Paciente não encontrado.", 404);
    }
  }

  const triagem = {
    id: proximoId(db.triagens),
    pacienteId,
    nome,
    sintoma,
    temperatura,
    alergia: texto(req.body?.alergia),
    observacao: texto(req.body?.observacao),
    risco,
    status: "aguardando_medico",
    createdAt: new Date().toISOString()
  };

  db.triagens.push(triagem);

  if (paciente) {
    paciente.status = "aguardando_medico";
  }

  writeDB(db);

  return res.status(201).json({
    mensagem: "Triagem salva com sucesso.",
    triagem
  });
});

// =========================
// LISTAR TRIAGENS
// =========================

app.get("/triagens", (req, res) => {
  const db = readDB();
  return res.json(db.triagens);
});

// =========================
// LISTA DE MEDICAÇÕES
// AGORA VEM DO ESTOQUE REAL
// =========================

app.get("/lista-medicacoes", (req, res) => {
  const db = readDB();

  const medicamentos = db.estoque
    .filter(item => Number(item.quantidade) > 0)
    .map(item => item.nome);

  return res.json(medicamentos);
});

// =========================
// CONSULTA MÉDICA
// COM BAIXA AUTOMÁTICA
// =========================

app.post("/consulta", (req, res) => {
  const pacienteNome = texto(req.body?.paciente);
  const diagnostico = texto(req.body?.diagnostico);
  const medicacao = texto(req.body?.medicacao);
  const obs = texto(req.body?.obs);
  const triagemId = req.body?.triagemId ?? null;

  if (!pacienteNome || !diagnostico || !medicacao) {
    return erroValidacao(
      res,
      "Informe o paciente, o diagnóstico e a medicação."
    );
  }

  const db = readDB();

  // Impede salvar duas consultas para a mesma triagem.
  if (
    triagemId !== null &&
    db.consultas.some(
      c => String(c.triagemId) === String(triagemId)
    )
  ) {
    return erroValidacao(
      res,
      "Essa triagem já possui uma consulta registrada.",
      409
    );
  }

  // Normaliza nomes para comparar sem diferenças de acentos.
  const normalizar = nome =>
    String(nome).trim().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  // Procura o medicamento no estoque.
  const medicamentoEstoque = db.estoque.find(
    item => normalizar(item.nome) === normalizar(medicacao)
  );

  if (!medicamentoEstoque) {
    return erroValidacao(
      res,
      "Esse medicamento não está cadastrado no almoxarifado.",
      404
    );
  }

  // Verifica se existe quantidade disponível.
  if (Number(medicamentoEstoque.quantidade) < 1) {
    return erroValidacao(
      res,
      `Estoque insuficiente de ${medicamentoEstoque.nome}.`,
      409
    );
  }

  const agora = new Date().toISOString();

  const consulta = {
    id: proximoId(db.consultas),
    triagemId,
    paciente: pacienteNome,
    diagnostico,
    medicacao,
    obs,
    createdAt: agora
  };

  // DESCONTA UMA UNIDADE.
  medicamentoEstoque.quantidade =
    Number(medicamentoEstoque.quantidade) - 1;

  medicamentoEstoque.updatedAt = agora;

  // REGISTRA A RETIRADA NO HISTÓRICO.
  db.historicoEstoque.unshift({
    id: proximoId(db.historicoEstoque),
    tipo: "retirada",
    nome: medicamentoEstoque.nome,
    quantidade: 1,
    unidade: medicamentoEstoque.unidade || "unidades",
    data: agora,
    responsavel: "Médico",
    observacao: `Retirada automática pela consulta de ${pacienteNome}`,
    consultaId: consulta.id
  });

  db.consultas.push(consulta);

  // Atualiza o status da triagem e do paciente.
  if (triagemId !== null) {
    const triagem = db.triagens.find(
      t => String(t.id) === String(triagemId)
    );

    if (triagem) {
      triagem.status = "atendido";

      const paciente = db.pacientes.find(
        p => String(p.id) === String(triagem.pacienteId)
      );

      if (paciente) {
        paciente.status = "atendido";
      }
    }
  }

  // Salva consulta, estoque e histórico juntos.
  writeDB(db);

  return res.status(201).json({
    mensagem: "Consulta salva e estoque atualizado com sucesso.",
    consulta,
    medicamento: medicamentoEstoque
  });
});

// =========================
// CONSULTAS / MEDICAÇÕES
// =========================

app.get("/medicacoes", (req, res) => {
  const db = readDB();
  return res.json(db.consultas);
});

// =========================
// ALMOXARIFADO / ESTOQUE
// =========================

// LISTAR ESTOQUE

app.get("/estoque", (req, res) => {
  const db = readDB();
  return res.json(db.estoque);
});

// HISTÓRICO DE MOVIMENTAÇÕES

app.get("/estoque/historico", (req, res) => {
  const db = readDB();
  return res.json(db.historicoEstoque);
});

// CADASTRAR MEDICAMENTO

app.post("/estoque", (req, res) => {
  const nome = texto(req.body?.nome);
  const unidade = texto(req.body?.unidade) || "unidades";
  const categoria = texto(req.body?.categoria) || "Geral";
  const quantidade = Number(req.body?.quantidade);

  if (!nome) {
    return erroValidacao(res, "Informe o nome do medicamento.");
  }

  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return erroValidacao(
      res,
      "A quantidade deve ser um número inteiro maior que zero."
    );
  }

  const db = readDB();

  const existente = db.estoque.find(
    item => item.nome.toLowerCase() === nome.toLowerCase()
  );

  if (existente) {
    return erroValidacao(
      res,
      "Esse medicamento já existe. Use a opção de repor estoque.",
      409
    );
  }

  const medicamento = {
    id: proximoId(db.estoque),
    nome,
    quantidade,
    unidade,
    categoria,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.estoque.push(medicamento);
  writeDB(db);

  console.log("Medicamento cadastrado:", medicamento.nome);

  return res.status(201).json({
    mensagem: "Entrada registrada com sucesso.",
    medicamento
  });
});

// ATUALIZAR / REPOR ESTOQUE

app.patch("/estoque/:id", (req, res) => {
  const variacao = Number(req.body?.quantidade);

  if (!Number.isInteger(variacao) || variacao === 0) {
    return erroValidacao(
      res,
      "Informe uma quantidade inteira diferente de zero."
    );
  }

  const db = readDB();

  const medicamento = db.estoque.find(
    item => String(item.id) === String(req.params.id)
  );

  if (!medicamento) {
    return erroValidacao(res, "Medicamento não encontrado.", 404);
  }

  const novaQuantidade = Number(medicamento.quantidade) + variacao;

  if (!Number.isInteger(novaQuantidade) || novaQuantidade < 0) {
    return erroValidacao(res, "O estoque não pode ficar negativo.");
  }

  medicamento.quantidade = novaQuantidade;
  medicamento.updatedAt = new Date().toISOString();

  writeDB(db);

  return res.json({
    mensagem: "Estoque atualizado com sucesso.",
    medicamento
  });
});

// REMOVER MEDICAMENTO

app.delete("/estoque/:id", (req, res) => {
  const db = readDB();

  const indice = db.estoque.findIndex(
    item => String(item.id) === String(req.params.id)
  );

  if (indice === -1) {
    return erroValidacao(res, "Medicamento não encontrado.", 404);
  }

  const [medicamento] = db.estoque.splice(indice, 1);
  writeDB(db);

  return res.json({
    mensagem: "Medicamento removido do estoque.",
    medicamento
  });
});

// =========================
// TV - REGISTRAR CHAMADA
// =========================

app.post("/tv/chamar", (req, res) => {
  const paciente = texto(req.body?.paciente);

  if (!paciente) {
    return erroValidacao(res, "Informe o nome do paciente.");
  }

  const chamada = {
    id: proximoId(historicoChamadas),
    paciente,
    localTipo: texto(req.body?.localTipo) || "GUICHÊ",
    localNumero: texto(String(req.body?.localNumero ?? "1")),
    createdAt: new Date().toISOString()
  };

  chamadaAtual = chamada;
  historicoChamadas.unshift(chamada);
  historicoChamadas = historicoChamadas.slice(0, 20);

  return res.status(201).json({
    mensagem: "Chamada enviada para a TV.",
    chamada
  });
});

// =========================
// TV - CONSULTAR CHAMADA
// =========================

app.get("/tv/chamada", (req, res) => {
  return res.json({
    chamada: chamadaAtual,
    historico: historicoChamadas
  });
});

// =========================
// ARQUIVOS DO FRONTEND
// =========================

if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
}

// =========================
// ROTA RAIZ
// =========================

app.get("/", (req, res) => {
  const indexFile = path.join(FRONTEND_DIR, "index.html");

  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  return res.status(404).json({
    erro: "Arquivo index.html não encontrado na pasta frontend."
  });
});

// =========================
// ROTAS NÃO ENCONTRADAS
// =========================

app.use((req, res) => {
  return res.status(404).json({
    erro: "Rota não encontrada.",
    rota: req.path
  });
});

// =========================
// TRATAMENTO GLOBAL DE ERROS
// =========================

app.use((err, req, res, next) => {
  console.error("Erro no servidor:", err);

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      erro: "O JSON enviado é inválido."
    });
  }

  if (err.code === "ENOENT" || err.code === "EACCES") {
    return res.status(500).json({
      erro: "Não foi possível acessar um arquivo do servidor."
    });
  }

  return res.status(500).json({
    erro: "Erro interno no servidor. Confira o terminal."
  });
});

// =========================
// INICIALIZAÇÃO
// =========================

if (require.main === module) {
  try {
    readDB();

    app.listen(PORT, () => {
      console.log(`🏥 Sentinela rodando em http://localhost:${PORT}`);
      console.log(`Frontend: ${FRONTEND_DIR}`);
      console.log(`Banco: ${DB_FILE}`);
    });
  } catch (erro) {
    console.error("Não foi possível iniciar o Sentinela:", erro.message);
    process.exit(1);
  }
}

module.exports = app;
