import { Router } from 'express';
import { Types } from 'mongoose';

import { PostModel, UserModel } from '../models';

const DEFAULT_USER = { githubUserId: 'local-dev-user', username: 'local-dev-user' };

export const postsRouter = Router();

async function getOrCreateDefaultUser() {
  const existing = await UserModel.findOne({ githubUserId: DEFAULT_USER.githubUserId });
  if (existing) return existing;
  return UserModel.create(DEFAULT_USER);
}

postsRouter.post('/', async (req, res) => {
  try {
    const { sessionId, repoFullName, commitSha, title, contentMarkdown, status, tags } = req.body as {
      sessionId?: string;
      repoFullName?: string;
      commitSha?: string;
      title?: string;
      contentMarkdown?: string;
      status?: 'draft' | 'published';
      tags?: string[];
    };

    if (!repoFullName || !commitSha || !title || !contentMarkdown) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'repoFullName, commitSha, title, contentMarkdown are required.' } });
    }

    const user = await getOrCreateDefaultUser();

    const post = await PostModel.create({
      userId: user._id,
      sessionId: sessionId && Types.ObjectId.isValid(sessionId) ? new Types.ObjectId(sessionId) : undefined,
      repoFullName,
      commitSha,
      title,
      contentMarkdown,
      status: status ?? 'draft',
      tags: tags ?? [],
    });

    return res.status(201).json({ success: true, data: { id: String(post._id), status: post.status } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});

postsRouter.get('/', async (_req, res) => {
  try {
    const user = await getOrCreateDefaultUser();
    const posts = await PostModel.find({ userId: user._id }).sort({ updatedAt: -1 }).limit(50);

    return res.json({
      success: true,
      data: posts.map((post) => ({
        id: String(post._id),
        title: post.title,
        repoFullName: post.repoFullName,
        commitSha: post.commitSha,
        status: post.status,
        updatedAt: post.updatedAt,
        contentMarkdown: post.contentMarkdown,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' } });
  }
});
