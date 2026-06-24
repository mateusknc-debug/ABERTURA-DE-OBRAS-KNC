// =====================================================================
// api/ler-cronograma.js  —  Vercel Serverless Function
// KNC Brasil · Abertura de Obra
// Recebe TEXTO livre de cronograma e devolve SOMENTE as etapas
// com início, fim, duração e ordem. Separado de ler-contrato.
// A chave da Anthropic fica neste backend (env), nunca no HTML.
// =====================================================================

export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `Você interpreta cronogramas de obra escritos em texto livre (português do Brasil),
da construtora KNC Brasil. Receberá um texto descrevendo etapas, durações e sequência.
Devolva SOMENTE um objeto JSON válido, sem markdown, sem explicação, neste formato:

{
  "etapas": [
    {"nome":"...", "inicio":"AAAA-MM-DD", "fim":"AAAA-MM-DD", "duracao_dias": 0, "ordem": 1}
  ],
  "observacoes": "texto curto só se houver ambiguidade relevante"
}

REGRAS:
- Interprete durações e sequência (ex.: "demolição 3 dias a partir de 01/07, depois
  alvenaria 5 dias, ao terminar a elétrica 4 dias...").
- Quando houver uma data âncora no texto, calcule inicio e fim de cada etapa a partir
  das durações e da ordem: a etapa seguinte começa quando a anterior termina
  (respeite "depois de", "ao terminar", "em seguida").
- Se NÃO houver nenhuma data no texto, deixe inicio e fim vazios ("") e preencha apenas
  duracao_dias e ordem.
- Use o ano corrente se o texto citar só dia/mês.
- NÃO invente etapas que não estão no texto. Máximo 15 etapas.
- "ordem" é sequencial começando em 1.
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
    if (!texto || !texto.trim()) return res.status(400).json({ error: "Envie o texto do cronograma." });

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
        messages: [{ role: "user", content: "Cronograma:\n\n" + texto.slice(0, 40000) }]
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
    if (!parsed || !Array.isArray(parsed.etapas)) {
      return res.status(500).json({ error: "Resposta da IA não veio em JSON válido", raw: raw.slice(0, 400) });
    }

    return res.status(200).json({ ok: true, dados: parsed });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno", detail: String(e).slice(0, 300) });
  }
}
