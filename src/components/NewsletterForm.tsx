import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail } from 'lucide-react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe');
      }

      toast.success(data.message || 'Successfully subscribed!');
      setEmail('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to subscribe');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <h3 className="text-xl font-black text-gray-900 dark:text-white">Subscribe to our newsletter</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Get the latest posts delivered to your inbox.</p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3.5 pl-12 pr-4 text-sm font-medium outline-none focus:border-purple-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:bg-slate-900 transition-all"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-2xl bg-black px-8 py-3.5 text-sm font-black text-white transition-all hover:scale-[1.02] active:scale-95 dark:bg-white dark:text-black disabled:opacity-50 shadow-lg"
        >
          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Subscribe'}
        </button>
      </form>
    </div>
  );
}
