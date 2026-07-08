# Dicionário da Língua Brasileira de Sinais — Protótipo

Protótipo funcional referente à etapa **6. Código em Funcionamento** do trabalho final
da disciplina AMS0002 — Análise e Modelagem de Sistemas.

Implementa as operações essenciais de CRUD sobre o dicionário de sinais, upload de
vídeo/imagem e o fluxo de aprovação de um novo sinal (rascunho → em análise →
aprovado/rejeitado), conforme descrito no relatório entregue em anexo.

## Stack

- **Node.js (apenas biblioteca padrão — `http`, `fs`, `crypto`)**: nenhuma dependência
  externa é necessária, o que garante que o projeto rode em qualquer ambiente com Node
  instalado, sem acesso à internet.
- **Persistência**: arquivo `db.json` (simula o banco de dados para fins de protótipo).
  Em produção, ver seção "Arquitetura" no relatório para a proposta de banco relacional.
- **Frontend**: HTML/CSS/JS puro (`public/index.html`), consumindo a API REST.

## Como executar

```bash
cd backend
node server.js
# Servidor sobe em http://localhost:3000
```

Abra `http://localhost:3000` no navegador para usar a interface, ou consuma a API
diretamente.

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/sinais` | Lista sinais (filtros: `palavra`, `assunto`, `classeGramatical`, `status`) |
| GET | `/api/sinais/:id` | Detalha um sinal |
| POST | `/api/sinais` | Cria um sinal (**inserção**) |
| PUT/PATCH | `/api/sinais/:id` | Atualiza um sinal (**alteração**) |
| DELETE | `/api/sinais/:id` | Remove um sinal (**exclusão**) |
| POST | `/api/sinais/:id/midia` | Upload de vídeo/imagem (multipart/form-data) |
| POST | `/api/sinais/:id/enviar-analise` | Envia sinal para revisão linguística |
| POST | `/api/sinais/:id/aprovar` | Aprova o sinal (requer estar `em_analise`) |
| POST | `/api/sinais/:id/rejeitar` | Rejeita o sinal (requer estar `em_analise`) |
| GET | `/api/usuarios` | Lista usuários/papéis (seed) |

## Modelo de dados de um "sinal"

Contempla todos os campos exigidos no enunciado: palavra, classe gramatical, acepção,
exemplo, assunto, **parâmetros primários** (ponto de articulação, configuração de mão),
**parâmetros secundários** (disposição, orientação, região de contato),
**componentes não manuais**, **classificação do sinal** (uma mão / dois movimentos
diferentes / dois movimentos iguais / movimentos da face), variantes linguísticas
regionais, vídeo/imagem, dados sensíveis (LGPD) e status de aprovação.

## Variação linguística

O campo `variantes` de cada sinal aceita uma lista de objetos
`{ regiao, descricao, videoPath }`, permitindo registrar, por exemplo, o sinal padrão
e as variações usadas no Rio Grande do Sul e no Rio de Janeiro (ver Figura 2 do
enunciado do trabalho).

## LGPD

O campo `dadosSensiveis` marca explicitamente se a mídia do sinal contém imagem/vídeo
de menor de idade e se o consentimento de uso de imagem foi obtido — ver detalhamento
das políticas de consentimento e descarte no relatório, seção 1.5.

## Estrutura de pastas

```
backend/
  server.js        # API REST + servidor de arquivos estáticos
  public/
    index.html      # interface web (formulário + listagem + aprovação)
  uploads/          # vídeos/imagens enviados (criado em tempo de execução)
  db.json           # "banco de dados" em arquivo (criado em tempo de execução)
```

## Atividades realizadas por membro da equipe

> ⚠️ Preencher com os nomes reais da equipe antes da entrega — ver também a seção 4
> do relatório (Desenvolvimento Colaborativo) para o quadro do Trello.

| Membro | Atividades |
|---|---|
| [Nome 1] | Engenharia de requisitos, histórias de usuário |
| [Nome 2] | Modelagem UML (classes, sequência, atividades) |
| [Nome 3] | Backend (API REST, upload, fluxo de aprovação) |
| [Nome 4] | Frontend, documentação, apresentação |
