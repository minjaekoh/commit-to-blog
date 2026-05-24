import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { InterviewSessionModel, InterviewTurnModel, UserModel } from '../models';

const GITHUB_API_BASE = 'https://api.github.com';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

const startBodySchema = z.object({ repo: z.string().min(1), sha: z.string().min(7) });
const answerBodySchema = z.object({ answer: z.string().min(1).max(5000) });
const explainBodySchema = z.object({
  changeSummary: z.string().min(1).max(4000).optional(),
});

const geminiStartSchema = z.object({
  question: z.string().min(1),
  expectedAnswer: z.string().min(1),
  hint: z.string().min(1),
  conceptTags: z.array(z.string()).min(1),
});

const geminiExplainSchema = z.object({
  explanation: z.string().min(1),
  generatedDraft: z.string().min(1),
});

const DEFAULT_USER = { githubUserId: 'local-dev-user', username: 'local-dev-user' };

type CommitFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };
type CommitDetail = { commit?: { message?: string }; files?: CommitFile[] };

export const interviewRouter = Router();

async function getOrCreateDefaultUser() {
  const existing = await UserModel.findOne({ githubUserId: DEFAULT_USER.githubUserId });
  if (existing) return existing;
  return UserModel.create(DEFAULT_USER);
}

async function fetchCommitDetail(repo: string, sha: string, token?: string) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/commits/${sha}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as CommitDetail;
}

async function callGeminiJSON(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const response = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function buildFallbackStart(shortSha: string, files: CommitFile[]) {
  const summary = `${files.length} files changed: ${files.slice(0, 3).map((f) => f.filename).join(', ')}`;
  return {
    question: `Q1. Commit ${shortSha}에서 무엇이 바뀌었는지 기능 관점으로 요약해보세요.\nQ2. 이 변경이 사용자 흐름/상태에 미치는 영향과 테스트 방법을 설명해보세요. (${summary})`,
    expectedAnswer: '변경 내용, 영향 범위, 리스크, 테스트 시나리오를 포함한 설명',
    hint: '파일 나열보다 사용자 시나리오가 어떻게 바뀌는지 먼저 설명해보세요.',
    conceptTags: ['change-summary', 'design-intent', 'verification'],
  };
}

function buildFallbackExplain(repo: string, sha: string, commitMessage: string, files: CommitFile[]) {
  const fileSummary = files.slice(0, 5).map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join('\n');
  return {
    explanation: '문제 정의 -> 변경 내용 -> 영향 -> 검증 순으로 설명하면 이해가 쉬워집니다.',
    generatedDraft: `# TIL: ${repo} ${sha.slice(0, 7)} 해설\n\n## 커밋 요약\n${commitMessage || '- 메시지 없음'}\n\n## 변경 파일\n${fileSummary || '- 파일 없음'}\n\n## 무엇이 바뀌었나\n- 변경된 기능/구조를 사용자 흐름 기준으로 요약합니다.\n- 핵심 로직 분기와 데이터 흐름 변화를 정리합니다.\n\n## 왜 바꿨나\n- 기존 방식의 한계(가독성/유지보수/확장성)를 설명합니다.\n- 선택한 구현과 대안의 트레이드오프를 비교합니다.\n\n## 검증 방법\n- 정상 흐름: 대표 입력에서 기대 결과가 나오는지 확인합니다.\n- 예외 흐름: 실패/경계 조건에서 안전하게 처리되는지 확인합니다.\n- 회귀 확인: 기존 동작이 깨지지 않았는지 관련 기능을 점검합니다.\n\n## 배운 점\n- 설계 의도를 코드 구조로 드러내는 방식의 중요성을 배웠습니다.\n- 구현 전 검증 시나리오를 먼저 정의하면 품질 확보가 쉬워집니다.`,
  };
}

function hasMinimumContent(draft: string) {
  const requiredHeadings = ['## 무엇이 바뀌었나', '## 왜 바꿨나', '## 검증 방법', '## 배운 점'];
  return requiredHeadings.every((heading) => {
    const idx = draft.indexOf(heading);
    if (idx < 0) return false;
    const section = draft.slice(idx, idx + 280);
    return section.length > heading.length + 20;
  });
}

interviewRouter.post('/start', async (req, res) => {
  try {
    const parsed = startBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid input' } });

    const { repo, sha } = parsed.data;
    const user = await getOrCreateDefaultUser();
    const token = process.env.GITHUB_TOKEN;
    const detail = await fetchCommitDetail(repo, sha, token);
    if (!detail) return res.status(502).json({ success: false, error: { code: 'GITHUB_API_ERROR', message: 'Failed to analyze commit.' } });

    const files = (detail.files ?? []).slice(0, 8);
    const commitMessage = detail.commit?.message ?? '';
    const shortSha = sha.slice(0, 7);

    const prompt = [
      '너는 시니어 엔지니어 튜터다. 아래 커밋을 바탕으로 질문 2개를 생성하라.',
      '요구사항:',
      '- Q1은 무엇을 변경했는지 구체 요약 질문',
      '- Q2는 왜 그렇게 변경했는지(영향/검증) 질문',
      '- 너무 추상적이지 않게 파일/기능 맥락 포함',
      '- 한국어로 작성',
      'JSON만 반환: {"question":"...","expectedAnswer":"...","hint":"...","conceptTags":["..."]}',
      `repo: ${repo}`,
      `sha: ${sha}`,
      `commitMessage: ${commitMessage}`,
      `files: ${JSON.stringify(files)}`,
    ].join('\n');

    const geminiRaw = await callGeminiJSON(prompt);
    const geminiParsed = geminiStartSchema.safeParse(geminiRaw);
    const generated = geminiParsed.success ? geminiParsed.data : buildFallbackStart(shortSha, files);

    const session = await InterviewSessionModel.create({ userId: user._id, repoFullName: repo, commitSha: sha, status: 'IN_PROGRESS', startedAt: new Date() });
    await InterviewTurnModel.create({ sessionId: session._id, turnIndex: 1, question: generated.question, expectedAnswer: generated.expectedAnswer, hint: generated.hint, actionType: 'QUESTION', conceptTags: generated.conceptTags });

    return res.json({ success: true, data: { sessionId: String(session._id), ...generated } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/answer', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    const parsed = answerBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid input' } });

    const turn = await InterviewTurnModel.findOne({ sessionId, turnIndex: 1 });
    if (!turn) return res.status(404).json({ success: false, error: { code: 'TURN_NOT_FOUND', message: 'Interview turn not found.' } });

    const feedback = '핵심 의도 설명은 좋습니다. 영향 범위와 테스트 근거를 더 구체화해보세요.';
    turn.userAnswer = parsed.data.answer.trim();
    turn.feedback = feedback;
    turn.actionType = 'ANSWER';
    await turn.save();
    await InterviewSessionModel.findByIdAndUpdate(sessionId, { status: 'ANSWERED' });

    return res.json({ success: true, data: { feedback, score: 78 } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/hint', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    const hint = '변경 파일을 기능 단위로 묶고, 사용자 시나리오 변화부터 설명해보세요.';
    await InterviewTurnModel.findOneAndUpdate({ sessionId, turnIndex: 1 }, { actionType: 'HINT', hint });
    return res.json({ success: true, data: { hint } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/explain', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    const parsed = explainBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid input' } });
    const changeSummary = parsed.data.changeSummary?.trim();

    const session = await InterviewSessionModel.findById(sessionId);
    const turn = await InterviewTurnModel.findOne({ sessionId, turnIndex: 1 });
    if (!session || !turn) return res.status(404).json({ success: false, error: { code: 'SESSION_OR_TURN_NOT_FOUND', message: 'Interview session/turn not found.' } });

    const detail = await fetchCommitDetail(session.repoFullName, session.commitSha, process.env.GITHUB_TOKEN);
    const files = (detail?.files ?? []).slice(0, 8);
    const commitMessage = detail?.commit?.message ?? '';

    const prompt = [
      '너는 시니어 개발자다. 아래 커밋을 주니어가 이해하기 쉽게 긴 블로그 해설 초안으로 작성하라.',
      '상황: 사용자가 "I don\'t know(모르겠어요)"를 눌렀다. 따라서 답변 대신 학습용 해설 중심으로 작성해야 한다.',
      '요구사항:',
      '- 초보자도 이해 가능하게 쉬운 설명',
      '- 반드시 실제 변경 근거(파일/함수/API 엔드포인트)를 명시해서 작성한다.',
      '- 예시처럼 "변경내용: ~ 구현" 수준의 입력을, 설계 의도/효과/트레이드오프로 확장해서 작성한다.',
      '- 특히 "스텁 -> 동작형 구현" 전환의 이점(신뢰성, 통합 테스트 가능, 사용자 흐름 완결성)을 구체적으로 설명한다.',
      '- 인터뷰 룸 UI 연동 변경이라면 start/answer/hint/explain/skip 액션이 실제 API와 연결되며 얻는 효과를 포함한다.',
      '- 반드시 아래 섹션 제목을 정확히 포함하고, 각 섹션은 실제 내용 bullet 2개 이상으로 채운다:',
      '  1) ## 무엇이 바뀌었나',
      '  2) ## 왜 바꿨나',
      '  3) ## 검증 방법',
      '  4) ## 배운 점',
      '- "기능/구조 관점에서 핵심 변경점 정리" 같은 플레이스홀더 문장은 금지',
      '- 검증 방법에는 정상/예외/회귀 시나리오를 포함',
      '- 문장 규칙: 각 bullet은 "변경 근거 -> 의미 -> 기대 효과" 순서로 작성',
      '- 마크다운 형식',
      'JSON만 반환: {"explanation":"짧은 해설","generatedDraft":"긴 마크다운"}',
      `repo: ${session.repoFullName}`,
      `sha: ${session.commitSha}`,
      `commitMessage: ${commitMessage}`,
      `files: ${JSON.stringify(files)}`,
      `question: ${turn.question}`,
      `changeSummary: ${changeSummary ?? '(없음)'}`,
      '출력 품질 기준:',
      '- "무엇이 바뀌었나"에는 실제 추가/수정된 API 또는 UI 액션 연결을 명시',
      '- "왜 바꿨나"에는 스텁 방식 대비 동작형 구현의 장단점 비교 포함',
      '- "검증 방법"에는 API 단위 + UI 연동 시나리오 둘 다 포함',
    ].join('\n');

    const geminiRaw = await callGeminiJSON(prompt);
    const geminiParsed = geminiExplainSchema.safeParse(geminiRaw);
    const generated = geminiParsed.success
      ? geminiParsed.data
      : buildFallbackExplain(session.repoFullName, session.commitSha, commitMessage, files);

    const normalized = hasMinimumContent(generated.generatedDraft)
      ? generated
      : buildFallbackExplain(session.repoFullName, session.commitSha, commitMessage, files);

    await InterviewTurnModel.findOneAndUpdate({ sessionId, turnIndex: 1 }, { actionType: 'EXPLAIN', feedback: normalized.explanation });
    await InterviewSessionModel.findByIdAndUpdate(sessionId, { status: 'EXPLAINED' });
    return res.json({ success: true, data: normalized });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

interviewRouter.post('/:sessionId/skip', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!Types.ObjectId.isValid(sessionId)) return res.status(400).json({ success: false, error: { code: 'INVALID_SESSION_ID', message: 'Invalid sessionId.' } });
    await InterviewTurnModel.findOneAndUpdate({ sessionId, turnIndex: 1 }, { actionType: 'SKIP' });
    await InterviewSessionModel.findByIdAndUpdate(sessionId, { status: 'SKIPPED', completedAt: new Date() });
    return res.json({ success: true, data: { mode: 'summary', message: '질문을 스킵했습니다. 커밋 요약 모드로 전환합니다.' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});
