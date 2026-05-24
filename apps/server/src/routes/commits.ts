import { Router } from 'express';

const GITHUB_API_BASE = 'https://api.github.com';

type GithubCommit = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  html_url: string;
};

export const commitsRouter = Router();

commitsRouter.get('/', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = req.query.repo;

  if (typeof repo !== 'string' || repo.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REPO',
        message: 'Query parameter "repo" is required. Example: repo=owner/name'
      }
    });
  }

  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/commits?per_page=30`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: {
          code: 'GITHUB_API_ERROR',
          message: `Failed to fetch commits: ${response.status}`
        }
      });
    }

    const commits = (await response.json()) as GithubCommit[];

    return res.json({
      success: true,
      data: commits.map((item) => ({
        sha: item.sha,
        shortSha: item.sha.slice(0, 7),
        message: item.commit.message.split('\n')[0],
        authorName: item.commit.author.name,
        committedAt: item.commit.author.date,
        url: item.html_url
      }))
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
