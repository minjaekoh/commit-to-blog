import { Router } from 'express';

type StartBody = {
  repo?: string;
  sha?: string;
};

export const interviewRouter = Router();

interviewRouter.post('/start', (req, res) => {
  const body = req.body as StartBody;
  if (!body.repo || !body.sha) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'repo and sha are required.' }
    });
  }

  const shortSha = body.sha.slice(0, 7);

  return res.json({
    success: true,
    data: {
      sessionId: `${Date.now()}`,
      question: `Commit ${shortSha}에서 핵심 변경을 선택한 이유를 설명해보세요.`,
      expectedAnswer: '문제 맥락, 대안 비교, 트레이드오프, 테스트 관점을 포함한 설명',
      hint: '변경 전 문제점 -> 선택한 접근 -> 왜 다른 방법보다 나았는지 순서로 답변해보세요.',
      conceptTags: ['trade-off', 'design-intent', 'testing']
    }
  });
});

interviewRouter.post('/:sessionId/answer', (req, res) => {
  const answer = (req.body as { answer?: string }).answer?.trim();
  if (!answer) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'answer is required.' }
    });
  }

  return res.json({
    success: true,
    data: {
      feedback: '핵심 의도 설명은 좋습니다. 대안 비교와 리스크 대응을 더 구체화하세요.',
      score: 75
    }
  });
});

interviewRouter.post('/:sessionId/hint', (_req, res) => {
  return res.json({
    success: true,
    data: {
      hint: '성능/가독성/유지보수성 중 무엇을 우선했는지와 근거를 함께 말해보세요.'
    }
  });
});

interviewRouter.post('/:sessionId/explain', (_req, res) => {
  return res.json({
    success: true,
    data: {
      explanation:
        '좋은 답변은 문제 정의, 선택한 구현, 대안 비교, 부작용과 완화책, 검증 방법까지 포함합니다.'
    }
  });
});

interviewRouter.post('/:sessionId/skip', (_req, res) => {
  return res.json({
    success: true,
    data: {
      mode: 'summary',
      message: '질문을 스킵했습니다. 커밋 요약 모드로 전환합니다.'
    }
  });
});
