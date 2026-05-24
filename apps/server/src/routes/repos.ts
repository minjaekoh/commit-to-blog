import { Router } from 'express';

const GITHUB_API_BASE = 'https://api.github.com';

type GithubRepo = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
};

export const reposRouter = Router();

reposRouter.get('/', async (_req, res) => {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'GITHUB_TOKEN_REQUIRED',
        message: 'GITHUB_TOKEN is required to fetch repository list.'
      }
    });
  }

  try {
    const response = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: {
          code: 'GITHUB_API_ERROR',
          message: `Failed to fetch repositories: ${response.status}`
        }
      });
    }

    const repos = (await response.json()) as GithubRepo[];

    return res.json({
      success: true,
      data: repos.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch
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
