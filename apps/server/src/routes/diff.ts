import { Router } from 'express';

const GITHUB_API_BASE = 'https://api.github.com';

type GithubCommitFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

type GithubCommitDetail = {
  sha: string;
  commit: {
    message: string;
  };
  files?: GithubCommitFile[];
};

export const diffRouter = Router();

diffRouter.get('/', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = req.query.repo;
  const sha = req.query.sha;

  if (typeof repo !== 'string' || repo.trim().length === 0 || typeof sha !== 'string' || sha.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_QUERY',
        message: 'Query parameters "repo" and "sha" are required.'
      }
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/commits/${sha}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: {
          code: 'GITHUB_API_ERROR',
          message: `Failed to fetch commit diff: ${response.status}`
        }
      });
    }

    const detail = (await response.json()) as GithubCommitDetail;
    const files = (detail.files ?? []).slice(0, 80);

    return res.json({
      success: true,
      data: {
        repo,
        sha: detail.sha,
        message: detail.commit.message,
        files: files.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: (file.patch ?? '').slice(0, 8000)
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unexpected error'
      }
    });
  }
});
