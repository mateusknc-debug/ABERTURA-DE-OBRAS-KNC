// =====================================================================
// api/ler-contrato.js  —  Vercel Serverless Function
// KNC Brasil · Abertura de Obra  (versão SÓ TEXTO)
// Recebe o texto colado do contrato e devolve JSON estruturado.
// A chave da Anthropic fica NESTE backend (variável de ambiente),
// nunca no HTML. O navegador só conversa com esta function.
// =====================================================================

export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `Você extrai dados de contratos de obra da construtora KNC Brasil.
Receberá o TEXTO de um contrato. Devolva SOMENTE um objeto JSON válido, sem markdown,
sem explicação, exatamente neste formato:

{
  "nome": "nome/objeto da obra (curto)",
  "cliente": "nome do contratante",
  "endereco": "endereço da obra",
  "valor": "valor contratado como aparece (ex.: R$ 38.000,00)",
  "prazo": "prazo de execução (ex.: 45 dias)",
  "inicio": "data de início no formato AAAA-MM-DD, ou vazio",
  "escopo": "resumo do escopo: serviços principais e exclusões",
  "pagamento": "forma de pagamento / medições / parcelas",
  "etapas": ["lista de etapas construtivas inferidas do escopo, em ordem de execução"],
  "materiais": [{"nome":"material","un":"sc|m²|m³|un|kg|m|L","etapa":"a qual etapa pertence"}],
  "confianca": { "campo": "alta|media|baixa" }
}

REGRAS IMPORTANTES:
- Use SOMENTE o que está no contrato. Se um campo não existir, devolva string vazia "".
- NÃO invente valores, datas ou nomes que não estejam no texto.
- "etapas" e "materiais" são as únicas partes inferidas:
  - etapas: a partir do escopo, liste etapas construtivas plausíveis em ordem
    (ex.: mobilização, demolição, hidráulica, elétrica, alvenaria, revestimento,
    pintura, acabamento, limpeza/entrega). Máximo 10 etapas.
  - materiais: liste os materiais prováveis para executar o escopo, com unidade e a
    etapa a que pertencem. NÃO coloque quantidades (o engenheiro define). Máximo 25 itens.
- Em "confianca", marque baixa para qualquer campo que você teve que deduzir.
  Etapas e materiais são sempre dedução — registre confiança realista.
- Responda apenas o JSON, começando com { e terminando com }.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada no Vercel" });

  try {
    const { texto } = req.body || {};
    if (!texto || !texto.trim()) return res.status(400).json({ error: "Envie o texto do contrato." });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: "user", content: "Contrato:\n\n" + texto.slice(0, 60000) }]
      })
    });

    if (!r.ok) {
      const errTxt = await r.text();
      return res.status(502).json({ error: "Falha na API Anthropic", detail: errTxt.slice(0, 400) });
    }

    const data = await r.json();
    let raw = (data.content || []).map(b => b.text || "").join("").trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} }
    }
    if (!parsed) return res.status(500).json({ error: "Resposta da IA não veio em JSON", raw: raw.slice(0, 400) });

    return res.status(200).json({ ok: true, dados: parsed });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno", detail: String(e).slice(0, 300) });
  }
}
