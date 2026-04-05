import React from 'react';
import { Post } from '../types';
import { formatDate, cn } from '../lib/utils';
import { User, Tag, Clock, Heart, Bookmark } from 'lucide-react';

interface PostCardProps {
  post: Post;
  onClick: (postId: string) => void;
  isBookmarked?: boolean;
  onBookmark?: (e: React.MouseEvent) => void;
  onAuthorClick?: (e: React.MouseEvent) => void;
}

export default function PostCard({ post, onClick, isBookmarked, onBookmark, onAuthorClick }: PostCardProps) {
  return (
    <article 
      onClick={() => onClick(post.id)}
      className="group cursor-pointer overflow-hidden rounded-3xl glass-card p-6 transition-all relative"
    >
      {onBookmark && (
        <button
          onClick={onBookmark}
          className={cn(
            "absolute right-6 top-6 z-10 rounded-full glass p-2.5 transition-all hover:scale-110 active:scale-95 shadow-lg",
            isBookmarked ? "text-purple-600 dark:text-purple-400 bg-purple-500/10" : "text-gray-400 hover:text-purple-500"
          )}
        >
          <Bookmark className={cn("h-5 w-5", isBookmarked && "fill-current")} />
        </button>
      )}
      <div className="flex flex-col gap-8 md:flex-row md:items-center">
        <div className="flex-1 space-y-4">
          <div 
            onClick={onAuthorClick}
            className={cn(
              "flex items-center gap-3 w-fit",
              onAuthorClick && "hover:opacity-80 transition-opacity"
            )}
          >
            <div className="h-8 w-8 overflow-hidden rounded-full glass">
              {post.authorPhoto ? (
                <img src={post.authorPhoto} alt={post.authorName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="h-full w-full p-1.5 text-gray-400" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-900 dark:text-white">{post.authorName}</span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{formatDate(post.createdAt)}</span>
            </div>
          </div>

          <h2 className="text-2xl font-black leading-tight text-gray-900 group-hover:text-purple-600 dark:text-white dark:group-hover:text-purple-400 md:text-3xl transition-colors">
            {post.title}
          </h2>

          <p className="line-clamp-2 text-base leading-relaxed text-gray-600 dark:text-gray-400">
            {post.content.replace(/<[^>]*>/g, '').substring(0, 160)}...
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              {post.tags?.slice(0, 3).map((tag) => (
                <span 
                  key={tag} 
                  className="rounded-full glass px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {post.readingTime || 0} min
              </span>
              <span className="flex items-center gap-1.5">
                <Heart className="h-4 w-4 text-red-500" />
                {post.likesCount || 0}
              </span>
            </div>
          </div>
        </div>

        {post.coverImage && (
          <div className="relative h-56 w-full shrink-0 overflow-hidden rounded-2xl glass md:h-48 md:w-72">
            <div className="absolute inset-0 z-10 bg-black/0 transition-colors duration-500 group-hover:bg-black/20" />
            <img 
              src={post.coverImage} 
              alt={post.title} 
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>
    </article>
  );
}
