import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/globals.css';

type Step = 'select' | 'interview';
type RepoItem = { id: number; fullName: string; private: boolean; defaultBranch: string };
type CommitItem = { sha: string; shortSha: string; message: string; authorName: string; committedAt: string; url: string };
type DiffFile = { filename: string; status: string; additions: number; deletions: number; changes: number; patch: string };

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
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload?.error?.message ?? 'Request failed');
  return payload.data as T;
}

function App() {
  const [step, setStep] = React.useState<Step>('select');
  const [repos, setRepos] = React.useState<RepoItem[]>([]);
  const [reposLoading, setReposLoading] = React.useState(true);
  const [reposError, setReposError] = React.useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = React.useState('');
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

  React.useEffect(() => { void (async () => { try { const data = await apiGet<RepoItem[]>('/repos'); setRepos(data); setSelectedRepo(data[0]?.fullName ?? ''); } catch (e) { setReposError(e instanceof Error ? e.message : 'Failed to load repositories'); } finally { setReposLoading(false); } })(); }, []);
  React.useEffect(() => { if (!selectedRepo) return; void (async () => { setCommitsLoading(true); setCommitsError(null); try { const data = await apiGet<CommitItem[]>(`/commits?repo=${encodeURIComponent(selectedRepo)}`); setCommits(data); setSelectedCommit(data[0]?.sha ?? ''); } catch (e) { setCommitsError(e instanceof Error ? e.message : 'Failed to load commits'); } finally { setCommitsLoading(false); } })(); }, [selectedRepo]);
  React.useEffect(() => { if (!selectedRepo || !selectedCommit) return; void (async () => { setDiffLoading(true); setDiffError(null); try { const data = await apiGet<{ files: DiffFile[] }>(`/diff?repo=${encodeURIComponent(selectedRepo)}&sha=${encodeURIComponent(selectedCommit)}`); setDiffFiles(data.files); } catch (e) { setDiffError(e instanceof Error ? e.message : 'Failed to load diff'); } finally { setDiffLoading(false); } })(); }, [selectedRepo, selectedCommit]);

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

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-5xl p-8"><h1 className="text-3xl font-bold">Smart Blog - AI Tutor</h1>{step === 'select' ? <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">1. Select Repository and Commit</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label><span>Repository</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedRepo} disabled={reposLoading || repos.length===0} onChange={(e)=>setSelectedRepo(e.target.value)}>{repos.map((r)=><option key={r.id} value={r.fullName}>{r.fullName}</option>)}</select></label><label><span>Commit</span><select className="w-full rounded-md border bg-white px-3 py-2" value={selectedCommit} disabled={commitsLoading||commits.length===0} onChange={(e)=>setSelectedCommit(e.target.value)}>{commits.map((c)=><option key={c.sha} value={c.sha}>{c.shortSha} - {c.message}</option>)}</select></label></div>{reposError && <p className="mt-3 text-sm text-red-600">{reposError}</p>}{commitsError && <p className="mt-3 text-sm text-red-600">{commitsError}</p>}{diffError && <p className="mt-3 text-sm text-red-600">{diffError}</p>}<button className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={!selectedRepo || !selectedCommit || interviewLoading} onClick={startInterview}>Start Interview</button></section> : <section className="mt-8 rounded-xl border p-6"><h2 className="text-xl font-semibold">2. AI Tutor Interview Room</h2><p className="mt-2 text-sm text-muted-foreground">{selectedRepo} / {selectedCommit.slice(0,7)} / session {sessionId}</p><div className="mt-4 rounded-md bg-muted p-4"><p className="font-medium">Q. {question}</p></div><textarea className="mt-4 h-36 w-full rounded-md border bg-white px-3 py-2" placeholder="Write your answer" value={answer} onChange={(e)=>setAnswer(e.target.value)} />{feedback && <p className="mt-3 text-sm">Feedback: {feedback}</p>}{helperText && <p className="mt-2 text-sm text-muted-foreground">{helperText}</p>}<div className="mt-4 grid gap-2 md:grid-cols-4"><button className="rounded-md border px-3 py-2" onClick={async ()=>{ if(!sessionId) return; const d=await apiPost<{feedback:string}>(`/interview/${sessionId}/answer`,{answer}); setFeedback(d.feedback); }}>Submit Answer</button><button className="rounded-md border px-3 py-2" onClick={async ()=>{ if(!sessionId) return; const d=await apiPost<{hint:string}>(`/interview/${sessionId}/hint`,{}); setHelperText(`Hint: ${d.hint}`); }}>Show Hint</button><button className="rounded-md border px-3 py-2" onClick={async ()=>{ if(!sessionId) return; const d=await apiPost<{explanation:string}>(`/interview/${sessionId}/explain`,{}); setHelperText(`Explanation: ${d.explanation}`); }}>I Don't Know</button><button className="rounded-md border px-3 py-2" onClick={async ()=>{ if(!sessionId) return; const d=await apiPost<{message:string}>(`/interview/${sessionId}/skip`,{}); setHelperText(d.message); }}>Skip Question</button></div><button className="mt-4 text-sm underline" onClick={()=>setStep('select')}>Back to Commit Selection</button></section>}</div></main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
