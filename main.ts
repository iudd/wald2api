/**
 * OpenAI 兼容的 Wald.ai API 转换器 (无状态版本)
 * 客户端通过 Bearer token 传递认证信息
 * Deno 版本
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const BASE_URL = "https://app.wald.ai";
const SANITIZE_URL = "https://api-sanitize.wald.ai/sanitize-prompt";
const COMPLETION_URL = "https://app.wald.ai/api/chat";
const ORIGIN = "https://wald.ai";

const TEAM_ID = "f0432dab-b16a-4638-87ac-475cc4dbf535";
const USER_ID = "user_01K8S9HAJ90K73EWTD7P11P7GC";

interface ChatMessage {
  role: string;
  content: string | Array<{ type: string; text: string }>;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
}

interface SanitizeRequest {
  prompt: string;
  sanitizeEngine: string;
  parallelize: boolean;
  teamId: string;
}

interface SanitizeResponse {
  sanitizedPrompt: string;
  // 其他字段...
}

interface CompletionRequest {
  messageId: string;
  prompt: string;
  teamId: string;
  // 其他参数...
}

interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
    logprobs: null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 解密函数 (需要正确的密钥和算法)
async function decryptContent(encryptedData: string, nonce: string, key: string): Promise<string> {
  try {
    // 假设使用AES-GCM
    const keyData = Uint8Array.from(atob(key), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const encrypted = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const nonceData = Uint8Array.from(atob(nonce), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonceData },
      cryptoKey,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('解密失败:', e);
    return '解密失败，请检查密钥和算法';
  }
}

// 调用 sanitize-prompt API
async function callSanitizeApi(prompt: string, authToken: string): Promise<SanitizeResponse> {
  const requestData: SanitizeRequest = {
    prompt,
    sanitizeEngine: "GPT4",
    parallelize: true,
    teamId: TEAM_ID,
  };

  const response = await fetch(SANITIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
      "Origin": ORIGIN,
      "Referer": `${ORIGIN}/`,
    },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    throw new Error(`Sanitize API error: ${response.status}`);
  }

  return await response.json();
}

// 调用 completion API
async function callCompletionApi(sanitizedPrompt: string, authToken: string): Promise<string> {
  const messageId = `msg-${crypto.randomUUID()}`;
  
  const requestData = {
    messageId,
    prompt: sanitizedPrompt,
    teamId: TEAM_ID,
    // 添加其他必要参数
  };

  const response = await fetch(COMPLETION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
      "Origin": ORIGIN,
      "Referer": `${ORIGIN}/`,
      "Cookie": "", // 需要从authToken解析或获取
    },
    body: JSON.stringify(requestData),
  });

  if (!response.ok) {
    throw new Error(`Completion API error: ${response.status}`);
  }

  // 解析SSE流式响应
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // 解析SSE格式
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留不完整的行

    for (const line of lines) {
      if (line.startsWith('0:"') && line.endsWith('"')) {
        // 提取文本内容
        const content = line.slice(3, -1); // 移除 0:" 和 "
        fullContent += content;
      } else if (line.startsWith('e:')) {
        // 结束标记
        break;
      }
    }
  }

  return fullContent;
}

// 处理聊天请求
async function handleChatRequest(prompt: string, authToken: string): Promise<string> {
  // 步骤1: sanitize prompt
  const sanitizeResult = await callSanitizeApi(prompt, authToken);
  const sanitizedPrompt = sanitizeResult.sanitizedPrompt || prompt;
  
  // 步骤2: 调用completion API
  const content = await callCompletionApi(sanitizedPrompt, authToken);
  
  // 步骤3: 如果需要解密，在这里添加
  // const decryptedContent = await decryptContent(content, ...);
  
  return content;
}

// 创建完成响应
function createCompletionResponse(id: string, model: string, content: string): CompletionResponse {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: content.length / 4,
      completion_tokens: content.length / 4,
      total_tokens: content.length / 2,
    },
  };
}

// 路由设置
const router = new Router();

// 聊天接口
router.post("/v1/chat/completions", async (ctx) => {
  const authorization = ctx.request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "需要 Bearer token (Wald.ai auth token)" };
    return;
  }

  const authToken = authorization.slice(7);

  let requestData: ChatRequest;
  try {
    requestData = await ctx.request.body({ type: "json" }).value;
  } catch (e) {
    ctx.response.status = 400;
    ctx.response.body = { error: `无效的 JSON: ${e}` };
    return;
  }

  const model = requestData.model || "wald-gpt4";
  const messages = requestData.messages || [];
  const stream = requestData.stream || false;

  if (!messages || messages.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "messages 不能为空" };
    return;
  }

  // 转换对话
  const conversationParts: string[] = [];
  for (const msg of messages) {
    const role = msg.role || "unknown";
    const content = msg.content || "";
    
    let textContent = "";
    if (Array.isArray(content)) {
      textContent = content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("");
    } else {
      textContent = content;
    }
    
    if (textContent) {
      conversationParts.push(`${role}:\n${textContent}\n\n`);
    }
  }

  const fullPrompt = conversationParts.join("\n\n");

  if (!fullPrompt.trim()) {
    ctx.response.status = 400;
    ctx.response.body = { error: "整合后的消息内容为空" };
    return;
  }

  const requestId = `chatcmpl-${crypto.randomUUID()}`;

  if (stream) {
    ctx.response.status = 501;
    ctx.response.body = { error: "流式响应暂未实现" };
  } else {
    try {
      const content = await handleChatRequest(fullPrompt, authToken);
      ctx.response.body = createCompletionResponse(requestId, model, content);
    } catch (e) {
      ctx.response.status = 500;
      ctx.response.body = { error: `处理请求失败: ${e}` };
    }
  }
});

// 模型列表
router.get("/v1/models", (ctx) => {
  const models = [
    {
      id: "wald-gpt4",
      object: "model",
      created: 1234567890,
      owned_by: "wald",
    },
  ];
  ctx.response.body = { object: "list", data: models };
});

// 健康检查
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    service: "wald-2api",
    version: "2.0.0",
  };
});

// 应用设置
const app = new Application();

// 日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
});

// 错误处理
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("错误:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal Server Error" };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

// 启动服务器
const port = 8000;
console.log(`🚀 Wald.ai 转换器运行在 http://localhost:${port}`);
console.log(`📚 Wald-2API Deno 版本 v2.0.0`);
await app.listen({ port });