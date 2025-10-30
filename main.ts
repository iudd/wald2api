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