import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { InterviewSessionModel, InterviewTurnModel, UserModel } from '../models';
const GITHUB_API_BASE = 'https://api.github.com';

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
    const token = process.env.GITHUB_TOKEN;
    const user = await getOrCreateDefaultUser();
    const shortSha = sha.slice(0, 7);
    const commitResponse = await fetch(`${GITHUB_API_BASE}/repos/${repo}/commits/${sha}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!commitResponse.ok) {
      return res.status(502).json({ success: false, error: { code: 'GITHUB_API_ERROR', message: `Failed to analyze commit: ${commitResponse.status}` } });
    }
    const commitDetail = (await commitResponse.json()) as { files?: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }> };
    const files = (commitDetail.files ?? []).slice(0, 3);
    const fileNames = files.map((f) => f.filename).join(', ');
    const topFile = files[0];
    const patchHint = topFile?.patch ? topFile.patch.split('\n').slice(0, 4).join(' / ') : 'patch unavailable';

    const question = `Commit ${shortSha}에서 [${fileNames || '변경 파일 없음'}] 변경을 선택한 이유와 대안 대비 장단점을 설명해보세요.`;
    const expectedAnswer = `핵심 파일(${topFile?.filename ?? 'n/a'}) 기준으로 문제 맥락, 선택 이유, 대안 비교, 테스트 검증을 포함한 설명`;
    const hint = `가장 큰 변경 파일: ${topFile?.filename ?? 'n/a'} (${topFile?.status ?? 'n/a'}, +${topFile?.additions ?? 0}/-${topFile?.deletions ?? 0}). 패치 단서: ${patchHint}`;
    const conceptTags = ['diff-analysis', 'trade-off', 'design-intent'];

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
