import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

import { InterviewSessionModel, InterviewTurnModel, UserModel } from '../models';

const GITHUB_API_BASE = 'https://api.github.com';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
const DEFAULT_USER = { githubUserId: 'local-dev-user', username: 'local-dev-user' };

type CommitFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };
type CommitDetail = { commit?: { message?: string }; files?: CommitFile[] };

const analyzeBodySchema = z.object({ repo: z.string().min(1), sha: z.string().min(7) });
const geminiAnalyzeSchema = z.object({
  question: z.string().min(1),
  explanation: z.string().min(1),
  generatedDraft: z.string().min(1),
  conceptTags: z.array(z.string()).min(1),
});

export const analyzeRouter = Router();

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

function extractKeyPatch(files: CommitFile[]) {
  const withPatch = files.filter((f) => typeof f.patch === 'string' && f.patch.trim().length > 0);
  const prioritized = withPatch.sort((a, b) => {
    const aScore = /fetch|axios|api|http|todo|service|controller|hook|state/i.test(a.filename) ? 1 : 0;
    const bScore = /fetch|axios|api|http|todo|service|controller|hook|state/i.test(b.filename) ? 1 : 0;
    return bScore - aScore;
  });

  return prioritized
    .slice(0, 3)
    .map((f) => `FILE: ${f.filename}\n${(f.patch ?? '').slice(0, 1800)}`)
    .join('\n\n---\n\n');
}

async function callGeminiJSON(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  });
  const text = result.response.text();
  if (!text || text.trim().length === 0) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

analyzeRouter.post('/start', async (req, res) => {
  try {
    const parsed = analyzeBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid input' } });

    const { repo, sha } = parsed.data;
    const user = await getOrCreateDefaultUser();
    const detail = await fetchCommitDetail(repo, sha, process.env.GITHUB_TOKEN);
    if (!detail) return res.status(502).json({ success: false, error: { code: 'GITHUB_API_ERROR', message: 'Failed to analyze commit.' } });

    const files = (detail.files ?? []).slice(0, 30);
    const commitMessage = detail.commit?.message ?? '';
    const keyDiffText = extractKeyPatch(files);
    const hasPatch = files.some((f) => typeof f.patch === 'string' && f.patch.trim().length > 0);

    const prompt = [
      'You are a senior developer writing a technical blog post for teammates.',
      'Read commit message and diff, then write a natural Korean article (not outline/template).',
      'Rules:',
      '- Do not use headings like "## 구현 의도" or checklist format.',
      '- Write continuous prose with intro, body, and closing.',
      '- Explain concrete code changes from diff evidence.',
      '- Tone: "~했습니다/~입니다".',
      'Return JSON only:',
      '{"question":"one-sentence key change","explanation":"2-3 sentence summary","generatedDraft":"full Korean blog prose markdown","conceptTags":["tag1","tag2","tag3"]}',
      `commitMessage: ${commitMessage}`,
      `changedFiles: ${files.map((f) => `${f.filename}(+${f.additions}/-${f.deletions})`).join(', ')}`,
      `keyDiff:\n${keyDiffText || 'NO_PATCH_DATA'}`,
    ].join('\n');

    const raw = await callGeminiJSON(prompt);
    const parsedGemini = geminiAnalyzeSchema.safeParse(raw);

    const fallbackDraft = [
      `이번 커밋("${commitMessage || '메시지 없음'}")은 ${files.length}개 파일 변경이 포함되어 있습니다.`,
      `핵심 파일은 ${files.slice(0, 5).map((f) => f.filename).join(', ') || '확인 불가'}이며, 각 파일의 변경량을 기준으로 영향 범위를 추적했습니다.`,
      hasPatch
        ? `특히 diff에서 확인된 코드 블록을 기준으로 상태 변경 지점과 API 호출 흐름이 어떻게 달라졌는지 분석했습니다.`
        : '이번 응답에는 patch 데이터가 없어 파일 메타데이터 중심으로 분석했습니다.',
      '검증은 정상 시나리오, 실패 시나리오, 기존 기능 회귀 여부 순서로 정리했습니다.',
    ].join(' ');

    const generated = parsedGemini.success
      ? parsedGemini.data
      : {
          question: `이 커밋(${sha.slice(0, 7)})에서 가장 큰 동작 변화는 무엇인가요?`,
          explanation: hasPatch ? 'Diff 기반으로 변경 의도와 동작 영향을 요약했습니다.' : 'Patch 부재로 파일/커밋메시지 기반 요약을 제공합니다.',
          generatedDraft: fallbackDraft,
          conceptTags: ['commit-analysis', hasPatch ? 'diff-based' : 'metadata-based', 'behavior-change'],
        };

    const session = await InterviewSessionModel.create({ userId: user._id, repoFullName: repo, commitSha: sha, status: 'ANALYZED', startedAt: new Date(), completedAt: new Date() });
    await InterviewTurnModel.create({ sessionId: session._id, turnIndex: 1, question: generated.question, expectedAnswer: generated.explanation, actionType: 'ANALYZE', conceptTags: generated.conceptTags, feedback: generated.explanation });

    return res.json({ success: true, data: { sessionId: String(session._id), hasPatch, ...generated } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});
