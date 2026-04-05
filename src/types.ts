import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
  role: 'admin' | 'user';
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  socialLinks?: {
    twitter?: string;
    github?: string;
    website?: string;
  };
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  tags: string[];
  coverImage?: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  readingTime?: number;
}

export interface Comment {
  id: string;
  postId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  createdAt: Timestamp;
  isReported?: boolean;
  isRemoved?: boolean;
  reportCount?: number;
  repliesCount?: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'like' | 'comment' | 'follow';
  actorId: string;
  actorName: string;
  actorPhoto?: string;
  postId?: string;
  postTitle?: string;
  createdAt: Timestamp;
  read: boolean;
}

export interface CommentReport {
  id: string;
  commentId: string;
  commentContent: string;
  postId: string;
  reporterId: string;
  reason: string;
  createdAt: Timestamp;
  status: 'pending' | 'resolved' | 'dismissed';
}

export interface Tag {
  name: string;
  count: number;
}
