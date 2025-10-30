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