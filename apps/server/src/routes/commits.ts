import { Router } from 'express';

const GITHUB_API_BASE = 'https://api.github.com';

type GithubBranch = { name: string };

type GithubCommit = {
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  html_url: string;
};

export const commitsRouter = Router();

commitsRouter.get('/branches', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = req.query.repo;
  if (typeof repo !== 'string' || repo.trim().length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_REPO', message: 'repo is required.' } });
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/branches?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) return res.status(response.status).json({ success: false, error: { code: 'GITHUB_API_ERROR', message: `Failed to fetch branches: ${response.status}` } });
  const branches = (await response.json()) as GithubBranch[];
  return res.json({ success: true, data: branches.map((b) => b.name) });
});

commitsRouter.get('/', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = req.query.repo;
  const branch = req.query.branch;

  if (typeof repo !== 'string' || repo.trim().length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_REPO', message: 'Query parameter "repo" is required.' } });
  }

  const shaParam = typeof branch === 'string' && branch.trim().length > 0 ? `&sha=${encodeURIComponent(branch)}` : '';
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/commits?per_page=30${shaParam}`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-GitHub-Api-Version': '2022-11-28' },
  });

  if (!response.ok) return res.status(response.status).json({ success: false, error: { code: 'GITHUB_API_ERROR', message: `Failed to fetch commits: ${response.status}` } });
  const commits = (await response.json()) as GithubCommit[];
  return res.json({ success: true, data: commits.map((item) => ({ sha: item.sha, shortSha: item.sha.slice(0, 7), message: item.commit.message.split('\n')[0], authorName: item.commit.author.name, committedAt: item.commit.author.date, url: item.html_url })) });
});
