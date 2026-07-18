/**
 * PROXY DO GEMINI — Cloudflare Worker
 * ---------------------------------------------------------
 * O QUE ISSO FAZ:
 * Este arquivo roda no SERVIDOR da Cloudflare (nunca no navegador
 * do visitante). Ele recebe as mensagens do chat vindas do site,
 * adiciona a SUA API key do Gemini (guardada como "secret", nunca
 * visível a ninguém) e repassa a chamada para a API do Google.
 * O front-end (index.html) nunca vê nem manuseia a key.
 *
 * Assim, todos os visitantes do site usam a MESMA key, sem que
 * ela apareça no código do navegador de ninguém.
 *
 * COMO PUBLICAR (grátis, ~5 minutos):
 *   1) Crie uma conta em https://dash.cloudflare.com (grátis)
 *   2) No menu, vá em "Workers e Pages" → "Criar" → "Worker"
 *   3) Apague o código de exemplo e cole todo este arquivo
 *   4) Clique em "Configurações" → "Variáveis e Secrets"
 *      → adicione uma variável chamada  GEMINI_API_KEY
 *      → cole sua key do Gemini (aistudio.google.com/apikey)
 *      → marque como "Secret" (fica criptografada, ninguém vê)
 *   5) Clique em "Deploy" (implantar)
 *   6) A Cloudflare te dá uma URL, tipo:
 *        https://seu-worker.seunome.workers.dev
 *   7) No index.html, troque PROXY_ENDPOINT (dentro de API_CONFIG)
 *      para essa URL + "/api/chat", exemplo:
 *        PROXY_ENDPOINT: 'https://seu-worker.seunome.workers.dev/api/chat'
 *   8) Pronto — agora NENHUM visitante precisa colar API key.
 *      O campo "API Key do Gemini" na interface vira opcional
 *      (só é usado se alguém quiser usar a própria key).
 *
 * LIMITE DE USO: o plano gratuito da Cloudflare Workers cobre
 * 100.000 requisições/dia — de sobra para um chat de site.
 * O limite real vai ser o da camada gratuita do Gemini em si
 * (~1.500 requisições/dia, compartilhadas entre TODOS os
 * visitantes, já que é uma key só). Se o site crescer muito,
 * seria hora de migrar para um plano pago do Gemini.
 */

export default {
  async fetch(request, env) {
    // Responde o preflight de CORS (necessário para o navegador
    // poder chamar este Worker vindo de outro domínio).
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: { message: 'Método não permitido. Use POST.' } }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: { message: 'GEMINI_API_KEY não configurada nas variáveis/secrets do Worker.' } }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return jsonResponse({ error: { message: 'JSON inválido no corpo da requisição.' } }, 400);
    }

    if (!payload || !Array.isArray(payload.messages)) {
      return jsonResponse({ error: { message: 'Campo "messages" ausente ou inválido.' } }, 400);
    }

    const geminiBody = JSON.stringify({
      model: payload.model || 'gemini-2.5-flash',
      messages: payload.messages
    });

    let upstream;
    try {
      upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.GEMINI_API_KEY
        },
        body: geminiBody
      });
    } catch (err) {
      return jsonResponse({ error: { message: 'Falha ao conectar com o Gemini: ' + err.message } }, 502);
    }

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
