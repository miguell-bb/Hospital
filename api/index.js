const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const DB_FILE = path.join(__dirname, "db.json");

// Estado das chamadas da TV mantido durante a execução do servidor.
let chamadaAtual = null;
let historicoChamadas = [];

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// =========================
// BANCO DE DADOS
// =========================

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const inicial = {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: []
    };
    writeDB(inicial);
    return inicial;
  }

  const conteudo = fs.readFileSync(DB_FILE, "utf8");
  const db = JSON.parse(conteudo);

  if (!db || typeof db !== "object" || Array.isArray(db)) {
    throw new Error("O formato do db.json é inválido.");
  }

  for (const chave of ["usuarios", "pacientes", "triagens", "consultas"]) {
    if (db[chave] === undefined) {
      db[chave] = [];
    }
    if (!Array.isArray(db[chave])) {
      throw new Error(`A propriedade "${chave}" do db.json precisa ser uma lista.`);
    }
  }

  return db;
}

function writeDB(db) {
  const temporario = DB_FILE + ".tmp";
  fs.writeFileSync(temporario, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(temporario, DB_FILE);
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function erroValidacao(res, mensagem, status = 400) {
  return res.status(status).json({ erro: mensagem });
}

// =========================
// LOGIN
// =========================

app.post("/login", (req, res) => {
  const usuario = texto(req.body?.usuario);
  const senha = typeof req.body?.senha === "string" ? req.body.senha : "";

  if (!usuario || !senha) {
    return erroValidacao(res, "Informe usuário e senha.");
  }

  const db = readDB();
  const encontrado = db.usuarios.find(u => u.usuario === usuario && u.senha === senha);

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
    id: Date.now(),
    nome,
    cpf,
    tipo: texto(req.body?.tipo) || "Particular",
    status: "aguardando_triagem",
    createdAt: new Date().toISOString()
  };

  db.pacientes.push(paciente);
  writeDB(db);

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

  if (!nome) {
    return erroValidacao(res, "Informe o nome do paciente antes de salvar a triagem.");
  }

  const temperaturaInformada = req.body?.temperatura ?? req.body?.temp;
  const temperatura = temperaturaInformada === "" || temperaturaInformada == null ? null : Number(temperaturaInformada);

  let risco = texto(req.body?.risco).toLowerCase();

  if (temperatura !== null && temperatura >= 39) {
    risco = "vermelho";
  } else if (temperatura !== null && temperatura >= 38) {
    risco = "amarelo";
  } else if (!["verde", "amarelo", "vermelho"].includes(risco)) {
    risco = "verde";
  }

  const db = readDB();

  const triagem = {
    id: Date.now(),
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
// =========================

app.get("/lista-medicacoes", (req, res) => {
  return res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

// =========================
// CONSULTA MÉDICA
// =========================

app.post("/consulta", (req, res) => {
  const pacienteNome = texto(req.body?.paciente);
  const diagnostico = texto(req.body?.diagnostico);
  const medicacao = texto(req.body?.medicacao);

  if (!pacienteNome || !diagnostico || !medicacao) {
    return erroValidacao(res, "Informe o paciente, o diagnóstico e a medicação.");
  }

  const db = readDB();

  const consulta = {
    id: Date.now(),
    paciente: pacienteNome,
    diagnostico,
    medicacao,
    obs: texto(req.body?.obs),
    createdAt: new Date().toISOString()
  };

  db.consultas.push(consulta);
  writeDB(db);

  return res.status(201).json({
    mensagem: "Consulta salva com sucesso.",
    consulta
  });
});

// =========================
// MEDICAÇÕES / CONSULTAS
// =========================

app.get("/medicacoes", (req, res) => {
  const db = readDB();
  return res.json(db.consultas);
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
    id: Date.now(),
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
// ARQUIVOS DO FRONTEND E 404
// =========================

app.use(express.static(FRONTEND_DIR));

app.use((req, res) => {
  return res.status(404).json({
    erro: "Rota não encontrada.",
    rota: req.path
  });
});

// =========================
// INICIALIZAÇÃO DO SERVIDOR
// =========================

try {
  readDB();
  app.listen(PORT, () => {
    console.log(`🏥 Sentinela rodando em http://localhost:${PORT}`);
    console.log(`Frontend: ${FRONTEND_DIR}`);
    console.log(`Banco: ${DB_FILE}`);
  });
} catch (erro) {
  console.error("Não foi possível iniciar o servidor:", erro.message);
  process.exit(1);
}

module.exports = app;