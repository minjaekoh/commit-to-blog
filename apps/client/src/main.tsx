import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/globals.css';

type Step = 'select' | 'analysis' | 'draft';
type RepoItem = { id: number; fullName: string; private: boolean; defaultBranch: string };
type CommitItem = { sha: string; shortSha: string; message: string; authorName: string; committedAt: string; url: string };
type PostCard = { id: string; title: string; repoFullName: string; commitSha: string; status: 'draft' | 'published'; updatedAt: string; contentMarkdown: string };
type AnalyzeResponse = { sessionId: string; question: string; explanation: string; generatedDraft: string; conceptTags: string[]; hasPatch?: boolean };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message ?? 'Request failed');
  return payload.data as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message ?? 'Request failed');
  return payload.data as T;
}

async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message ?? 'Request failed');
  return payload.data as T;
}

function markdownToPreview(markdown: string) {
  return markdown.replace(/^### (.*)$/gm, '<h3 class="text-lg font-semibold mt-4">$1</h3>').replace(/^## (.*)$/gm, '<h2 class="text-xl font-semibold mt-5">$1</h2>').replace(/^# (.*)$/gm, '<h1 class="text-2xl font-bold mt-1">$1</h1>').replace(/^- (.*)$/gm, '<li>$1</li>').replace(/^> (.*)$/gm, '<blockquote class="border-l-4 pl-3 text-muted-foreground">$1</blockquote>').replace(/\n\n/g, '<br/><br/>');
}

function buildPostTitleFromCommitMessage(message: string, fallbackSha: string) {
  const normalized = message
    .replace(/^(feat|fix|chore|docs|refactor|test|style|perf)(\(.+?\))?:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return `커밋 분석: ${fallbackSha.slice(0, 7)}`;
  const short = normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
  return `커밋 분석: ${short}`;
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
  const [analysisLoading, setAnalysisLoading] = React.useState(false);

  const [sessionId, setSessionId] = React.useState('');
  const [question, setQuestion] = React.useState('');
  const [analysisSummary, setAnalysisSummary] = React.useState('');
  const [conceptTags, setConceptTags] = React.useState<string[]>([]);
  const [hasPatch, setHasPatch] = React.useState<boolean | null>(null);

  const [draftMarkdown, setDraftMarkdown] = React.useState('');
  const [posts, setPosts] = React.useState<PostCard[]>([]);
  const [postTitle, setPostTitle] = React.useState('');

  React.useEffect(() => { void (async () => { try { const data = await apiGet<RepoItem[]>('/repos'); setRepos(data); setSelectedRepo(data[0]?.fullName ?? ''); setPosts(await apiGet<PostCard[]>('/posts')); } catch (e) { setReposError(e instanceof Error ? e.message : 'Failed to load repositories'); } finally { setReposLoading(false); } })(); }, []);
  React.useEffect(() => { if (!selectedRepo) return; void (async () => { try { const data = await apiGet<string[]>(`/commits/branches?repo=${encodeURIComponent(selectedRepo)}`); setBranches(data); setSelectedBranch(data[0] ?? ''); } catch { setBranches([]); setSelectedBranch(''); } })(); }, [selectedRepo]);
  React.useEffect(() => { if (!selectedRepo || !selectedBranch) return; void (async () => { setCommitsLoading(true); setCommitsError(null); try { const data = await apiGet<CommitItem[]>(`/commits?repo=${encodeURIComponent(selectedRepo)}&branch=${encodeURIComponent(selectedBranch)}`); setCommits(data); setSelectedCommit(data[0]?.sha ?? ''); } catch (e) { setCommitsError(e instanceof Error ? e.message : 'Failed to load commits'); } finally { setCommitsLoading(false); } })(); }, [selectedRepo, selectedBranch]);

  const startAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const selectedCommitItem = commits.find((c) => c.sha === selectedCommit);
      const suggestedTitle = buildPostTitleFromCommitMessage(selectedCommitItem?.message ?? '', selectedCommit);
      const data = await apiPost<AnalyzeResponse>('/analyze/start', { repo: selectedRepo, sha: selectedCommit });
      setSessionId(data.sessionId); setQuestion(data.question); setAnalysisSummary(data.explanation); setConceptTags(data.conceptTags); setHasPatch(data.hasPatch ?? null); setDraftMarkdown(data.generatedDraft); setPostTitle(suggestedTitle); setStep('analysis');
    } catch (e) { setReposError(e instanceof Error ? e.message : 'Failed to start analysis'); } finally { setAnalysisLoading(false); }
  };

  const saveDraft = async () => {
    const selectedCommitItem = commits.find((c) => c.sha === selectedCommit);
    const fallbackTitle = buildPostTitleFromCommitMessage(selectedCommitItem?.message ?? '', selectedCommit);
    await apiPost<{ id: string }>('/posts', { sessionId, repoFullName: selectedRepo, commitSha: selectedCommit, title: postTitle || fallbackTitle, contentMarkdown: draftMarkdown, status: 'draft', tags: conceptTags });
    setPosts(await apiGet<PostCard[]>('/posts'));
  };

  const deletePost = async (postId: string) => { await apiDelete<{ id: string; deleted: boolean }>(`/posts/${postId}`); setPosts((prev) => prev.filter((post) => post.id !== postId)); };

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-6xl p-8"><button className="text-3xl font-bold text-left" onClick={() => setStep('select')}>Smart Blog - AI Commit Analyst</button>
    {step === 'select' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">1. Select Repository / Branch / Commit</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><label><span>Repository</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedRepo} disabled={reposLoading || repos.length===0} onChange={(e)=>setSelectedRepo(e.target.value)}>{repos.map((r)=><option key={r.id} value={r.fullName}>{r.fullName}</option>)}</select></label><label><span>Branch</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedBranch} onChange={(e)=>setSelectedBranch(e.target.value)}>{branches.map((b)=><option key={b} value={b}>{b}</option>)}</select></label><label><span>Commit</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedCommit} disabled={commitsLoading || commits.length===0} onChange={(e)=>setSelectedCommit(e.target.value)}>{commits.map((c)=><option key={c.sha} value={c.sha}>{c.shortSha} - {c.message}</option>)}</select></label></div>{reposError && <p className="mt-3 text-sm text-red-600">{reposError}</p>}{commitsError && <p className="mt-3 text-sm text-red-600">{commitsError}</p>}<button className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={startAnalysis} disabled={analysisLoading}>{analysisLoading ? 'Analyzing...' : 'Start AI Analysis'}</button>{posts.length>0 ? <div className="mt-8"><h3 className="text-lg font-semibold">Saved Posts</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{posts.map((post)=><article key={post.id} className="rounded-md border p-3"><p className="font-medium">{post.title}</p><p className="text-xs text-muted-foreground">{post.repoFullName} / {post.commitSha.slice(0,7)}</p><button className="mt-2 rounded-md border px-3 py-1 text-sm" onClick={async()=>{const full=await apiGet<PostCard>(`/posts/${post.id}`);setPostTitle(full.title);setDraftMarkdown(full.contentMarkdown);setStep('draft');}}>Open</button><button className="mt-2 ml-2 rounded-md border px-3 py-1 text-sm text-red-700" onClick={()=>void deletePost(post.id)}>Delete</button></article>)}</div></div> : null}</section> : null}
    {step === 'analysis' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">2. AI Analysis Result</h2><p className="mt-2 text-sm text-muted-foreground">{selectedRepo} / {selectedBranch} / {selectedCommit.slice(0,7)}</p><div className="mt-4 rounded-md bg-muted p-4"><p className="font-medium">핵심 포인트: {question}</p><p className="mt-2 text-sm">{analysisSummary}</p><p className="mt-2 text-xs text-muted-foreground">Tags: {conceptTags.join(', ')}</p><p className="mt-1 text-xs text-muted-foreground">Diff patch included: {hasPatch === null ? 'unknown' : hasPatch ? 'yes' : 'no'}</p></div><button className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => setStep('draft')}>Open Draft Editor</button></section> : null}
    {step === 'draft' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">3. Draft Review</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><div><input className="mb-2 w-full rounded-md border px-3 py-2" value={postTitle} onChange={(e)=>setPostTitle(e.target.value)} /><textarea className="h-[420px] w-full rounded-md border bg-white p-3 font-mono text-sm" value={draftMarkdown} onChange={(e)=>setDraftMarkdown(e.target.value)} /></div><div><div className="h-[420px] overflow-auto rounded-md border bg-white p-4 text-sm" dangerouslySetInnerHTML={{__html: markdownToPreview(draftMarkdown)}} /></div></div><div className="mt-4 flex gap-2"><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={saveDraft}>Save Draft</button><button className="rounded-md border px-4 py-2" onClick={() => setStep('select')}>Back to Home</button></div></section> : null}
  </div></main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

