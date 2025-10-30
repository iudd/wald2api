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