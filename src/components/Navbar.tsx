import React from 'react';
import { LogIn, LogOut, PenSquare, User, Home, Search, ShieldAlert, Bell } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { cn } from '../lib/utils';
import { UserProfile, Notification } from '../types';

const formatDate = (date: any) => {
  if (date && typeof date.toDate === 'function') {
    return date.toDate().toLocaleDateString();
  }
  return 'Just now';
};

interface NavbarProps {
  user: any;
  userProfile: UserProfile | null;
  onNavigate: (page: string) => void;
  currentPage: string;
  onOpenLogin: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  notifications: Notification[];
  isNotificationsOpen: boolean;
  onToggleNotifications: () => void;
}

export default function Navbar({ user, userProfile, onNavigate, currentPage, onOpenLogin, searchQuery, onSearchChange, notifications, isNotificationsOpen, onToggleNotifications }: NavbarProps) {
  const handleLogout = async () => {
    try {
      await signOut(auth);
      onNavigate('home');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="glass-nav">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8 lg:gap-12">
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 text-2xl font-black tracking-tighter text-gray-900 dark:text-white"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-lg">B</div>
            <span className="hidden sm:inline">Blogify</span>
          </button>
          
          <div className="hidden items-center gap-6 md:flex">
            <button 
              onClick={() => onNavigate('home')}
              className={cn(
                "text-sm font-medium transition-colors hover:text-black dark:hover:text-white",
                currentPage === 'home' ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400"
              )}
            >
              Home
            </button>
            <button 
              onClick={() => onNavigate('explore')}
              className={cn(
                "text-sm font-medium transition-colors hover:text-black dark:hover:text-white",
                currentPage === 'explore' ? "text-black dark:text-white" : "text-gray-500 dark:text-gray-400"
              )}
            >
              Explore
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 max-w-md">
          <div className="relative w-full group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search stories, authors, tags..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50/50 py-2 pl-11 pr-4 text-sm font-medium focus:border-purple-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-0 dark:border-gray-800 dark:bg-gray-900/50 dark:text-white dark:focus:border-purple-500 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <button 
                onClick={() => onNavigate('write')}
                className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium transition-all hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
              >
                <PenSquare className="h-4 w-4" />
                <span>Write</span>
              </button>
              <div className="relative">
                <button 
                  onClick={onToggleNotifications}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                >
                  <Bell className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
                {isNotificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:bg-gray-900 dark:border-gray-800 z-50">
                    <div className="px-4 py-2 text-sm font-black text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">Notifications</div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">No notifications</div>
                      ) : (
                        notifications.map(notif => (
                          <div key={notif.id} className={cn("p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all", !notif.read && "bg-purple-50 dark:bg-purple-900/10")}>
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{notif.actorName} {notif.type === 'like' ? 'liked your post' : notif.type === 'comment' ? 'commented on your post' : 'followed you'}</p>
                            <p className="text-xs text-gray-500">{formatDate(notif.createdAt)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative group">
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 overflow-hidden border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="h-5 w-5 text-gray-500" />
                  )}
                </button>
                <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-gray-200 bg-white p-1 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all dark:bg-gray-900 dark:border-gray-800">
                  <button 
                    onClick={() => onNavigate('dashboard')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Home className="h-4 w-4" />
                    Dashboard
                  </button>
                  {userProfile?.role === 'admin' && (
                    <button 
                      onClick={() => onNavigate('admin-dashboard')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      Admin Dashboard
                    </button>
                  )}
                  <button 
                    onClick={() => onNavigate('profile')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <User className="h-4 w-4" />
                    Profile Settings
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            </>
          ) : (
            <button 
              onClick={onOpenLogin}
              className="flex items-center gap-2 rounded-full bg-black px-6 py-2 text-sm font-medium text-white transition-all hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
