import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { InterviewSessionModel, InterviewTurnModel, UserModel } from '../models';

const startBodySchema = z.object({
  repo: z.string().min(1),
  sha: z.string().min(7),
});

const answerBodySchema = z.object({
  answer: z.string().min(1).max(5000),
});

const DEFAULT_USER = {
  githubUserId: 'local-dev-user',
  username: 'local-dev-user',
};

export const interviewRouter = Router();

async function getOrCreateDefaultUser() {
  const existing = await UserModel.findOne({ githubUserId: DEFAULT_USER.githubUserId });
  if (existing) return existing;
  return UserModel.create(DEFAULT_USER);
}

interviewRouter.post('/start', async (req, res) => {
  try {
    const parsed = startBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid input' } });
    }

    const { repo, sha } = parsed.data;
    const user = await getOrCreateDefaultUser();
    const shortSha = sha.slice(0, 7);

    const question = `Commit ${shortSha}에서 핵심 변경을 선택한 이유를 설명해보세요.`;
    const expectedAnswer = '문제 맥락, 대안 비교, 트레이드오프, 테스트 관점을 포함한 설명';
    const hint = '변경 전 문제점 -> 선택한 접근 -> 왜 다른 방법보다 나았는지 순서로 답변해보세요.';
    const conceptTags = ['trade-off', 'design-intent', 'testing'];

    const session = await InterviewSessionModel.create({
      userId: user._id,
      repoFullName: repo,
      commitSha: sha,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    });

    await InterviewTurnModel.create({
      sessionId: session._id,
      turnIndex: 1,
      question,
      expectedAnswer,
      hint,
      actionType: 'QUESTION',
      conceptTags,
    });

    return res.json({ success: true, data: { sessionId: String(session._id), question, expectedAnswer, hint, conceptTags } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/answer', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    }

    const parsed = answerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid input' } });
    }

    const turn = await InterviewTurnModel.findOne({ sessionId, turnIndex: 1 });
    if (!turn) {
      return res.status(404).json({ success: false, error: { code: 'TURN_NOT_FOUND', message: 'Interview turn not found.' } });
    }

    const feedback = '핵심 의도 설명은 좋습니다. 대안 비교와 리스크 대응을 더 구체화하세요.';
    turn.userAnswer = parsed.data.answer.trim();
    turn.feedback = feedback;
    turn.actionType = 'ANSWER';
    await turn.save();
    await InterviewSessionModel.findByIdAndUpdate(sessionId, { status: 'ANSWERED' });

    return res.json({ success: true, data: { feedback, score: 75 } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/hint', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    }

    const hint = '성능/가독성/유지보수성 중 무엇을 우선했는지와 근거를 함께 말해보세요.';
    await InterviewTurnModel.findOneAndUpdate({ sessionId, turnIndex: 1 }, { actionType: 'HINT', hint });
    return res.json({ success: true, data: { hint } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/explain', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    }

    const explanation = '좋은 답변은 문제 정의, 선택한 구현, 대안 비교, 부작용과 완화책, 검증 방법까지 포함합니다.';
    await InterviewTurnModel.findOneAndUpdate({ sessionId, turnIndex: 1 }, { actionType: 'EXPLAIN', feedback: explanation });
    await InterviewSessionModel.findByIdAndUpdate(sessionId, { status: 'EXPLAINED' });
    return res.json({ success: true, data: { explanation } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/skip', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    }

    await InterviewTurnModel.findOneAndUpdate({ sessionId, turnIndex: 1 }, { actionType: 'SKIP' });
    await InterviewSessionModel.findByIdAndUpdate(sessionId, { status: 'SKIPPED', completedAt: new Date() });
    return res.json({ success: true, data: { mode: 'summary', message: '질문을 스킵했습니다. 커밋 요약 모드로 전환합니다.' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});
