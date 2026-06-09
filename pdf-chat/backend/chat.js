const fetch = require("node-fetch");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "GROQ_API_KEY not configured" }) };
  }

  try {
    const body = JSON.parse(event.body);

    // Build messages array (Groq uses OpenAI-compatible format)
    const messages = [];
    if (body.system) {
      messages.push({ role: "system", content: body.system });
    }
    messages.push(...(body.messages || []));

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: body.model || "llama-3.3-70b-versatile",
        messages,
        max_tokens: 1024,
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.7
      })
    });

    const groqData = await response.json();

    if (groqData.error) {
      throw new Error(groqData.error.message || JSON.stringify(groqData.error));
    }

    const text = groqData.choices?.[0]?.message?.content || "";

    // Return in the same format the frontend expects
    const data = {
      content: [{ type: "text", text }]
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    let friendlyMessage = err.message;

    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo') || err.message.includes('network')) {
      friendlyMessage = '📡 No internet connection. Please check your network and try again.';
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
      friendlyMessage = '⏱ Request timed out. The server took too long to respond. Please try again.';
    } else if (err.message.includes('ECONNREFUSED')) {
      friendlyMessage = '🔌 Connection refused. The AI server is unreachable. Please try again later.';
    } else if (err.message.includes('401') || err.message.includes('invalid_api_key') || err.message.includes('Authentication')) {
      friendlyMessage = '🔑 Invalid API key. Please check your GROQ_API_KEY in the .env file.';
    } else if (err.message.includes('429') || err.message.includes('rate_limit') || err.message.includes('Rate limit')) {
      friendlyMessage = '⚡ Rate limit reached (30 req/min). Please wait a moment and try again.';
    } else if (err.message.includes('quota') || err.message.includes('exceeded')) {
      friendlyMessage = '📊 Daily quota exceeded (14,400 req/day). Your limit resets at midnight.';
    } else if (err.message.includes('500') || err.message.includes('Internal Server')) {
      friendlyMessage = '🛠 Groq server error. This is temporary — please try again in a few seconds.';
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: friendlyMessage })
    };
  }
};
