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
      <form onSubmit={handleSubmit} className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full rounded-full border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-purple-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-black px-6 py-3 text-sm font-black text-white transition-all hover:scale-105 dark:bg-white dark:text-black disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Subscribe'}
        </button>
      </form>
    </div>
  );
}
