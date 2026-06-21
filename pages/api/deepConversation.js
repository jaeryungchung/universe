const SYSTEM_PROMPT = `당신은 철학적이고 공감 능력이 뛰어난 거울입니다. 사용자의 깊은 성찰을 돕는 조용하고 따뜻한 조언자입니다.

실존주의 철학의 정신으로 대화합니다:
- 구원보다 동행: 완벽한 해답보다는 함께 생각하는 과정을 중시
- 정답보다 선택: 사용자 자신이 의미를 만들어간다는 점 강조
- 가벼운 위로보다 단단한 인정: 현실을 축소하지 않고 그 안에서 나아갈 힘 제시

이 철학자들의 정신을 반영합니다:
- 키르케고르: 불확실함 속에서도 앞으로 나아가는 존재
- 니체: 자신만의 이유를 다시 세우는 힘
- 사르트르: 지금의 선택이 나를 만들어간다는 책임감
- 카뮈: 부조리 속에서도 살아내는 태도
- 보부아르: 고정된 존재가 아니라 되어가는 존재

응답 방식:
1. 사용자의 말을 깊이 있게 들으면서 핵심을 반영해주기
2. 짧고 담백하게, 마치 DM처럼 전달
3. 판단하지 않고 인정하기
4. 사용자 자신이 답을 찾도록 질문이나 관찰 제시
5. 너무 길지 않게 (2-3문장 정도)

톤: 따뜻하지만 차분한, 지혜롭지만 가깝게, 희망적이지만 현실적으로`;

const STAGE_CONTEXT = {
  1: "사용자가 지금 겪고 있는 구체적인 어려움을 말했습니다. 그 감정과 상황을 깊이 있게 인정하면서, 지금 느끼는 것이 유효함을 반영해주세요.",
  2: "사용자가 문제가 해소된 이상적인 모습을 그렸습니다. 그 비전의 구체성과 희망을 인정하면서, 그것이 정말 그들이 원하는 것인지 부드럽게 확인해주세요.",
  3: "사용자가 장애물을 지적했습니다. 그 장애물의 무게를 인정하면서, 정말 그것만이 방해인지 생각해볼 여지를 남겨주세요.",
  4: "사용자가 해결책을 제시했습니다. 그 아이디어의 창의성과 현실성을 함께 보면서, 실제로 가능한지 함께 생각해보도록 이끌어주세요.",
  5: "사용자가 실행 계획을 제시했습니다. 그 계획의 구체성을 인정하면서, 가장 작은 한 걸음부터 시작할 수 있음을 상기시켜주세요.",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { stage, userInput, previousResponses, question } = req.body;

  if (!userInput || !stage || !question) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set");
    return res.status(500).json({
      error: "서버 설정 오류입니다. 관리자에게 문의하세요.",
    });
  }

  const stageContext = STAGE_CONTEXT[stage] || "";
  const previousContext =
    Object.entries(previousResponses)
      .map(([s, response]) => `[단계 ${s}] ${response}`)
      .join("\n") || "이전 답변 없음";

  const userMessage = `[현재 단계: ${stage}/5]
[질문: ${question}]

[이전 대화 맥락]
${previousContext}

[사용자의 답변]
${userInput}

[당신의 역할]
${stageContext}

깊이 있으면서도 짧고 따뜻하게(2-3문장) 응답해주세요.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.9,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API error:", error);
      return res.status(response.status).json({
        error:
          error.error?.message || "OpenAI API 호출에 실패했습니다.",
      });
    }

    const data = await response.json();
    const reflection = data.choices?.[0]?.message?.content?.trim();

    if (!reflection) {
      return res
        .status(500)
        .json({ error: "OpenAI로부터 응답을 받지 못했습니다." });
    }

    return res.status(200).json({ reflection });
  } catch (error) {
    console.error("Deep conversation API error:", error);
    return res.status(500).json({
      error: "서버 오류가 발생했습니다.",
    });
  }
}
