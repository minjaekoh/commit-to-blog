import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/globals.css';

type Step = 'select' | 'interview';

type RepoItem = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

type CommitItem = {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  committedAt: string;
  url: string;
};

type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload?.error?.message ?? 'Request failed');
  }

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

  const [answer, setAnswer] = React.useState('');

  React.useEffect(() => {
    const loadRepos = async () => {
      setReposLoading(true);
      setReposError(null);
      try {
        const data = await apiGet<RepoItem[]>('/repos');
        setRepos(data);
        setSelectedRepo(data[0]?.fullName ?? '');
      } catch (error) {
        setReposError(error instanceof Error ? error.message : '저장소 조회 실패');
      } finally {
        setReposLoading(false);
      }
    };

    void loadRepos();
  }, []);

  React.useEffect(() => {
    if (!selectedRepo) {
      setCommits([]);
      setSelectedCommit('');
      return;
    }

    const loadCommits = async () => {
      setCommitsLoading(true);
      setCommitsError(null);
      try {
        const data = await apiGet<CommitItem[]>(`/commits?repo=${encodeURIComponent(selectedRepo)}`);
        setCommits(data);
        setSelectedCommit(data[0]?.sha ?? '');
      } catch (error) {
        setCommitsError(error instanceof Error ? error.message : '커밋 조회 실패');
      } finally {
        setCommitsLoading(false);
      }
    };

    void loadCommits();
  }, [selectedRepo]);

  React.useEffect(() => {
    if (!selectedRepo || !selectedCommit) {
      setDiffFiles([]);
      return;
    }

    const loadDiff = async () => {
      setDiffLoading(true);
      setDiffError(null);
      try {
        const data = await apiGet<{ files: DiffFile[] }>(
          `/diff?repo=${encodeURIComponent(selectedRepo)}&sha=${encodeURIComponent(selectedCommit)}`,
        );
        setDiffFiles(data.files);
      } catch (error) {
        setDiffError(error instanceof Error ? error.message : 'Diff 조회 실패');
      } finally {
        setDiffLoading(false);
      }
    };

    void loadDiff();
  }, [selectedRepo, selectedCommit]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-3xl font-bold">Smart Blog - AI Tutor</h1>
        <p className="mt-2 text-muted-foreground">Commit 선택 - AI 인터뷰 진입</p>

        {step === 'select' ? (
          <section className="mt-8 rounded-xl border p-6">
            <h2 className="text-xl font-semibold">1. 저장소/커밋 선택</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Repository</span>
                <select
                  className="w-full rounded-md border bg-white px-3 py-2"
                  value={selectedRepo}
                  disabled={reposLoading || repos.length === 0}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                >
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.fullName}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Commit</span>
                <select
                  className="w-full rounded-md border bg-white px-3 py-2"
                  value={selectedCommit}
                  disabled={commitsLoading || commits.length === 0}
                  onChange={(e) => setSelectedCommit(e.target.value)}
                >
                  {commits.map((commit) => (
                    <option key={commit.sha} value={commit.sha}>
                      {commit.shortSha} - {commit.message}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {reposLoading ? <p className="mt-3 text-sm">저장소 로딩 중...</p> : null}
            {reposError ? <p className="mt-3 text-sm text-red-600">저장소 오류: {reposError}</p> : null}
            {!reposLoading && !reposError && repos.length === 0 ? <p className="mt-3 text-sm">저장소가 없습니다.</p> : null}

            {commitsLoading ? <p className="mt-3 text-sm">커밋 로딩 중...</p> : null}
            {commitsError ? <p className="mt-3 text-sm text-red-600">커밋 오류: {commitsError}</p> : null}
            {!commitsLoading && !commitsError && selectedRepo && commits.length === 0 ? (
              <p className="mt-3 text-sm">선택한 저장소에 커밋이 없습니다.</p>
            ) : null}

            {diffLoading ? <p className="mt-3 text-sm">Diff 로딩 중...</p> : null}
            {diffError ? <p className="mt-3 text-sm text-red-600">Diff 오류: {diffError}</p> : null}
            {!diffLoading && !diffError && selectedCommit && diffFiles.length === 0 ? (
              <p className="mt-3 text-sm">Diff 파일이 없습니다.</p>
            ) : null}

            {!diffLoading && diffFiles.length > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">변경 파일 {diffFiles.length}개</p>
            ) : null}

            <button
              className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={!selectedRepo || !selectedCommit || reposLoading || commitsLoading}
              onClick={() => setStep('interview')}
            >
              인터뷰 시작
            </button>
          </section>
        ) : (
          <section className="mt-8 rounded-xl border p-6">
            <h2 className="text-xl font-semibold">2. AI 튜터 인터뷰 룸</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedRepo} / {selectedCommit.slice(0, 7)}
            </p>

            <div className="mt-4 rounded-md bg-muted p-4">
              <p className="font-medium">Q. 왜 이 커밋에서 이 구현 방식을 선택했나요?</p>
            </div>

            <textarea
              className="mt-4 h-36 w-full rounded-md border bg-white px-3 py-2"
              placeholder="답변을 입력하세요"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />

            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <button className="rounded-md border px-3 py-2">답변 제출</button>
              <button className="rounded-md border px-3 py-2">힌트 보기</button>
              <button className="rounded-md border px-3 py-2">모르겠어요(해설)</button>
              <button className="rounded-md border px-3 py-2">질문 스킵</button>
            </div>

            <button className="mt-4 text-sm underline" onClick={() => setStep('select')}>
              커밋 선택으로 돌아가기
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
