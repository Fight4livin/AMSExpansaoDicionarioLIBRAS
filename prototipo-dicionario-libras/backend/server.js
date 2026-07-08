/**
 * Dicionário de Libras — Protótipo Backend
 * Node.js puro (sem dependências externas) — http + fs
 *
 * Implementa:
 *  - CRUD completo de "sinais" (todos os campos linguísticos exigidos)
 *  - Upload de vídeo (multipart/form-data, parser manual)
 *  - Fluxo de aprovação (rascunho -> em_analise -> aprovado/rejeitado)
 *  - Variação linguística (lista de variantes regionais por sinal)
 *  - Busca por palavra / assunto / classe gramatical
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- "Banco de dados" em arquivo JSON ----------
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const seed = { sinais: [], usuarios: seedUsuarios() };
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function seedUsuarios() {
  return [
    { id: uid(), nome: 'Ana Editora', papel: 'editor' },
    { id: uid(), nome: 'Beto Revisor Surdo', papel: 'revisor_linguistico' },
    { id: uid(), nome: 'Carla Admin', papel: 'administrador' },
  ];
}
function uid() {
  return crypto.randomBytes(6).toString('hex');
}

// ---------- Modelo de "Sinal" (campos exigidos pelo enunciado) ----------
// palavra, classeGramatical, acepcao, exemplo, assunto,
// parametrosPrimarios: { pontoArticulacao, configuracaoMao },
// parametrosSecundarios: { disposicaoMao, orientacaoMao, regiaoContato },
// componentesNaoManuais, classificacaoSinal,
// variantes: [ { regiao, descricao, videoPath } ],
// videoPath, imagemPath,
// status: 'rascunho' | 'em_analise' | 'aprovado' | 'rejeitado'
// origem, dadosSensiveis (LGPD): { contemMenorDeIdade, consentimento }

function validarSinal(body) {
  const erros = [];
  if (!body.palavra || !body.palavra.trim()) erros.push('Campo "palavra" é obrigatório.');
  if (!body.classeGramatical) erros.push('Campo "classeGramatical" é obrigatório.');
  const pontos = ['Cabeça', 'Olhos', 'Peito', 'Cintura', 'Braços', 'Mãos'];
  if (body.parametrosPrimarios && body.parametrosPrimarios.pontoArticulacao &&
      !pontos.includes(body.parametrosPrimarios.pontoArticulacao)) {
    erros.push('pontoArticulacao inválido. Valores aceitos: ' + pontos.join(', '));
  }
  const classificacoes = [
    'uma_mao', 'dois_movimentos_diferentes', 'dois_movimentos_iguais', 'movimentos_face'
  ];
  if (body.classificacaoSinal && !classificacoes.includes(body.classificacaoSinal)) {
    erros.push('classificacaoSinal inválida.');
  }
  return erros;
}

// ---------- Utilidades HTTP ----------
function sendJSON(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBodyJSON(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Parser mínimo de multipart/form-data (sem dependências externas)
function readMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const boundaryBuf = Buffer.from('--' + boundary);
        const parts = [];
        let start = buf.indexOf(boundaryBuf);
        while (start !== -1) {
          let next = buf.indexOf(boundaryBuf, start + boundaryBuf.length);
          if (next === -1) break;
          const part = buf.slice(start + boundaryBuf.length, next);
          parts.push(part);
          start = next;
        }
        const fields = {};
        const files = {};
        for (let part of parts) {
          if (part.slice(0, 2).toString() === '--') continue;
          // Strip leading CRLF
          let p = part;
          if (p.slice(0, 2).toString() === '\r\n') p = p.slice(2);
          const headerEnd = p.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const headerStr = p.slice(0, headerEnd).toString('utf-8');
          let content = p.slice(headerEnd + 4);
          // remove trailing CRLF
          if (content.slice(-2).toString() === '\r\n') content = content.slice(0, -2);

          const nameMatch = headerStr.match(/name="([^"]+)"/);
          const filenameMatch = headerStr.match(/filename="([^"]*)"/);
          const name = nameMatch ? nameMatch[1] : null;
          if (!name) continue;

          if (filenameMatch && filenameMatch[1]) {
            files[name] = { filename: filenameMatch[1], data: content };
          } else {
            fields[name] = content.toString('utf-8');
          }
        }
        resolve({ fields, files });
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveUpload(req, res, pathname) {
  const filePath = path.join(UPLOADS_DIR, path.basename(pathname));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
                     '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- Servidor ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  try {
    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    // Static frontend
    if (method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/uploads/')) {
      return serveStatic(req, res, pathname);
    }
    if (method === 'GET' && pathname.startsWith('/uploads/')) {
      return serveUpload(req, res, pathname);
    }

    // ---- API: listar / buscar sinais ----
    if (method === 'GET' && pathname === '/api/sinais') {
      const db = loadDB();
      let resultado = db.sinais;
      const { palavra, assunto, classeGramatical, status } = parsed.query;
      if (palavra) resultado = resultado.filter(s => s.palavra.toLowerCase().includes(String(palavra).toLowerCase()));
      if (assunto) resultado = resultado.filter(s => (s.assunto || '').toLowerCase().includes(String(assunto).toLowerCase()));
      if (classeGramatical) resultado = resultado.filter(s => s.classeGramatical === classeGramatical);
      if (status) resultado = resultado.filter(s => s.status === status);
      return sendJSON(res, 200, resultado);
    }

    // ---- API: obter 1 sinal ----
    const matchOne = pathname.match(/^\/api\/sinais\/([a-f0-9]+)$/);
    if (method === 'GET' && matchOne) {
      const db = loadDB();
      const sinal = db.sinais.find(s => s.id === matchOne[1]);
      if (!sinal) return sendJSON(res, 404, { erro: 'Sinal não encontrado' });
      return sendJSON(res, 200, sinal);
    }

    // ---- API: criar sinal (inserção) ----
    if (method === 'POST' && pathname === '/api/sinais') {
      const body = await readBodyJSON(req);
      const erros = validarSinal(body);
      if (erros.length) return sendJSON(res, 400, { erros });
      const db = loadDB();
      const novo = {
        id: uid(),
        palavra: body.palavra.trim(),
        classeGramatical: body.classeGramatical,
        acepcao: body.acepcao || '',
        exemplo: body.exemplo || '',
        exemploLibras: body.exemploLibras || '',
        assunto: body.assunto || '',
        parametrosPrimarios: body.parametrosPrimarios || { pontoArticulacao: '', configuracaoMao: '' },
        parametrosSecundarios: body.parametrosSecundarios || { disposicaoMao: '', orientacaoMao: '', regiaoContato: '' },
        componentesNaoManuais: body.componentesNaoManuais || '',
        classificacaoSinal: body.classificacaoSinal || 'uma_mao',
        variantes: body.variantes || [],
        origem: body.origem || 'nacional',
        videoPath: null,
        imagemPath: null,
        dadosSensiveis: body.dadosSensiveis || { contemMenorDeIdade: false, consentimentoObtido: false },
        status: 'rascunho',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        historicoAprovacao: [{ evento: 'criado', data: new Date().toISOString() }],
      };
      db.sinais.push(novo);
      saveDB(db);
      return sendJSON(res, 201, novo);
    }

    // ---- API: atualizar sinal (alteração) ----
    if ((method === 'PUT' || method === 'PATCH') && matchOne) {
      const body = await readBodyJSON(req);
      const db = loadDB();
      const idx = db.sinais.findIndex(s => s.id === matchOne[1]);
      if (idx === -1) return sendJSON(res, 404, { erro: 'Sinal não encontrado' });
      const atual = db.sinais[idx];
      const atualizado = { ...atual, ...body, id: atual.id, atualizadoEm: new Date().toISOString() };
      const erros = validarSinal(atualizado);
      if (erros.length) return sendJSON(res, 400, { erros });
      db.sinais[idx] = atualizado;
      saveDB(db);
      return sendJSON(res, 200, atualizado);
    }

    // ---- API: excluir sinal ----
    if (method === 'DELETE' && matchOne) {
      const db = loadDB();
      const idx = db.sinais.findIndex(s => s.id === matchOne[1]);
      if (idx === -1) return sendJSON(res, 404, { erro: 'Sinal não encontrado' });
      const removido = db.sinais.splice(idx, 1)[0];
      saveDB(db);
      return sendJSON(res, 200, { removido: true, sinal: removido });
    }

    // ---- API: upload de vídeo/imagem do sinal ----
    const matchUpload = pathname.match(/^\/api\/sinais\/([a-f0-9]+)\/midia$/);
    if (method === 'POST' && matchUpload) {
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      if (!boundaryMatch) return sendJSON(res, 400, { erro: 'Content-Type multipart/form-data com boundary é obrigatório.' });
      const { files } = await readMultipart(req, boundaryMatch[1]);
      const db = loadDB();
      const idx = db.sinais.findIndex(s => s.id === matchUpload[1]);
      if (idx === -1) return sendJSON(res, 404, { erro: 'Sinal não encontrado' });

      const saved = {};
      for (const field of ['video', 'imagem']) {
        if (files[field]) {
          const ext = path.extname(files[field].filename) || '.bin';
          const filename = `${matchUpload[1]}_${field}_${Date.now()}${ext}`;
          fs.writeFileSync(path.join(UPLOADS_DIR, filename), files[field].data);
          saved[field] = `/uploads/${filename}`;
        }
      }
      if (saved.video) db.sinais[idx].videoPath = saved.video;
      if (saved.imagem) db.sinais[idx].imagemPath = saved.imagem;
      db.sinais[idx].atualizadoEm = new Date().toISOString();
      saveDB(db);
      return sendJSON(res, 200, db.sinais[idx]);
    }

    // ---- API: fluxo de aprovação ----
    const matchAprovacao = pathname.match(/^\/api\/sinais\/([a-f0-9]+)\/(enviar-analise|aprovar|rejeitar)$/);
    if (method === 'POST' && matchAprovacao) {
      const [, id, acao] = matchAprovacao;
      const body = await readBodyJSON(req).catch(() => ({}));
      const db = loadDB();
      const idx = db.sinais.findIndex(s => s.id === id);
      if (idx === -1) return sendJSON(res, 404, { erro: 'Sinal não encontrado' });
      const sinal = db.sinais[idx];

      const transicoes = {
        'enviar-analise': { de: ['rascunho', 'rejeitado'], para: 'em_analise' },
        'aprovar': { de: ['em_analise'], para: 'aprovado' },
        'rejeitar': { de: ['em_analise'], para: 'rejeitado' },
      };
      const t = transicoes[acao];
      if (!t.de.includes(sinal.status)) {
        return sendJSON(res, 409, { erro: `Transição inválida: sinal está em "${sinal.status}", ação exige um dos estados ${t.de.join(', ')}.` });
      }
      if (acao === 'enviar-analise' && !sinal.videoPath) {
        return sendJSON(res, 422, { erro: 'É necessário anexar vídeo do sinal antes de enviar para análise.' });
      }
      sinal.status = t.para;
      sinal.historicoAprovacao.push({
        evento: acao, data: new Date().toISOString(), revisor: body.revisor || null, comentario: body.comentario || null,
      });
      sinal.atualizadoEm = new Date().toISOString();
      saveDB(db);
      return sendJSON(res, 200, sinal);
    }

    // ---- API: usuários (para o seletor de revisor no fluxo de aprovação) ----
    if (method === 'GET' && pathname === '/api/usuarios') {
      const db = loadDB();
      return sendJSON(res, 200, db.usuarios);
    }

    sendJSON(res, 404, { erro: 'Rota não encontrada' });
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { erro: 'Erro interno', detalhe: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`Dicionário de Libras — protótipo rodando em http://localhost:${PORT}`);
});
