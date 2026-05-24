import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/globals.css';

type Step = 'select' | 'interview' | 'draft';
type RepoItem = { id: number; fullName: string; private: boolean; defaultBranch: string };
type CommitItem = { sha: string; shortSha: string; message: string; authorName: string; committedAt: string; url: string };
type DiffFile = { filename: string; status: string; additions: number; deletions: number; changes: number; patch: string };
type InterviewMode = 'answer' | 'explain' | 'skip';
type PostCard = { id: string; title: string; repoFullName: string; commitSha: string; status: 'draft' | 'published'; updatedAt: string; contentMarkdown: string };

type StartInterviewResponse = {
  sessionId: string;
  question: string;
  expectedAnswer: string;
  hint: string;
  conceptTags: string[];
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message ?? 'Request failed');
  return payload.data as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message ?? 'Request failed');
  return payload.data as T;
}

function buildDraftMarkdown(params: { mode: InterviewMode; repo: string; sha: string; question: string; answer: string; feedback: string | null; helperText: string | null }) {
  const title = `# TIL: ${params.repo} ${params.sha.slice(0, 7)} 회고`;
  const common = [title, '', `- Repository: ${params.repo}`, `- Commit: ${params.sha}`, '', '## 변경 요약', '- 이번 커밋에서 변경한 핵심 내용을 정리합니다.', '', '## AI 질문', `> ${params.question}`, ''];
  if (params.mode === 'answer') return [...common, '## 내 답변', params.answer || '- (답변 미입력)', '', '## AI 피드백', params.feedback ?? '- (피드백 없음)', '', '## 설계 의도', '- 왜 이 구현을 선택했는지 대안과 비교해 정리합니다.'].join('\n');
  if (params.mode === 'explain') return [...common, '## 막힌 지점', '- 어떤 부분에서 판단이 어려웠는지 기록합니다.', '', '## 해설 요약', params.helperText ?? '- (해설 없음)', '', '## 새로 배운 개념', '- 이번 커밋에서 이해한 개념과 다음 적용 계획을 적습니다.'].join('\n');
  return [...common, '## 스킵 사유', '- 질문을 스킵한 이유를 간단히 적습니다.', '', '## 커밋 요약', '- 릴리즈노트 형태로 변경사항/영향범위를 정리합니다.'].join('\n');
}

function markdownToPreview(markdown: string) {
  return markdown
    .replace(/^### (.*)$/gm, '<h3 class="text-lg font-semibold mt-4">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="text-xl font-semibold mt-5">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 class="text-2xl font-bold mt-1">$1</h1>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/^> (.*)$/gm, '<blockquote class="border-l-4 pl-3 text-muted-foreground">$1</blockquote>')
    .replace(/\n\n/g, '<br/><br/>');
}

function App() {
  const [step, setStep] = React.useState<Step>('select');
  const [repos, setRepos] = React.useState<RepoItem[]>([]);
  const [reposLoading, setReposLoading] = React.useState(true);
  const [reposError, setReposError] = React.useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = React.useState('');

  const [branches, setBranches] = React.useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = React.useState('');

  const [commits, setCommits] = React.useState<CommitItem[]>([]);
  const [commitsLoading, setCommitsLoading] = React.useState(false);
  const [commitsError, setCommitsError] = React.useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = React.useState('');
  const [diffFiles, setDiffFiles] = React.useState<DiffFile[]>([]);
  const [diffLoading, setDiffLoading] = React.useState(false);
  const [diffError, setDiffError] = React.useState<string | null>(null);

  const [sessionId, setSessionId] = React.useState('');
  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [helperText, setHelperText] = React.useState<string | null>(null);
  const [interviewLoading, setInterviewLoading] = React.useState(false);

  const [draftMarkdown, setDraftMarkdown] = React.useState('');
  const [posts, setPosts] = React.useState<PostCard[]>([]);
  const [postTitle, setPostTitle] = React.useState('');
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const data = await apiGet<RepoItem[]>('/repos');
        setRepos(data);
        setSelectedRepo(data[0]?.fullName ?? '');
      } catch (e) {
        setReposError(e instanceof Error ? e.message : 'Failed to load repositories');
      } finally {
        setReposLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!selectedRepo) return;
    void (async () => {
      try {
        const data = await apiGet<string[]>(`/commits/branches?repo=${encodeURIComponent(selectedRepo)}`);
        setBranches(data);
        setSelectedBranch(data[0] ?? '');
      } catch {
        setBranches([]);
        setSelectedBranch('');
      }
    })();
  }, [selectedRepo]);

  React.useEffect(() => {
    if (!selectedRepo || !selectedBranch) return;
    void (async () => {
      setCommitsLoading(true);
      setCommitsError(null);
      try {
        const data = await apiGet<CommitItem[]>(`/commits?repo=${encodeURIComponent(selectedRepo)}&branch=${encodeURIComponent(selectedBranch)}`);
        setCommits(data);
        setSelectedCommit(data[0]?.sha ?? '');
      } catch (e) {
        setCommitsError(e instanceof Error ? e.message : 'Failed to load commits');
      } finally {
        setCommitsLoading(false);
      }
    })();
  }, [selectedRepo, selectedBranch]);

  React.useEffect(() => {
    if (!selectedRepo || !selectedCommit) return;
    void (async () => {
      setDiffLoading(true);
      setDiffError(null);
      try {
        const data = await apiGet<{ files: DiffFile[] }>(`/diff?repo=${encodeURIComponent(selectedRepo)}&sha=${encodeURIComponent(selectedCommit)}`);
        setDiffFiles(data.files);
      } catch (e) {
        setDiffError(e instanceof Error ? e.message : 'Failed to load diff');
      } finally {
        setDiffLoading(false);
      }
    })();
  }, [selectedRepo, selectedCommit]);

  const startInterview = async () => {
    setInterviewLoading(true);
    setFeedback(null);
    setHelperText(null);
    try {
      const data = await apiPost<StartInterviewResponse>('/interview/start', { repo: selectedRepo, sha: selectedCommit });
      setSessionId(data.sessionId);
      setQuestion(data.question);
      setHelperText(`Concept tags: ${data.conceptTags.join(', ')}`);
      setStep('interview');
    } catch (e) {
      setReposError(e instanceof Error ? e.message : 'Failed to start interview');
    } finally {
      setInterviewLoading(false);
    }
  };

  const goDraft = (mode: InterviewMode) => {
    setDraftMarkdown(buildDraftMarkdown({ mode, repo: selectedRepo, sha: selectedCommit, question, answer, feedback, helperText }));
    setPostTitle(`TIL: ${selectedRepo} ${selectedCommit.slice(0, 7)} 회고`);
    setStep('draft');
  };

  const saveDraft = async () => {
    const data = await apiPost<{ id: string }>('/posts', {
      sessionId,
      repoFullName: selectedRepo,
      commitSha: selectedCommit,
      title: postTitle || `TIL: ${selectedRepo} ${selectedCommit.slice(0, 7)} 회고`,
      contentMarkdown: draftMarkdown,
      status: 'draft',
      tags: [],
    });
    setSaveMessage(`Saved draft: ${data.id}`);
  };

  const loadPosts = async () => {
    const data = await apiGet<PostCard[]>('/posts');
    setPosts(data);
  };

  return (
    <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-6xl p-8"><h1 className="text-3xl font-bold">Smart Blog - AI Tutor</h1>
      {step === 'select' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">1. Select Repository / Branch / Commit</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><label><span>Repository</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedRepo} disabled={reposLoading || repos.length===0} onChange={(e)=>setSelectedRepo(e.target.value)}>{repos.map((r)=><option key={r.id} value={r.fullName}>{r.fullName}</option>)}</select></label><label><span>Branch</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedBranch} onChange={(e)=>setSelectedBranch(e.target.value)}>{branches.map((b)=><option key={b} value={b}>{b}</option>)}</select></label><label><span>Commit</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedCommit} disabled={commitsLoading || commits.length===0} onChange={(e)=>setSelectedCommit(e.target.value)}>{commits.map((c)=><option key={c.sha} value={c.sha}>{c.shortSha} - {c.message}</option>)}</select></label></div>{reposError && <p className="mt-3 text-sm text-red-600">{reposError}</p>}{commitsError && <p className="mt-3 text-sm text-red-600">{commitsError}</p>}{diffError && <p className="mt-3 text-sm text-red-600">{diffError}</p>}<button className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={startInterview}>Start Interview</button></section> : null}
      {step === 'interview' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">2. AI Tutor Interview Room</h2><p className="mt-2 text-sm text-muted-foreground">{selectedRepo} / {selectedBranch} / {selectedCommit.slice(0,7)}</p><div className="mt-4 rounded-md bg-muted p-4"><p className="font-medium">Q. {question}</p></div><textarea className="mt-4 h-36 w-full rounded-md border bg-white px-3 py-2" value={answer} onChange={(e)=>setAnswer(e.target.value)} />{feedback && <p className="mt-3 text-sm">Feedback: {feedback}</p>}<div className="mt-4 grid gap-2 md:grid-cols-4"><button className="rounded-md border px-3 py-2" onClick={async()=>{const d=await apiPost<{feedback:string}>(`/interview/${sessionId}/answer`,{answer});setFeedback(d.feedback);}}>Submit Answer</button><button className="rounded-md border px-3 py-2" onClick={async()=>{const d=await apiPost<{hint:string}>(`/interview/${sessionId}/hint`,{});setHelperText(`Hint: ${d.hint}`);}}>Show Hint</button><button className="rounded-md border px-3 py-2" onClick={async()=>{const d=await apiPost<{explanation:string}>(`/interview/${sessionId}/explain`,{});setHelperText(`Explanation: ${d.explanation}`);goDraft('explain');}}>I Don't Know</button><button className="rounded-md border px-3 py-2" onClick={async()=>{await apiPost(`/interview/${sessionId}/skip`,{});goDraft('skip');}}>Skip Question</button></div><button className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={()=>goDraft('answer')}>Generate Draft</button></section> : null}
      {step === 'draft' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">3. Draft Review</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><div><input className="mb-2 w-full rounded-md border px-3 py-2" value={postTitle} onChange={(e)=>setPostTitle(e.target.value)} /><textarea className="h-[420px] w-full rounded-md border bg-white p-3 font-mono text-sm" value={draftMarkdown} onChange={(e)=>setDraftMarkdown(e.target.value)} /></div><div><div className="h-[420px] overflow-auto rounded-md border bg-white p-4 text-sm" dangerouslySetInnerHTML={{__html: markdownToPreview(draftMarkdown)}} /></div></div><div className="mt-4 flex gap-2"><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={saveDraft}>Save Draft</button><button className="rounded-md border px-4 py-2" onClick={loadPosts}>Load Saved Posts</button></div>{saveMessage ? <p className="mt-2 text-sm">{saveMessage}</p> : null}{posts.length>0 ? <div className="mt-4 grid gap-3 md:grid-cols-2">{posts.map((post)=><article key={post.id} className="rounded-md border p-3"><p className="font-medium">{post.title}</p><p className="text-xs text-muted-foreground">{post.repoFullName} / {post.commitSha.slice(0,7)}</p><button className="mt-2 rounded-md border px-3 py-1 text-sm" onClick={async()=>{const full=await apiGet<PostCard>(`/posts/${post.id}`);setPostTitle(full.title);setDraftMarkdown(full.contentMarkdown);}}>View</button><button className="mt-2 ml-2 rounded-md border px-3 py-1 text-sm" onClick={()=>{setPostTitle(post.title);setDraftMarkdown(post.contentMarkdown);}}>Edit</button></article>)}</div>:null}</section> : null}
    </div></main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
