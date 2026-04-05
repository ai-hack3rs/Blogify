import React, { useState, useEffect } from 'react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, 
  deleteDoc, doc, serverTimestamp, increment, updateDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Comment, Post, CommentReport, UserProfile } from '../types';
import { formatDate } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { User, Send, Trash2, MessageSquare, Flag, AlertTriangle, Reply, X } from 'lucide-react';
import { toast } from 'sonner';

interface CommentSectionProps {
  postId: string;
  user: UserProfile | null;
}

export default function CommentSection({ postId, user }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  useEffect(() => {
    const path = `posts/${postId}/comments`;
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(commentsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please sign in to comment');
      return;
    }
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    const path = `posts/${postId}/comments`;
    try {
      const commentData: any = {
        postId,
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous',
        authorPhoto: user.photoURL || '',
        content: newComment,
        createdAt: serverTimestamp(),
      };

      if (replyingTo) {
        commentData.parentId = replyingTo.id;
      }

      await addDoc(collection(db, 'posts', postId, 'comments'), commentData);
      
      // Update comment count on post
      await updateDoc(doc(db, 'posts', postId), {
        commentsCount: increment(1)
      });

      if (replyingTo) {
        await updateDoc(doc(db, 'posts', postId, 'comments', replyingTo.id), {
          repliesCount: increment(1)
        });
      }

      setNewComment('');
      setReplyingTo(null);
      toast.success(replyingTo ? 'Reply added!' : 'Comment added!');
    } catch (error) {
      console.error('Error adding comment:', error);
      handleFirestoreError(error, OperationType.WRITE, path);
      toast.error('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string, parentId?: string) => {
    const path = `posts/${postId}/comments/${commentId}`;
    try {
      await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
      await updateDoc(doc(db, 'posts', postId), {
        commentsCount: increment(-1)
      });
      if (parentId) {
        await updateDoc(doc(db, 'posts', postId, 'comments', parentId), {
          repliesCount: increment(-1)
        });
      }
      toast.success('Comment deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
      toast.error('Failed to delete comment');
    }
  };

  const handleReport = async (comment: Comment) => {
    if (!user) {
      toast.error('Please sign in to report a comment');
      return;
    }

    const reason = window.prompt('Reason for reporting this comment:');
    if (!reason) return;

    try {
      const reportId = `${user.uid}_${comment.id}`;
      const reportRef = doc(db, 'reports', reportId);
      
      await setDoc(reportRef, {
        commentId: comment.id,
        commentContent: comment.content,
        postId: postId,
        reporterId: user.uid,
        reason: reason,
        createdAt: serverTimestamp(),
        status: 'pending'
      });

      await updateDoc(doc(db, 'posts', postId, 'comments', comment.id), {
        isReported: true,
        reportCount: increment(1)
      });

      toast.success('Comment reported. Thank you for helping keep our community safe.');
    } catch (error) {
      console.error('Error reporting comment:', error);
      handleFirestoreError(error, OperationType.WRITE, 'reports/' + comment.id);
      toast.error('Failed to report comment');
    }
  };

  const buildCommentTree = (allComments: Comment[]) => {
    const commentMap = new Map<string, Comment & { replies: any[] }>();
    const roots: any[] = [];

    allComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    allComments.forEach(comment => {
      const commentWithReplies = commentMap.get(comment.id)!;
      if (comment.parentId && commentMap.has(comment.parentId)) {
        commentMap.get(comment.parentId)!.replies.push(commentWithReplies);
      } else {
        roots.push(commentWithReplies);
      }
    });

    return roots;
  };

  const commentTree = buildCommentTree(comments.filter(c => !c.isRemoved));

  const CommentItem = ({ comment, depth = 0 }: { comment: any, depth?: number }) => (
    <div className={`space-y-6 ${depth > 0 ? 'ml-8 border-l border-white/10 pl-8' : ''}`}>
      <div className="group flex gap-5">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-2xl glass">
          {comment.authorPhoto ? (
            <img src={comment.authorPhoto} alt={comment.authorName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User className="h-full w-full p-2 text-gray-400" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-gray-900 dark:text-white">{comment.authorName}</span>
              <span className="text-[10px] font-medium text-gray-400">{formatDate(comment.createdAt)}</span>
              {comment.isReported && (
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  Under Review
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 opacity-0 transition-all group-hover:opacity-100">
              {user && (
                <button 
                  onClick={() => setReplyingTo(comment)}
                  className="text-gray-400 hover:text-purple-500 hover:scale-110 transition-all"
                  title="Reply"
                >
                  <Reply className="h-4 w-4" />
                </button>
              )}
              {user && user.uid !== comment.authorId && (
                <button 
                  onClick={() => handleReport(comment)}
                  className="text-gray-400 hover:text-amber-500 hover:scale-110 transition-all"
                  title="Report comment"
                >
                  <Flag className="h-4 w-4" />
                </button>
              )}
              {(user?.uid === comment.authorId || user?.role === 'admin') && (
                <button 
                  onClick={() => handleDelete(comment.id, comment.parentId)}
                  className="text-gray-400 hover:text-red-500 hover:scale-110 transition-all"
                  title="Delete comment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400 font-medium">{comment.content}</p>
        </div>
      </div>
      {comment.replies.length > 0 && (
        <div className="space-y-6">
          {comment.replies.map((reply: any) => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-16 space-y-10 border-t border-white/10 pt-16">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-purple-500" />
        <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
          Discussion ({comments.filter(c => !c.isRemoved).length})
        </h3>
      </div>

      <div className="space-y-6">
        {replyingTo && (
          <div className="flex items-center justify-between rounded-2xl bg-purple-500/10 px-5 py-3 border border-purple-500/20">
            <div className="flex items-center gap-2 text-sm font-bold text-purple-600 dark:text-purple-400">
              <Reply className="h-4 w-4" />
              Replying to <span className="font-black">{replyingTo.authorName}</span>
            </div>
            <button 
              onClick={() => setReplyingTo(null)}
              className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl glass">
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || ''} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="h-full w-full p-2.5 text-gray-400" />
            )}
          </div>
          <div className="flex-1 space-y-4">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={replyingTo ? "Write a reply..." : "Add to the discussion..."}
              className="w-full rounded-3xl border border-white/20 bg-white/50 p-5 text-base font-medium focus:border-purple-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
              rows={3}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !newComment.trim()}
                className="flex items-center gap-2 rounded-full bg-black px-8 py-3 text-sm font-black text-white transition-all hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 disabled:opacity-50 shadow-xl hover:scale-105 active:scale-95"
              >
                <Send className="h-4 w-4" />
                {replyingTo ? 'Post Reply' : 'Post Comment'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="space-y-10">
        {commentTree.map((comment) => (
          <CommentItem key={comment.id} comment={comment} />
        ))}
      </div>
    </div>
  );
}
