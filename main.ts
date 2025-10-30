/**
 * OpenAI 兼容的 Wald.ai API 转换器 (无状态版本)
 * 客户端通过 cookies 传递认证信息
 * Deno 版本
 */

import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const BASE_URL = "https://app.wald.ai";
const SANITIZE_URL = "https://api-sanitize.wald.ai/sanitize-prompt";
const COMPLETION_URL = "https://app.wald.ai/api/chat";
const ORIGIN = "https://wald.ai";

const TEAM_ID = "f0432dab-b16a-4638-87ac-475cc4dbf535";
const USER_ID = "user_01K8S9HAJ90K73EWTD7P11P7GC";

// 从localStorage获取的密钥
const USER_SYMMETRIC_KEY = "b461e34caaaeceb0a11f2b58168c8e817adb7efdb7c5082078fe21e9182e6fe5";
const LOG_PUBLIC_KEY = "3c5f64bb2f93f2fc37452cb39fd64222b372b06c437c6229c0185c7fb6b6677e";
const TEAM_KEY = "670cafc0c657948687171fdd2e3cdda8f0e13538cd02c485216fb2b13c7f0d2d";
const LOG_PRIVATE_KEY = "88ec70b2af219924a79f1117277954ab8ccd8dcb86c28f8c458d6c6cb6cfcf5a";

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

// 十六进制字符串转字节数组
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// 解密函数
async function decryptContent(encryptedData: string, nonce: string): Promise<string> {
  try {
    // 使用userSymmetricKey进行AES-GCM解密
    const keyBytes = hexToBytes(USER_SYMMETRIC_KEY);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // encryptedData可能是十六进制
    const encryptedBytes = hexToBytes(encryptedData);
    const nonceBytes = hexToBytes(nonce);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonceBytes },
      cryptoKey,
      encryptedBytes
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('解密失败:', e);
    // 如果解密失败，返回原始数据（可能是未加密的）
    return encryptedData;
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
      "Cookie": authToken, // 使用完整cookies
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
      "Cookie": authToken, // 使用完整cookies
      "Origin": ORIGIN,
      "Referer": `${ORIGIN}/`,
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
  const encryptedContent = await callCompletionApi(sanitizedPrompt, authToken);

  // 步骤3: 解密响应
  // 注意: 这里需要正确的nonce，暂时使用示例
  const decryptedContent = await decryptContent(encryptedContent, "21c121322f74afd60928a3fb");

  return decryptedContent;
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

// 创建路由
const router = new Router();

// 聊天接口
router.post("/v1/chat/completions", async (ctx) => {
  // 获取认证信息 (现在是cookies)
  const cookieHeader = ctx.request.headers.get("cookie");
  if (!cookieHeader || !cookieHeader.includes("wos-user")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "需要有效的 Wald.ai cookies" };
    return;
  }

  const authToken = cookieHeader; // 直接使用完整cookies

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
    version: "4.0.0",
  };
});

// 创建应用
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
console.log(`📚 Wald-2API Deno 版本 v4.0.0`);
await app.listen({ port });