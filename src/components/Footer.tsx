import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe');
      }

      setStatus('success');
      setEmail('');
      toast.success('Successfully subscribed to the newsletter!');
      
      // Reset success state after a few seconds
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    } catch (error: any) {
      console.error('Subscription error:', error);
      setStatus('error');
      setErrorMessage(error.message || 'Something went wrong. Please try again.');
      toast.error(error.message || 'Failed to subscribe');
    }
  };

  return (
    <footer className="mt-20 border-t border-white/10 bg-white/50 dark:bg-black/50 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-16 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-8">
          
          {/* Brand & Description */}
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
              Blogify
            </h2>
            <p className="text-base leading-relaxed text-gray-600 dark:text-gray-400 max-w-md">
              Share your stories, ideas, and expertise with the world. Join our community of writers and readers today.
            </p>
          </div>

          {/* Newsletter Form */}
          <div className="flex flex-col gap-4 lg:items-end">
            <div className="w-full max-w-md space-y-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Subscribe to our newsletter
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get the latest posts and updates delivered directly to your inbox.
              </p>
              
              <form onSubmit={handleSubmit} className="relative mt-4 flex items-center">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  disabled={status === 'loading' || status === 'success'}
                  className="w-full rounded-2xl border border-gray-200 bg-white/50 px-5 py-4 pr-32 text-sm outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-white/10 dark:bg-black/50 dark:text-white dark:focus:border-purple-400"
                />
                <button
                  type="submit"
                  disabled={status === 'loading' || status === 'success' || !email}
                  className={cn(
                    "absolute right-2 top-2 bottom-2 flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition-all",
                    status === 'success' ? "bg-green-500" : "bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                  )}
                >
                  {status === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : status === 'success' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Done</span>
                    </>
                  ) : (
                    <>
                      <span>Subscribe</span>
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
              
              {status === 'error' && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {errorMessage}
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-12 border-t border-gray-200/20 dark:border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Blogify. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400">
            <a href="#" className="hover:text-purple-500 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-purple-500 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
