import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { X, Mail, Lock, User, Loader2, Chrome } from 'lucide-react';
import { cn } from '../lib/utils';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName });
        
        // Create user profile in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName,
          email,
          photoURL: null,
          createdAt: serverTimestamp(),
          role: 'user'
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] glass-card animate-in fade-in zoom-in duration-300">
        <button 
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full glass p-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-10">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
              {isSignUp ? 'Create account' : 'Welcome back'}
            </h2>
            <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              {isSignUp ? 'Join our community of writers' : 'Sign in to continue your journey'}
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-white/50 py-3.5 pl-11 pr-4 text-sm font-medium focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                    placeholder="John Doe"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/20 bg-white/50 py-3.5 pl-11 pr-4 text-sm font-medium focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/20 bg-white/50 py-3.5 pl-11 pr-4 text-sm font-medium focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 text-sm font-black text-white transition-all hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 disabled:opacity-50 shadow-xl hover:scale-[1.02] active:scale-95"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/20" />
            <span className="text-[10px] font-black tracking-widest text-gray-400">OR</span>
            <div className="h-px flex-1 bg-white/20" />
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-2xl glass py-4 text-sm font-bold text-gray-700 dark:text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <Chrome className="h-5 w-5" />
            Continue with Google
          </button>

          <p className="mt-10 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-black text-purple-600 hover:text-purple-500 dark:text-purple-400 transition-colors"
            >
              {isSignUp ? 'Sign In' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
