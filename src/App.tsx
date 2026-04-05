import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser, updateProfile, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, where, getDoc, setDoc,
  limit, startAfter, increment, getDocs, getDocFromServer
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import { Post, UserProfile, CommentReport, Notification } from './types';
import { slugify, cn, formatDate, calculateReadingTime } from './lib/utils';
import { summarizeContent, improveWriting, suggestTags, generateCoverImage, suggestTitles } from './services/gemini';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import Navbar from './components/Navbar';
import PostCard from './components/PostCard';
import Editor from './components/Editor';
import LoginModal from './components/LoginModal';
import CommentSection from './components/CommentSection';
import AdSense from './components/AdSense';
import { PostCardSkeleton } from './components/Skeleton';
import { 
  Plus, ArrowLeft, Trash2, Save, Eye, EyeOff, Sparkles, Wand2,
  Tag as TagIcon, Image as ImageIcon, Loader2, User as UserIcon,
  Clock, ChevronRight, Bookmark, PenSquare, Search, Moon, Sun,
  Heart, Share2, MessageCircle, MoreHorizontal, AlertTriangle,
  Users, ShieldAlert, FileText, Home, Twitter, Facebook, Linkedin,
  Type, Bell
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Toaster, toast } from 'sonner';
import debounce from 'lodash.debounce';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong. Please try refreshing the page.";
      try {
        const errInfo = JSON.parse(this.state.error.message);
        if (errInfo.error.includes('Missing or insufficient permissions')) {
          message = "You don't have permission to perform this action. Please make sure you are signed in correctly.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-white p-4 dark:bg-black">
          <div className="glass max-w-md rounded-[3rem] p-12 text-center border border-white/20 shadow-2xl">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10">
              <AlertTriangle className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Oops!</h2>
            <p className="mt-4 text-lg font-medium text-gray-500 dark:text-gray-400">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-8 rounded-full bg-black px-8 py-3 text-sm font-black text-white dark:bg-white dark:text-black hover:scale-105 transition-transform shadow-xl"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type Page = 'home' | 'explore' | 'write' | 'dashboard' | 'post' | 'edit' | 'profile' | 'public-profile' | 'admin-dashboard' | '404';

const ReadingProgressBar = () => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 z-[100] h-1 w-full bg-gray-100 dark:bg-gray-800">
      <div 
        className="h-full bg-gradient-to-r from-purple-600 to-blue-600 transition-all duration-150"
        style={{ width: `${scrollProgress}%` }}
      />
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [isSuggestingTitles, setIsSuggestingTitles] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [following, setFollowing] = useState<string[]>([]);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [homeActiveTab, setHomeActiveTab] = useState<'for-you' | 'following'>('for-you');
  const [readingFontSize, setReadingFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('lg');
  const [isReadingSettingsOpen, setIsReadingSettingsOpen] = useState(false);

  const [exploreActiveCategory, setExploreActiveCategory] = useState('All');
  const [dashboardActiveTab, setDashboardActiveTab] = useState<'stories' | 'drafts' | 'bookmarks' | 'moderation'>('stories');
  const [userDrafts, setUserDrafts] = useState<Post[]>([]);
  const [dashboardReports, setDashboardReports] = useState<CommentReport[]>([]);
  const [adminActiveTab, setAdminActiveTab] = useState<'users' | 'posts' | 'reports'>('users');
  const [adminAllUsers, setAdminAllUsers] = useState<UserProfile[]>([]);
  const [adminAllReports, setAdminAllReports] = useState<CommentReport[]>([]);
  const [adminUserSearchQuery, setAdminUserSearchQuery] = useState('');
  const [adminConfirmDelete, setAdminConfirmDelete] = useState<{ type: 'user' | 'post', id: string, name: string } | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const handleNavigate = (page: string) => {
    setCurrentPage(page as Page);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (currentPage === 'dashboard' && dashboardActiveTab === 'moderation' && userProfile?.role === 'admin') {
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setDashboardReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as CommentReport[]);
      });
      return () => unsubscribe();
    }
  }, [currentPage, dashboardActiveTab, userProfile]);

  useEffect(() => {
    if (currentPage === 'public-profile' && selectedProfile) {
      const unsubscribe = onSnapshot(doc(db, 'users', selectedProfile.uid), (doc) => {
        if (doc.exists()) {
          setSelectedProfile(doc.data() as UserProfile);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users/' + selectedProfile.uid);
      });
      return () => unsubscribe();
    }
  }, [currentPage, selectedProfile?.uid]);

  useEffect(() => {
    if (currentPage === 'admin-dashboard') {
      if (userProfile?.role !== 'admin') {
        setCurrentPage('home');
        return;
      }

      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAdminAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[]);
      });

      const unsubReports = onSnapshot(
        query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
        (snapshot) => {
          setAdminAllReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as CommentReport[]);
        }
      );

      return () => {
        unsubUsers();
        unsubReports();
      };
    }
  }, [currentPage, userProfile]);

  const handleImageUpload = async (file: File) => {
    if (!user) return null;
    const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Form state for new/edit post
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    tags: '',
    coverImage: '',
    published: true
  });

  const [profileFormData, setProfileFormData] = useState({
    displayName: '',
    photoURL: '',
    bio: '',
    twitter: '',
    github: '',
    website: ''
  });

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          setProfileFormData({
            displayName: data.displayName || '',
            photoURL: data.photoURL || '',
            bio: data.bio || '',
            twitter: data.socialLinks?.twitter || '',
            github: data.socialLinks?.github || '',
            website: data.socialLinks?.website || ''
          });
        }
      };
      fetchProfile();
    }
  }, [user]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
          toast.error("Firebase connection failed. Please check your configuration.");
        }
      }
    }
    testConnection();

    // Fetch user profile and ensure it exists
    let unsubscribeProfile: (() => void) | undefined;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Initial setup if profile doesn't exist
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Anonymous',
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || '',
              createdAt: serverTimestamp() as any,
              role: 'user',
              followersCount: 0,
              followingCount: 0
            };
            await setDoc(userRef, newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + firebaseUser.uid);
        }

        // Listen for profile changes
        unsubscribeProfile = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setUserProfile(doc.data() as UserProfile);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'users/' + firebaseUser.uid);
        });
      } else {
        setUserProfile(null);
        if (unsubscribeProfile) unsubscribeProfile();
      }
      setLoading(false);
    });

    // Fetch user bookmarks
    let unsubscribeBookmarks: (() => void) | undefined;
    if (user) {
      const path = 'users/' + user.uid + '/bookmarks';
      const q = query(collection(db, path));
      unsubscribeBookmarks = onSnapshot(q, (snapshot) => {
        setBookmarks(snapshot.docs.map(doc => doc.id));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      });
    } else {
      setBookmarks([]);
    }

    // Fetch following
    let unsubscribeFollowing: (() => void) | undefined;
    let unsubscribeDrafts: (() => void) | undefined;
    let unsubscribeNotifications: (() => void) | undefined;
    if (user) {
      const path = 'users/' + user.uid + '/following';
      const q = query(collection(db, path));
      unsubscribeFollowing = onSnapshot(q, (snapshot) => {
        setFollowing(snapshot.docs.map(doc => doc.id));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      });

      const draftsPath = 'posts';
      const draftsQ = query(
        collection(db, draftsPath),
        where('authorId', '==', user.uid),
        where('published', '==', false),
        orderBy('createdAt', 'desc')
      );
      unsubscribeDrafts = onSnapshot(draftsQ, (snapshot) => {
        setUserDrafts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, draftsPath);
      });

      const notifPath = 'users/' + user.uid + '/notifications';
      const notifQ = query(
        collection(db, notifPath),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      unsubscribeNotifications = onSnapshot(notifQ, (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, notifPath);
      });
    } else {
      setFollowing([]);
      setUserDrafts([]);
      setNotifications([]);
    }

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeBookmarks) unsubscribeBookmarks();
      if (unsubscribeFollowing) unsubscribeFollowing();
      if (unsubscribeDrafts) unsubscribeDrafts();
      if (unsubscribeNotifications) unsubscribeNotifications();
    };
  }, [user]);

  useEffect(() => {
    const path = 'posts';
    const q = query(
      collection(db, path), 
      where('published', '==', true),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setPosts(postsData);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 10);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, []);

  const followingStr = following.join(',');
  useEffect(() => {
    // Handle Email Link Auth
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            window.localStorage.removeItem('emailForSignIn');
            // Handle successful sign-in
            toast.success('Successfully signed in!');
          })
          .catch((error) => {
            toast.error('Error signing in with email link: ' + error.message);
          });
      }
    }
  }, []);

  useEffect(() => {
    if (!user || following.length === 0) {
      setFollowingPosts([]);
      setLoadingFollowing(false);
      return;
    }

    setLoadingFollowing(true);
    
    const chunks = [];
    for (let i = 0; i < following.length; i += 10) {
      chunks.push(following.slice(i, i + 10));
    }

    const allPosts = new Map<number, Post[]>();
    const unsubscribes = chunks.map((chunk, index) => {
      const q = query(
        collection(db, 'posts'),
        where('published', '==', true),
        where('authorId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      
      return onSnapshot(q, (snapshot) => {
        const postsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Post[];
        
        allPosts.set(index, postsData);
        
        const merged = Array.from(allPosts.values())
          .flat()
          .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
          .slice(0, 50);
          
        setFollowingPosts(merged);
        setLoadingFollowing(false);
      }, (error) => {
        console.error('Error fetching following posts:', error);
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, followingStr]);

  const fetchMorePosts = async () => {
    if (!lastVisible || isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    try {
      const q = query(
        collection(db, 'posts'),
        where('published', '==', true),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setPosts(prev => [...prev, ...postsData]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 10);
    } catch (error) {
      console.error('Error fetching more posts:', error);
      handleFirestoreError(error, OperationType.LIST, 'posts');
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.title || !formData.content) return;

    setIsSubmitting(true);
    try {
      const postData = {
        title: formData.title,
        slug: slugify(formData.title),
        content: formData.content,
        published: formData.published,
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous',
        authorPhoto: user.photoURL || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t !== ''),
        coverImage: formData.coverImage || `https://picsum.photos/seed/${formData.title}/1200/600`,
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        readingTime: calculateReadingTime(formData.content)
      };

      await addDoc(collection(db, 'posts'), postData);
      setFormData({ title: '', content: '', tags: '', coverImage: '', published: true });
      setCurrentPage('home');
    } catch (error) {
      console.error('Error creating post:', error);
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !selectedPost || !formData.title || !formData.content) return;

    setIsSubmitting(true);
    try {
      const postRef = doc(db, 'posts', selectedPost.id);
      await updateDoc(postRef, {
        title: formData.title,
        content: formData.content,
        published: formData.published,
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t !== ''),
        coverImage: formData.coverImage,
        updatedAt: serverTimestamp(),
        readingTime: calculateReadingTime(formData.content)
      });
      if (e) {
        toast.success('Story updated successfully!');
        setCurrentPage('dashboard');
      }
    } catch (error) {
      console.error('Error updating post:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'posts/' + selectedPost.id);
      if (e) toast.error('Failed to update story');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      await updateProfile(user, {
        displayName: profileFormData.displayName,
        photoURL: profileFormData.photoURL
      });

      await updateDoc(doc(db, 'users', user.uid), {
        displayName: profileFormData.displayName,
        photoURL: profileFormData.photoURL,
        bio: profileFormData.bio,
        socialLinks: {
          twitter: profileFormData.twitter,
          github: profileFormData.github,
          website: profileFormData.website
        },
        updatedAt: serverTimestamp()
      });

      // Manually update user state to trigger re-render
      setUser({ ...user, displayName: profileFormData.displayName, photoURL: profileFormData.photoURL } as FirebaseUser);
      
      toast.success('Profile updated successfully!');
      setCurrentPage('dashboard');
    } catch (error) {
      console.error('Error updating profile:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
      toast.error('Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAiGenerateImage = async () => {
    if (!formData.title) {
      toast.error('Please enter a title first to generate an image.');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const imageUrl = await generateCoverImage(formData.title);
      if (imageUrl) {
        setFormData(prev => ({ ...prev, coverImage: imageUrl }));
        toast.success('AI Cover Image generated!');
      }
    } catch (error) {
      console.error('Image generation failed:', error);
      toast.error('Failed to generate image');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleAiSuggestTags = async () => {
    if (!formData.title || !formData.content) {
      toast.error('Please enter a title and some content first.');
      return;
    }
    setIsSuggestingTags(true);
    try {
      const tags = await suggestTags(formData.title, formData.content);
      if (tags) {
        setFormData(prev => ({ ...prev, tags }));
        toast.success('AI Tag suggestions applied!');
      }
    } catch (error) {
      console.error('Tag suggestion failed:', error);
      toast.error('Failed to suggest tags');
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const handleSuggestTitles = async () => {
    if (!formData.content) {
      toast.error('Write some content first to get title suggestions');
      return;
    }
    setIsSuggestingTitles(true);
    try {
      const titles = await suggestTitles(formData.content);
      if (titles) {
        const titleList = titles.split(',').map(t => t.trim());
        toast.info('Title suggestions generated', {
          description: (
            <div className="mt-2 space-y-2">
              {titleList.map((t, i) => (
                <button 
                  key={i}
                  onClick={() => {
                    setFormData({ ...formData, title: t });
                    toast.dismiss();
                  }}
                  className="block w-full text-left text-xs font-medium hover:text-purple-600"
                >
                  {t}
                </button>
              ))}
            </div>
          )
        });
      }
    } catch (error) {
      console.error('Error suggesting titles:', error);
      toast.error('Failed to suggest titles');
    } finally {
      setIsSuggestingTitles(false);
    }
  };

  // Autosave logic
  const debouncedAutosave = useCallback(
    debounce(() => {
      if (currentPage === 'edit' && selectedPost) {
        handleUpdatePost();
        toast.info('Draft autosaved', { duration: 2000 });
      }
    }, 3000),
    [formData, selectedPost, currentPage]
  );

  useEffect(() => {
    if (currentPage === 'edit' && selectedPost) {
      debouncedAutosave();
    }
    return () => debouncedAutosave.cancel();
  }, [formData.content, formData.title]);

  const wordCount = formData.content.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(w => w !== '').length;

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
      if (selectedPost?.id === postId) {
        setCurrentPage('home');
        setSelectedPost(null);
      }
      toast.success('Post deleted');
    } catch (error) {
      console.error('Error deleting post:', error);
      handleFirestoreError(error, OperationType.DELETE, 'posts/' + postId);
    }
  };

  const renderHome = () => {
    const queryStr = searchQuery.toLowerCase().trim();
    const sourcePosts = homeActiveTab === 'following' ? followingPosts : posts;
    const filteredPosts = sourcePosts.filter(post => {
      // Then filter by search
      if (!queryStr) return true;
      return (
        post.title.toLowerCase().includes(queryStr) ||
        post.content.toLowerCase().includes(queryStr) ||
        post.authorName.toLowerCase().includes(queryStr) ||
        post.tags.some(tag => tag.toLowerCase().includes(queryStr))
      );
    });

    const trendingTags = Array.from(new Set(posts.flatMap(p => p.tags))).slice(0, 8);

    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-16 lg:flex-row">
          <div className="flex-1 space-y-16">
            <header className="text-left space-y-10">
              <div>
                <h1 className="text-5xl font-black tracking-tighter text-gray-900 dark:text-white md:text-7xl">
                  Stay <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Curious.</span>
                </h1>
                <p className="mt-6 max-w-2xl text-xl text-gray-600 dark:text-gray-400 font-medium">
                  Discover stories, thinking, and expertise from writers on any topic.
                </p>
              </div>

              <div className="flex items-center gap-8 border-b border-white/10">
                <button 
                  onClick={() => setHomeActiveTab('for-you')}
                  className={cn(
                    "pb-4 text-sm font-black uppercase tracking-widest transition-all relative",
                    homeActiveTab === 'for-you' ? "text-purple-600 dark:text-purple-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  )}
                >
                  For You
                  {homeActiveTab === 'for-you' && (
                    <motion.div layoutId="homeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 dark:bg-purple-400 rounded-full" />
                  )}
                </button>
                <button 
                  onClick={() => {
                    if (!user) {
                      toast.error('Please sign in to see your following feed');
                      setIsLoginModalOpen(true);
                      return;
                    }
                    setHomeActiveTab('following');
                  }}
                  className={cn(
                    "pb-4 text-sm font-black uppercase tracking-widest transition-all relative",
                    homeActiveTab === 'following' ? "text-purple-600 dark:text-purple-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  )}
                >
                  Following
                  {homeActiveTab === 'following' && (
                    <motion.div layoutId="homeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 dark:bg-purple-400 rounded-full" />
                  )}
                </button>
              </div>
            </header>

            {searchQuery && (
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                  Search results for "{searchQuery}"
                </h2>
                <span className="rounded-full glass px-4 py-1 text-sm font-black text-purple-600 dark:text-purple-400">
                  {filteredPosts.length} {filteredPosts.length === 1 ? 'result' : 'results'}
                </span>
              </div>
            )}

            <div className="grid gap-8">
              {(homeActiveTab === 'following' ? loadingFollowing : loading) ? (
                Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
              ) : filteredPosts.length > 0 ? (
                <>
                  {filteredPosts.map((post, i) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                    >
                      <PostCard 
                        post={post} 
                        isBookmarked={bookmarks.includes(post.id)}
                        onBookmark={(e) => handleBookmark(e, post.id)}
                        onAuthorClick={(e) => {
                          e.stopPropagation();
                          viewProfile(post.authorId);
                        }}
                        onClick={() => {
                          setSelectedPost(post);
                          handleViewCount(post.id);
                          setCurrentPage('post');
                        }} 
                      />
                    </motion.div>
                  ))}
                  {hasMore && !searchQuery && homeActiveTab === 'for-you' && (
                    <div className="flex justify-center pt-12">
                      <button 
                        onClick={fetchMorePosts}
                        disabled={isFetchingMore}
                        className="flex items-center gap-2 rounded-full glass px-8 py-3 text-sm font-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-xl"
                      >
                        {isFetchingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                        Load More Stories
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="glass-card rounded-[3rem] py-24 text-center relative overflow-hidden">
                  <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
                  <div className="relative z-10">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl glass bg-purple-500/5">
                      <Search className="h-10 w-10 text-purple-500" />
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                      {homeActiveTab === 'following' ? "Your following feed is empty" : "No stories found"}
                    </h3>
                    <p className="mx-auto mt-4 max-w-xs text-lg font-medium text-gray-500 dark:text-gray-400">
                      {homeActiveTab === 'following' 
                        ? "Follow some authors to see their latest stories here." 
                        : searchQuery 
                          ? `We couldn't find any stories matching "${searchQuery}". Try using different keywords or tags.`
                          : "Explore different topics to find stories you'll love."}
                    </p>
                    {homeActiveTab === 'following' ? (
                      <button 
                        onClick={() => setHomeActiveTab('for-you')}
                        className="mt-10 rounded-full bg-black px-8 py-3 text-sm font-black text-white dark:bg-white dark:text-black hover:scale-105 transition-transform shadow-xl"
                      >
                        Explore Authors
                      </button>
                    ) : searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="mt-10 rounded-full bg-black px-8 py-3 text-sm font-black text-white dark:bg-white dark:text-black hover:scale-105 transition-transform shadow-xl"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="w-full space-y-12 lg:w-80">
            <div className="sticky top-32 space-y-12">
              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Trending Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map(tag => (
                    <button 
                      key={tag}
                      onClick={() => setSearchQuery(tag)}
                      className="rounded-full glass px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-gray-600 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-all"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl glass-card p-8">
                <h3 className="text-lg font-black tracking-tight text-gray-900 dark:text-white">Write on Blogify</h3>
                <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Share your thinking with the world.</p>
                <button 
                  onClick={() => handleNavigate('write')}
                  className="mt-6 w-full rounded-full bg-black py-3 text-sm font-black text-white dark:bg-white dark:text-black hover:scale-105 transition-transform shadow-lg"
                >
                  Start writing
                </button>
              </div>

              <AdSense adSlot="1234567890" adFormat="vertical" />
            </div>
          </aside>
        </div>
      </div>
    );
  };

  const handleLike = async () => {
    if (!user || !selectedPost) {
      toast.error('Please sign in to like this story');
      return;
    }
    try {
      const likeRef = doc(db, 'posts', selectedPost.id, 'likes', user.uid);
      const likeSnap = await getDoc(likeRef);
      
      if (likeSnap.exists()) {
        await deleteDoc(likeRef);
        await updateDoc(doc(db, 'posts', selectedPost.id), {
          likesCount: increment(-1)
        });
      } else {
        await setDoc(likeRef, { uid: user.uid });
        await updateDoc(doc(db, 'posts', selectedPost.id), {
          likesCount: increment(1)
        });
        toast.success('Added to your likes');
      }
    } catch (error) {
      console.error('Error liking post:', error);
      handleFirestoreError(error, OperationType.WRITE, `posts/${selectedPost.id}/likes/${user.uid}`);
    }
  };

  const handleBookmark = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) {
      toast.error('Please sign in to bookmark stories');
      setIsLoginModalOpen(true);
      return;
    }
    try {
      const bookmarkRef = doc(db, 'users', user.uid, 'bookmarks', postId);
      const bookmarkSnap = await getDoc(bookmarkRef);
      
      if (bookmarkSnap.exists()) {
        await deleteDoc(bookmarkRef);
        toast.success('Removed from bookmarks');
      } else {
        await setDoc(bookmarkRef, { createdAt: serverTimestamp() });
        toast.success('Saved to bookmarks');
      }
    } catch (error) {
      console.error('Error bookmarking post:', error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/bookmarks/${postId}`);
    }
  };

  const handleViewCount = async (postId: string) => {
    try {
      await updateDoc(doc(db, 'posts', postId), {
        viewsCount: increment(1)
      });
    } catch (error) {
      console.error('Error updating view count:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'posts/' + postId);
    }
  };

  const handleFollow = async (profileId: string) => {
    if (!user) {
      toast.error('Please sign in to follow authors');
      setIsLoginModalOpen(true);
      return;
    }
    if (user.uid === profileId) return;

    try {
      const followRef = doc(db, 'users', user.uid, 'following', profileId);
      const followSnap = await getDoc(followRef);
      
      const userRef = doc(db, 'users', user.uid);
      const targetUserRef = doc(db, 'users', profileId);

      if (followSnap.exists()) {
        await deleteDoc(followRef);
        await updateDoc(userRef, { followingCount: increment(-1) });
        await updateDoc(targetUserRef, { followersCount: increment(-1) });
        toast.success('Unfollowed author');
      } else {
        await setDoc(followRef, { createdAt: serverTimestamp() });
        await updateDoc(userRef, { followingCount: increment(1) });
        await updateDoc(targetUserRef, { followersCount: increment(1) });
        toast.success('Following author');
      }
    } catch (error) {
      console.error('Error following author:', error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/following/${profileId}`);
    }
  };

  const viewProfile = async (uid: string) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        setSelectedProfile(userSnap.data() as UserProfile);
        setCurrentPage('public-profile');
        window.scrollTo(0, 0);
      }
    } catch (error) {
      console.error('Error viewing profile:', error);
      handleFirestoreError(error, OperationType.GET, 'users/' + uid);
    }
  };

  const renderPost = () => {
    if (!selectedPost) return renderNotFound();
    const readingTime = selectedPost.readingTime || calculateReadingTime(selectedPost.content);

    const fontSizeClasses = {
      sm: 'prose-sm',
      base: 'prose-base',
      lg: 'prose-lg',
      xl: 'prose-xl',
    };

    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 relative">
        {/* Floating Reading Settings */}
        <div className="fixed bottom-8 right-8 z-50">
          <div className="relative">
            <AnimatePresence>
              {isReadingSettingsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  className="absolute bottom-full right-0 mb-4 w-64 rounded-[2rem] glass p-6 shadow-2xl border border-white/20"
                >
                  <div className="space-y-6">
                    <div>
                      <div className="mb-3 text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Appearance</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDarkMode(false)}
                          className={cn(
                            "flex-1 rounded-xl p-3 transition-all flex flex-col items-center gap-2",
                            !darkMode ? "bg-white dark:bg-gray-800 shadow-lg scale-105" : "hover:bg-white/50 dark:hover:bg-gray-800/50"
                          )}
                        >
                          <Sun className={cn("h-5 w-5", !darkMode ? "text-orange-500" : "text-gray-400")} />
                          <span className="text-[10px] font-black uppercase tracking-tighter">Light</span>
                        </button>
                        <button
                          onClick={() => setDarkMode(true)}
                          className={cn(
                            "flex-1 rounded-xl p-3 transition-all flex flex-col items-center gap-2",
                            darkMode ? "bg-white dark:bg-gray-800 shadow-lg scale-105" : "hover:bg-white/50 dark:hover:bg-gray-800/50"
                          )}
                        >
                          <Moon className={cn("h-5 w-5", darkMode ? "text-purple-500" : "text-gray-400")} />
                          <span className="text-[10px] font-black uppercase tracking-tighter">Dark</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Font Size</div>
                      <div className="grid grid-cols-4 gap-2">
                        {(['sm', 'base', 'lg', 'xl'] as const).map((size) => (
                          <button
                            key={size}
                            onClick={() => setReadingFontSize(size)}
                            className={cn(
                              "rounded-xl p-2 text-sm font-black transition-all",
                              readingFontSize === size 
                                ? "bg-purple-600 text-white shadow-lg scale-110" 
                                : "glass text-gray-500 hover:bg-purple-500/10"
                            )}
                          >
                            {size.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={() => setIsReadingSettingsOpen(!isReadingSettingsOpen)}
              className={cn(
                "h-14 w-14 rounded-full glass shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-white/20",
                isReadingSettingsOpen ? "bg-purple-600 text-white rotate-90" : "text-gray-700 dark:text-gray-200"
              )}
            >
              <Type className="h-6 w-6" />
            </button>
          </div>
        </div>

        <button 
          onClick={() => setCurrentPage('home')}
          className="group mb-12 flex items-center gap-3 text-sm font-black uppercase tracking-widest text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-all"
        >
          <div className="rounded-full glass p-2 group-hover:scale-110 transition-transform">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to feed
        </button>

        <article className="glass p-8 sm:p-12 rounded-[3rem] border border-white/20 shadow-2xl relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
          
          <header className="relative mb-16 space-y-10">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div 
                onClick={() => viewProfile(selectedPost.authorId)}
                className="flex items-center gap-4 group cursor-pointer"
                role="button"
                tabIndex={0}
              >
                <div className="h-14 w-14 overflow-hidden rounded-2xl glass p-0.5 group-hover:scale-105 transition-transform">
                  {selectedPost.authorPhoto ? (
                    <img src={selectedPost.authorPhoto} alt={selectedPost.authorName} className="h-full w-full rounded-[0.9rem] object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon className="h-full w-full p-3 text-gray-400" />
                  )}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-black tracking-tight text-gray-900 dark:text-white group-hover:text-purple-600 transition-colors">{selectedPost.authorName}</div>
                    {user?.uid !== selectedPost.authorId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFollow(selectedPost.authorId);
                        }}
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-all",
                          following.includes(selectedPost.authorId)
                            ? "glass text-purple-600 dark:text-purple-400"
                            : "bg-purple-600 text-white hover:bg-purple-700"
                        )}
                      >
                        {following.includes(selectedPost.authorId) ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-purple-500" />
                      {readingTime} min read
                    </span>
                    <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                    <span>{formatDate(selectedPost.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={(e) => handleBookmark(e, selectedPost.id)}
                  className={cn(
                    "rounded-2xl glass p-3 transition-all hover:scale-110 active:scale-95 shadow-lg",
                    bookmarks.includes(selectedPost.id) ? "text-purple-600 dark:text-purple-400 bg-purple-500/10" : "text-gray-500"
                  )}
                  title="Bookmark story"
                >
                  <Bookmark className={cn("h-5 w-5", bookmarks.includes(selectedPost.id) && "fill-current")} />
                </button>
                <button 
                  onClick={handleLike}
                  className="flex items-center gap-2 rounded-2xl glass px-6 py-3 text-sm font-black text-gray-700 transition-all hover:bg-red-500/10 hover:text-red-600 dark:text-gray-300 dark:hover:text-red-400 hover:scale-105 active:scale-95 shadow-lg"
                  title="Like story"
                >
                  <Heart className={cn("h-5 w-5 transition-colors", selectedPost.likesCount ? "fill-red-500 text-red-500" : "")} />
                  {selectedPost.likesCount || 0}
                </button>
                <div 
                  className="flex items-center gap-2 rounded-2xl glass px-6 py-3 text-sm font-black text-gray-700 dark:text-gray-300 shadow-lg"
                  title="Comments"
                >
                  <MessageCircle className="h-5 w-5 text-blue-500" />
                  {selectedPost.commentsCount || 0}
                </div>
                
                <div className="flex items-center gap-2 rounded-[1.5rem] glass p-1.5 shadow-lg">
                  <button 
                    onClick={() => {
                      const url = window.location.href;
                      const text = `Check out this story: ${selectedPost.title}`;
                      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
                    }}
                    className="rounded-xl p-2 text-gray-500 hover:bg-blue-500/10 hover:text-blue-400 transition-all hover:scale-110"
                    title="Share on Twitter"
                  >
                    <Twitter className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => {
                      const url = window.location.href;
                      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                    }}
                    className="rounded-xl p-2 text-gray-500 hover:bg-blue-600/10 hover:text-blue-600 transition-all hover:scale-110"
                    title="Share on Facebook"
                  >
                    <Facebook className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => {
                      const url = window.location.href;
                      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
                    }}
                    className="rounded-xl p-2 text-gray-500 hover:bg-blue-700/10 hover:text-blue-700 transition-all hover:scale-110"
                    title="Share on LinkedIn"
                  >
                    <Linkedin className="h-5 w-5" />
                  </button>
                  <div className="h-4 w-[1px] bg-white/10 mx-1" />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success('Link copied to clipboard!');
                    }}
                    className="rounded-xl p-2 text-gray-500 hover:bg-purple-500/10 hover:text-purple-600 transition-all hover:scale-110"
                    title="Copy link"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <h1 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white sm:text-6xl leading-[1.1]">
              {selectedPost.title}
            </h1>

            {selectedPost.coverImage && (
              <div className="aspect-[21/9] w-full overflow-hidden rounded-[2.5rem] glass p-1.5 shadow-2xl">
                <img src={selectedPost.coverImage} alt={selectedPost.title} className="h-full w-full rounded-[2rem] object-cover" referrerPolicy="no-referrer" />
              </div>
            )}
          </header>

          <div 
            className={cn(
              "prose dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-p:font-serif prose-p:leading-relaxed prose-p:text-gray-600 dark:prose-p:text-gray-400",
              fontSizeClasses[readingFontSize]
            )}
            dangerouslySetInnerHTML={{ __html: selectedPost.content }} 
          />

          <AdSense adSlot="0987654321" />

          <footer className="mt-20 border-t border-white/10 pt-10">
            <div className="flex flex-wrap gap-3">
              {selectedPost.tags?.map(tag => (
                <span key={tag} className="rounded-2xl glass px-5 py-2 text-sm font-black text-purple-600 dark:text-purple-400 hover:scale-105 transition-transform cursor-default">
                  #{tag}
                </span>
              ))}
            </div>
          </footer>
        </article>

        <div className="mt-12">
          <CommentSection postId={selectedPost.id} user={userProfile} />
        </div>

        {posts.filter(p => p.id !== selectedPost.id && p.tags.some(t => selectedPost.tags.includes(t))).length > 0 && (
          <div className="mt-24 space-y-10">
            <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">More like this</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts
                .filter(p => p.id !== selectedPost.id && p.tags.some(t => selectedPost.tags.includes(t)))
                .slice(0, 3)
                .map(post => (
                <div 
                  key={post.id}
                  onClick={() => {
                    setSelectedPost(post);
                    handleViewCount(post.id);
                    window.scrollTo(0, 0);
                  }}
                  className="group cursor-pointer space-y-4"
                >
                  <div className="aspect-[16/9] overflow-hidden rounded-3xl glass p-1 shadow-lg group-hover:scale-105 transition-transform">
                    <img 
                      src={post.coverImage || `https://picsum.photos/seed/${post.id}/800/450`} 
                      alt={post.title} 
                      className="h-full w-full rounded-2xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <h3 className="text-lg font-black tracking-tight text-gray-900 dark:text-white group-hover:text-purple-600 transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <span>{post.authorName}</span>
                    <span className="h-1 w-1 rounded-full bg-gray-300" />
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEditor = (isEdit = false) => (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-12 flex items-center justify-between glass p-8 rounded-3xl">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            {isEdit ? 'Edit Story' : 'Write a Story'}
          </h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>{wordCount} words</span>
            <span>·</span>
            <span>{calculateReadingTime(formData.content)} min read</span>
          </div>
        </div>
        <button 
          onClick={() => setCurrentPage(isEdit ? 'dashboard' : 'home')}
          className="text-sm font-black uppercase tracking-widest text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white glass px-6 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95"
        >
          Cancel
        </button>
      </header>

      <div className="glass p-8 sm:p-12 rounded-[3rem] space-y-10 border border-white/20 shadow-2xl">

      <form onSubmit={isEdit ? handleUpdatePost : handleCreatePost} className="space-y-10">
        <div className="space-y-6">
          <div className="relative group">
            <input
              type="text"
              placeholder="Title"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full border-none bg-transparent text-5xl font-black tracking-tight placeholder:text-gray-300 dark:placeholder:text-gray-700 focus:outline-none focus:ring-0 dark:text-white pr-16"
              required
            />
            <button
              type="button"
              onClick={handleSuggestTitles}
              disabled={isSuggestingTitles}
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-2xl glass p-3 text-purple-600 hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
              title="Suggest titles using AI"
            >
              {isSuggestingTitles ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            </button>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-1 items-center gap-3 rounded-2xl glass px-5 py-3 border border-white/20">
              <TagIcon className="h-5 w-5 text-purple-500" />
              <input
                type="text"
                placeholder="Tags (comma separated)"
                value={formData.tags}
                onChange={e => setFormData({ ...formData, tags: e.target.value })}
                className="flex-1 bg-transparent text-sm font-bold focus:outline-none dark:text-white"
              />
              <button
                type="button"
                onClick={handleAiSuggestTags}
                disabled={isSuggestingTags}
                className="rounded-lg bg-purple-500/10 p-2 text-purple-600 hover:bg-purple-500/20 transition-all"
                title="Suggest Tags with AI"
              >
                {isSuggestingTags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex flex-1 items-center gap-3 rounded-2xl glass px-5 py-3 border border-white/20">
              <ImageIcon className="h-5 w-5 text-purple-500" />
              <input
                type="text"
                placeholder="Cover Image URL"
                value={formData.coverImage}
                onChange={e => setFormData({ ...formData, coverImage: e.target.value })}
                className="flex-1 bg-transparent text-sm font-bold focus:outline-none dark:text-white"
              />
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-lg bg-purple-500/10 p-2 text-purple-600 hover:bg-purple-500/20 transition-all" title="Upload Image">
                  <Plus className="h-4 w-4" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        toast.promise(handleImageUpload(file), {
                          loading: 'Uploading image...',
                          success: (url) => {
                            setFormData({ ...formData, coverImage: url || '' });
                            return 'Image uploaded successfully';
                          },
                          error: 'Failed to upload image'
                        });
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAiGenerateImage}
                  disabled={isGeneratingImage}
                  className="rounded-lg bg-purple-500/10 p-2 text-purple-600 hover:bg-purple-500/20 transition-all"
                  title="Generate Cover with AI"
                >
                  {isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <Editor 
          content={formData.content} 
          onChange={content => setFormData({ ...formData, content })} 
        />

        <div className="flex items-center justify-between rounded-3xl glass p-6 border border-white/20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, published: !formData.published })}
              className={cn(
                "flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-black tracking-tight transition-all hover:scale-105 active:scale-95",
                formData.published 
                  ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20" 
                  : "bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20"
              )}
            >
              {formData.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {formData.published ? 'Public' : 'Draft'}
            </button>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-full bg-black px-10 py-4 text-sm font-black text-white transition-all hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 disabled:opacity-50 shadow-2xl hover:scale-105 active:scale-95"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Update Story' : 'Publish Story'}
          </button>
        </div>
      </form>
      </div>
    </div>
  );

  const renderDashboard = () => {
    const userPosts = posts.filter(p => p.authorId === user?.uid);
    const bookmarkedPosts = posts.filter(p => bookmarks.includes(p.id));

    const handleResolveReport = async (report: CommentReport, action: 'remove' | 'dismiss') => {
      try {
        if (action === 'remove') {
          // Mark comment as removed
          await updateDoc(doc(db, 'posts', report.postId, 'comments', report.commentId), {
            isRemoved: true,
            isReported: false
          });
          toast.success('Comment removed');
        } else {
          // Dismiss report
          await updateDoc(doc(db, 'posts', report.postId, 'comments', report.commentId), {
            isReported: false
          });
          toast.success('Report dismissed');
        }
        // Update report status
        await updateDoc(doc(db, 'reports', report.id), {
          status: action === 'remove' ? 'resolved' : 'dismissed'
        });
      } catch (error) {
        console.error('Error resolving report:', error);
        toast.error('Failed to resolve report');
      }
    };

    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-6 glass p-10 rounded-[3rem] border border-white/20 shadow-2xl">
          <div>
            <h1 className="text-5xl font-black tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
            <p className="mt-2 text-lg font-medium text-gray-500 dark:text-gray-400">Manage your stories and profile.</p>
          </div>
          <button 
            onClick={() => {
              setFormData({ title: '', content: '', tags: '', coverImage: '', published: true });
              setCurrentPage('write');
            }}
            className="flex items-center gap-3 rounded-full bg-purple-600 px-8 py-4 text-sm font-black text-white transition-all hover:bg-purple-500 shadow-xl shadow-purple-500/20 hover:scale-105 active:scale-95"
          >
            <Plus className="h-6 w-6" />
            New Story
          </button>
        </header>

        <div className="mb-10 flex flex-wrap gap-4">
          <button
            onClick={() => setDashboardActiveTab('stories')}
            className={cn(
              "rounded-full px-8 py-3 text-sm font-black transition-all",
              dashboardActiveTab === 'stories' 
                ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
            )}
          >
            Published ({userPosts.length})
          </button>
          <button
            onClick={() => setDashboardActiveTab('drafts')}
            className={cn(
              "rounded-full px-8 py-3 text-sm font-black transition-all",
              dashboardActiveTab === 'drafts' 
                ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
            )}
          >
            Drafts ({userDrafts.length})
          </button>
          <button
            onClick={() => setDashboardActiveTab('bookmarks')}
            className={cn(
              "rounded-full px-8 py-3 text-sm font-black transition-all",
              dashboardActiveTab === 'bookmarks' 
                ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
            )}
          >
            Reading List
          </button>
          {userProfile?.role === 'admin' && (
            <button
              onClick={() => setDashboardActiveTab('moderation')}
              className={cn(
                "rounded-full px-8 py-3 text-sm font-black transition-all",
                dashboardActiveTab === 'moderation' 
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                  : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
              )}
            >
              Moderation
            </button>
          )}
        </div>

        <div className="grid gap-8">
          {dashboardActiveTab === 'stories' ? (
            userPosts.length > 0 ? (
              userPosts.map(post => (
                <div key={post.id} className="flex flex-wrap items-center justify-between gap-6 rounded-[2.5rem] glass-card p-8 border border-white/20 shadow-xl group hover:scale-[1.01] transition-all">
                  <div className="flex-1 space-y-3">
                    <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{post.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-gray-500 dark:text-gray-400">
                      <span className={cn(
                        "rounded-full px-4 py-1.5 text-xs font-black tracking-widest uppercase",
                        post.published 
                          ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20" 
                          : "bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20"
                      )}>
                        {post.published ? 'Published' : 'Draft'}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span>{formatDate(post.createdAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span className="flex items-center gap-1.5">
                        <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                        {post.likesCount || 0}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-blue-500" />
                        {post.viewsCount || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setSelectedPost(post);
                        setFormData({
                          title: post.title,
                          content: post.content,
                          tags: post.tags.join(', '),
                          coverImage: post.coverImage || '',
                          published: post.published
                        });
                        setCurrentPage('edit');
                      }}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:bg-purple-500/20 dark:hover:text-purple-400 transition-all hover:scale-110"
                      title="Edit Story"
                    >
                      <PenSquare className="h-5 w-5" />
                    </button>
                    <button 
                      onClick={() => handleDeletePost(post.id)}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-all hover:scale-110"
                      title="Delete Story"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedPost(post);
                        setCurrentPage('post');
                      }}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:bg-purple-500/20 dark:hover:text-purple-400 transition-all hover:scale-110"
                      title="View Story"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[3rem] glass p-20 text-center border-2 border-dashed border-white/20">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl glass bg-purple-500/10">
                  <Plus className="h-10 w-10 text-purple-500" />
                </div>
                <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">No stories yet</h3>
                <p className="mt-2 font-medium text-gray-500 dark:text-gray-400">Start your journey by writing your first story.</p>
                <button 
                  onClick={() => setCurrentPage('write')}
                  className="mt-8 rounded-full bg-black px-8 py-3 text-sm font-black text-white dark:bg-white dark:text-black hover:scale-105 transition-transform"
                >
                  Write your first story
                </button>
              </div>
            )
          ) : dashboardActiveTab === 'drafts' ? (
            userDrafts.length > 0 ? (
              userDrafts.map(post => (
                <div key={post.id} className="flex flex-wrap items-center justify-between gap-6 rounded-[2.5rem] glass-card p-8 border border-white/20 shadow-xl group hover:scale-[1.01] transition-all">
                  <div className="flex-1 space-y-3">
                    <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{post.title || 'Untitled Draft'}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-gray-500 dark:text-gray-400">
                      <span className={cn(
                        "rounded-full px-4 py-1.5 text-xs font-black tracking-widest uppercase",
                        "bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20"
                      )}>
                        Draft
                      </span>
                      <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span>Last updated: {formatDate(post.updatedAt || post.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setSelectedPost(post);
                        setFormData({
                          title: post.title,
                          content: post.content,
                          tags: post.tags.join(', '),
                          coverImage: post.coverImage || '',
                          published: post.published
                        });
                        setCurrentPage('edit');
                      }}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:bg-purple-500/20 dark:hover:text-purple-400 transition-all hover:scale-110"
                      title="Edit Draft"
                    >
                      <PenSquare className="h-5 w-5" />
                    </button>
                    <button 
                      onClick={() => handleDeletePost(post.id)}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-all hover:scale-110"
                      title="Delete Draft"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[3rem] glass p-20 text-center border-2 border-dashed border-white/20">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl glass bg-purple-500/10">
                  <PenSquare className="h-10 w-10 text-purple-500" />
                </div>
                <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">No drafts</h3>
                <p className="mt-2 font-medium text-gray-500 dark:text-gray-400">You don't have any saved drafts.</p>
              </div>
            )
          ) : dashboardActiveTab === 'bookmarks' ? (
            bookmarkedPosts.length > 0 ? (
              bookmarkedPosts.map(post => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  isBookmarked={true}
                  onBookmark={(e) => handleBookmark(e, post.id)}
                  onClick={() => {
                    setSelectedPost(post);
                    handleViewCount(post.id);
                    setCurrentPage('post');
                  }} 
                />
              ))
            ) : (
              <div className="rounded-[3rem] glass p-20 text-center border-2 border-dashed border-white/20">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl glass bg-purple-500/10">
                  <Bookmark className="h-10 w-10 text-purple-500" />
                </div>
                <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Empty reading list</h3>
                <p className="mt-2 font-medium text-gray-500 dark:text-gray-400">Save stories you love to read them later.</p>
                <button 
                  onClick={() => setCurrentPage('home')}
                  className="mt-8 rounded-full bg-black px-8 py-3 text-sm font-black text-white dark:bg-white dark:text-black hover:scale-105 transition-transform"
                >
                  Explore stories
                </button>
              </div>
            )
          ) : (
            <div className="space-y-6">
              {dashboardReports.filter(r => r.status === 'pending').length > 0 ? (
                dashboardReports.filter(r => r.status === 'pending').map(report => (
                  <div key={report.id} className="rounded-[2.5rem] glass-card p-8 border border-white/20 shadow-xl space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-amber-500/10 p-3">
                          <AlertTriangle className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">Reported Comment</h3>
                          <p className="text-sm font-medium text-gray-500">Reason: {report.reason}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-400">{formatDate(report.createdAt)}</span>
                    </div>
                    
                    <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-6 italic text-gray-600 dark:text-gray-400">
                      "{report.commentContent}"
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleResolveReport(report, 'dismiss')}
                        className="rounded-full glass px-6 py-2.5 text-sm font-black text-gray-500 hover:text-black dark:hover:text-white transition-all"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleResolveReport(report, 'remove')}
                        className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-black text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                      >
                        Remove Comment
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[3rem] glass p-20 text-center border-2 border-dashed border-white/20">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl glass bg-green-500/10">
                    <Eye className="h-10 w-10 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">All clear!</h3>
                  <p className="mx-auto mt-4 max-w-xs text-lg font-medium text-gray-500 dark:text-gray-400">
                    There are no pending reports to review at the moment.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAdminDashboard = () => {
    const handleResolveReport = async (report: CommentReport, action: 'remove' | 'dismiss') => {
      try {
        if (action === 'remove') {
          await updateDoc(doc(db, 'posts', report.postId, 'comments', report.commentId), {
            isRemoved: true,
            isReported: false
          });
          toast.success('Comment removed');
        } else {
          await updateDoc(doc(db, 'posts', report.postId, 'comments', report.commentId), {
            isReported: false
          });
          toast.success('Report dismissed');
        }
        await updateDoc(doc(db, 'reports', report.id), {
          status: action === 'remove' ? 'resolved' : 'dismissed'
        });
      } catch (error) {
        console.error('Error resolving report:', error);
        toast.error('Failed to resolve report');
      }
    };

    const handleToggleAdmin = async (u: UserProfile) => {
      try {
        const newRole = u.role === 'admin' ? 'user' : 'admin';
        await updateDoc(doc(db, 'users', u.uid), {
          role: newRole
        });
        toast.success(`User role updated to ${newRole}`);
      } catch (error) {
        console.error('Error updating user role:', error);
        toast.error('Failed to update user role');
      }
    };

    const handleDeleteUser = async (uid: string) => {
      try {
        await deleteDoc(doc(db, 'users', uid));
        toast.success('User deleted');
        setAdminConfirmDelete(null);
      } catch (error) {
        console.error('Error deleting user:', error);
        toast.error('Failed to delete user');
      }
    };

    const handleDeletePostAdmin = async (postId: string) => {
      try {
        await deleteDoc(doc(db, 'posts', postId));
        toast.success('Post deleted');
        setAdminConfirmDelete(null);
      } catch (error) {
        console.error('Error deleting post:', error);
        toast.error('Failed to delete post');
      }
    };

    const filteredUsers = adminAllUsers.filter(u => 
      u.displayName?.toLowerCase().includes(adminUserSearchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(adminUserSearchQuery.toLowerCase())
    );

    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {adminConfirmDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-[2.5rem] glass p-10 border border-white/20 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                <Trash2 className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-black tracking-tight text-center text-gray-900 dark:text-white mb-2">Confirm Delete</h3>
              <p className="text-center text-gray-500 dark:text-gray-400 mb-8 font-medium">
                Are you sure you want to delete <span className="font-black text-gray-900 dark:text-white">"{adminConfirmDelete.name}"</span>? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setAdminConfirmDelete(null)}
                  className="flex-1 rounded-full glass py-3 font-black text-gray-500 hover:text-black dark:hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => adminConfirmDelete.type === 'user' ? handleDeleteUser(adminConfirmDelete.id) : handleDeletePostAdmin(adminConfirmDelete.id)}
                  className="flex-1 rounded-full bg-red-500 py-3 font-black text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="mb-12 flex flex-wrap items-center justify-between gap-6 glass p-10 rounded-[3rem] border border-white/20 shadow-2xl">
          <div>
            <h1 className="text-5xl font-black tracking-tight text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="mt-2 text-lg font-medium text-gray-500 dark:text-gray-400">Manage users, stories, and community safety.</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="rounded-2xl glass px-6 py-3 text-center">
                <div className="text-2xl font-black text-purple-600">{adminAllUsers.length}</div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Users</div>
             </div>
             <div className="rounded-2xl glass px-6 py-3 text-center">
                <div className="text-2xl font-black text-blue-600">{posts.length}</div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Stories</div>
             </div>
          </div>
        </header>

        <div className="mb-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setAdminActiveTab('users')}
              className={cn(
                "flex items-center gap-2 rounded-full px-8 py-3 text-sm font-black transition-all",
                adminActiveTab === 'users' 
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                  : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
              )}
            >
              <Users className="h-4 w-4" />
              Users
            </button>
            <button
              onClick={() => setAdminActiveTab('posts')}
              className={cn(
                "flex items-center gap-2 rounded-full px-8 py-3 text-sm font-black transition-all",
                adminActiveTab === 'posts' 
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                  : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
              )}
            >
              <FileText className="h-4 w-4" />
              Stories
            </button>
            <button
              onClick={() => setAdminActiveTab('reports')}
              className={cn(
                "flex items-center gap-2 rounded-full px-8 py-3 text-sm font-black transition-all",
                adminActiveTab === 'reports' 
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" 
                  : "glass text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
              )}
            >
              <ShieldAlert className="h-4 w-4" />
              Reports ({adminAllReports.filter(r => r.status === 'pending').length})
            </button>
          </div>

          {adminActiveTab === 'users' && (
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={adminUserSearchQuery}
                onChange={(e) => setAdminUserSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full rounded-full glass py-3 pl-11 pr-4 text-sm font-medium focus:border-purple-500 focus:outline-none transition-all"
              />
            </div>
          )}
        </div>

        <div className="grid gap-8">
          {adminActiveTab === 'users' ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredUsers.map(u => (
                <div key={u.uid} className="rounded-[2.5rem] glass-card p-6 border border-white/20 shadow-xl flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl glass">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt={u.displayName || ''} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon className="h-full w-full p-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black tracking-tight text-gray-900 dark:text-white truncate">{u.displayName || 'Anonymous'}</h3>
                      <p className="text-xs font-medium text-gray-500 truncate">{u.email}</p>
                      <span className={cn(
                        "mt-2 inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                        u.role === 'admin' ? "bg-purple-500/10 text-purple-600" : "bg-gray-500/10 text-gray-600"
                      )}>
                        {u.role}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t border-white/10">
                    <button
                      onClick={() => handleToggleAdmin(u)}
                      disabled={u.uid === user?.uid}
                      className="flex-1 rounded-xl glass py-2 text-xs font-black text-gray-500 hover:text-purple-600 disabled:opacity-50"
                    >
                      {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                    </button>
                    <button
                      onClick={() => setAdminConfirmDelete({ type: 'user', id: u.uid, name: u.displayName || u.email })}
                      disabled={u.uid === user?.uid}
                      className="rounded-xl glass p-2 text-gray-500 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : adminActiveTab === 'posts' ? (
            <div className="space-y-6">
              {posts.map(post => (
                <div key={post.id} className="flex flex-wrap items-center justify-between gap-6 rounded-[2.5rem] glass-card p-8 border border-white/20 shadow-xl group hover:scale-[1.01] transition-all">
                  <div className="flex-1 space-y-3">
                    <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{post.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <UserIcon className="h-4 w-4" />
                        {post.authorName}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span>{formatDate(post.createdAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span className="flex items-center gap-1.5">
                        <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                        {post.likesCount || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setSelectedPost(post);
                        setCurrentPage('post');
                      }}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:bg-purple-500/20 dark:hover:text-purple-400 transition-all hover:scale-110"
                      title="View Story"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    <button 
                      onClick={() => setAdminConfirmDelete({ type: 'post', id: post.id, name: post.title })}
                      className="rounded-2xl glass p-4 text-gray-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-all hover:scale-110"
                      title="Delete Story"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {adminAllReports.filter(r => r.status === 'pending').length > 0 ? (
                adminAllReports.filter(r => r.status === 'pending').map(report => (
                  <div key={report.id} className="rounded-[2.5rem] glass-card p-8 border border-white/20 shadow-xl space-y-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-amber-500/10 p-3">
                          <AlertTriangle className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">Reported Comment</h3>
                          <p className="text-sm font-medium text-gray-500">Reason: {report.reason}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-400">{formatDate(report.createdAt)}</span>
                    </div>
                    
                    <div className="rounded-2xl bg-black/5 dark:bg-white/5 p-6 italic text-gray-600 dark:text-gray-400">
                      "{report.commentContent}"
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleResolveReport(report, 'dismiss')}
                        className="rounded-full glass px-6 py-2.5 text-sm font-black text-gray-500 hover:text-black dark:hover:text-white transition-all"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleResolveReport(report, 'remove')}
                        className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-black text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                      >
                        Remove Comment
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[3rem] glass p-20 text-center border-2 border-dashed border-white/20">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl glass bg-green-500/10">
                    <Eye className="h-10 w-10 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">All clear!</h3>
                  <p className="mx-auto mt-4 max-w-xs text-lg font-medium text-gray-500 dark:text-gray-400">
                    There are no pending reports to review at the moment.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderExplore = () => {
    const categories = ['All', 'Technology', 'Design', 'Lifestyle', 'Business', 'Health', 'Travel'];
    
    // Bento grid logic: first post is large, others are regular
    const featuredPost = posts[0];
    const otherPosts = posts.slice(1);

    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl font-black tracking-tighter text-gray-900 dark:text-white sm:text-7xl"
          >
            Explore <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">Stories</span>
          </motion.h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl font-medium text-gray-500 dark:text-gray-400">
            Discover the latest insights, stories, and ideas from our global community of writers.
          </p>
        </header>

        <div className="mb-12 flex flex-wrap justify-center gap-3">
          {categories.map((cat, i) => (
            <motion.button
              key={cat}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setExploreActiveCategory(cat)}
              className={cn(
                "rounded-full px-6 py-2.5 text-sm font-bold transition-all border",
                exploreActiveCategory === cat 
                  ? "bg-slate-900 text-white border-slate-900 shadow-md dark:bg-white dark:text-slate-900 dark:border-white" 
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              )}
            >
              {cat}
            </motion.button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:grid-cols-4">
          {featuredPost && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:col-span-3 lg:col-span-4"
            >
              <PostCard 
                post={featuredPost} 
                layout="featured"
                onClick={() => {
                  setSelectedPost(featuredPost);
                  handleViewCount(featuredPost.id);
                  setCurrentPage('post');
                }}
                isBookmarked={bookmarks.includes(featuredPost.id)}
                onBookmark={(e) => handleBookmark(e, featuredPost.id)}
                onAuthorClick={(e) => {
                  e.stopPropagation();
                  viewProfile(featuredPost.authorId);
                }}
              />
            </motion.div>
          )}
        
          {otherPosts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 1) * 0.1 }}
              className="md:col-span-1"
            >
              <PostCard 
                post={post} 
                layout="vertical"
                onClick={() => {
                  setSelectedPost(post);
                  handleViewCount(post.id);
                  setCurrentPage('post');
                }}
                isBookmarked={bookmarks.includes(post.id)}
                onBookmark={(e) => handleBookmark(e, post.id)}
                onAuthorClick={(e) => {
                  e.stopPropagation();
                  viewProfile(post.authorId);
                }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  const renderProfile = () => {
    if (!user) return null;

    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12 flex items-center justify-between glass p-8 rounded-3xl border border-white/20 shadow-2xl">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white">Profile Settings</h1>
            <p className="mt-2 text-lg font-medium text-gray-500 dark:text-gray-400">Update your public profile information.</p>
          </div>
        </header>

        <form onSubmit={handleUpdateProfile} className="glass p-8 sm:p-12 rounded-[3rem] space-y-8 border border-white/20 shadow-2xl">
          <div className="flex flex-col items-center gap-6 pb-6 border-b border-white/10">
            <div className="relative group">
              <div className="h-32 w-32 overflow-hidden rounded-[2.5rem] glass p-1 shadow-2xl">
                {profileFormData.photoURL ? (
                  <img 
                    src={profileFormData.photoURL} 
                    alt="Profile Preview" 
                    className="h-full w-full rounded-[2rem] object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-purple-500/10 rounded-[2rem]">
                    <UserIcon className="h-12 w-12 text-purple-500" />
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 rounded-2xl glass p-2 shadow-lg">
                <ImageIcon className="h-5 w-5 text-purple-500" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">{user.displayName || 'Anonymous'}</h3>
              <p className="text-sm font-medium text-gray-500">{user.email}</p>
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-lg font-black text-gray-900 dark:text-white">{userProfile?.followersCount || 0}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Followers</div>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <div className="text-center">
                  <div className="text-lg font-black text-gray-900 dark:text-white">{userProfile?.followingCount || 0}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Following</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Display Name</label>
              <input
                type="text"
                value={profileFormData.displayName}
                onChange={e => setProfileFormData({ ...profileFormData, displayName: e.target.value })}
                className="w-full rounded-2xl border border-white/20 bg-white/50 p-4 text-base font-bold focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                placeholder="Your name"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Avatar URL</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={profileFormData.photoURL}
                  onChange={e => setProfileFormData({ ...profileFormData, photoURL: e.target.value })}
                  className="flex-1 rounded-2xl border border-white/20 bg-white/50 p-4 text-base font-bold focus:border-purple-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                  placeholder="https://example.com/avatar.jpg"
                />
                <label className="cursor-pointer rounded-2xl glass px-6 flex items-center justify-center text-purple-600 hover:bg-purple-500/10 transition-all shadow-lg">
                  <Plus className="h-5 w-5" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        toast.promise(handleImageUpload(file), {
                          loading: 'Uploading avatar...',
                          success: (url) => {
                            setProfileFormData({ ...profileFormData, photoURL: url || '' });
                            return 'Avatar uploaded successfully';
                          },
                          error: 'Failed to upload avatar'
                        });
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Bio</label>
              <textarea
                value={profileFormData.bio}
                onChange={e => setProfileFormData({ ...profileFormData, bio: e.target.value })}
                className="w-full rounded-2xl border border-white/20 bg-white/50 p-4 text-base font-bold focus:border-purple-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all min-h-[120px] resize-none"
                placeholder="Tell the world about yourself..."
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Twitter</label>
                <input
                  type="text"
                  value={profileFormData.twitter}
                  onChange={e => setProfileFormData({ ...profileFormData, twitter: e.target.value })}
                  className="w-full rounded-2xl border border-white/20 bg-white/50 p-4 text-base font-bold focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                  placeholder="@username"
                />
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">GitHub</label>
                <input
                  type="text"
                  value={profileFormData.github}
                  onChange={e => setProfileFormData({ ...profileFormData, github: e.target.value })}
                  className="w-full rounded-2xl border border-white/20 bg-white/50 p-4 text-base font-bold focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                  placeholder="username"
                />
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-xs font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Website</label>
                <input
                  type="text"
                  value={profileFormData.website}
                  onChange={e => setProfileFormData({ ...profileFormData, website: e.target.value })}
                  className="w-full rounded-2xl border border-white/20 bg-white/50 p-4 text-base font-bold focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-0 dark:bg-white/5 dark:text-white transition-all"
                  placeholder="example.com"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-6">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className="rounded-full glass px-8 py-3 text-sm font-black text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-full bg-black px-10 py-4 text-sm font-black text-white transition-all hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 disabled:opacity-50 shadow-2xl hover:scale-105 active:scale-95"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    );
  };

  const renderPublicProfile = () => {
    if (!selectedProfile) return renderNotFound();
    const profilePosts = posts.filter(p => p.authorId === selectedProfile.uid);
    const isFollowing = following.includes(selectedProfile.uid);

    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <button 
          onClick={() => setCurrentPage('home')}
          className="group mb-12 flex items-center gap-3 text-sm font-black uppercase tracking-widest text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-all"
        >
          <div className="rounded-full glass p-2 group-hover:scale-110 transition-transform">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to feed
        </button>

        <header className="mb-16 glass p-10 sm:p-16 rounded-[3rem] border border-white/20 shadow-2xl relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
          
          <div className="relative z-10 flex flex-col items-center gap-8 text-center sm:flex-row sm:text-left">
            <div className="h-32 w-32 shrink-0 overflow-hidden rounded-[2.5rem] glass p-1 shadow-2xl">
              {selectedProfile.photoURL ? (
                <img src={selectedProfile.photoURL} alt={selectedProfile.displayName || ''} className="h-full w-full rounded-[2rem] object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-purple-500/10 rounded-[2rem]">
                  <UserIcon className="h-12 w-12 text-purple-500" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white sm:text-5xl">{selectedProfile.displayName || 'Anonymous'}</h1>
                {selectedProfile.bio && (
                  <p className="mt-4 max-w-lg text-lg font-medium text-gray-500 dark:text-gray-400 leading-relaxed">
                    {selectedProfile.bio}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-start">
                <div className="text-center sm:text-left">
                  <div className="text-2xl font-black text-gray-900 dark:text-white">{profilePosts.length}</div>
                  <div className="text-xs font-black uppercase tracking-widest text-gray-400">Stories</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center sm:text-left">
                  <div className="text-2xl font-black text-gray-900 dark:text-white">{selectedProfile.followersCount || 0}</div>
                  <div className="text-xs font-black uppercase tracking-widest text-gray-400">Followers</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center sm:text-left">
                  <div className="text-2xl font-black text-gray-900 dark:text-white">{selectedProfile.followingCount || 0}</div>
                  <div className="text-xs font-black uppercase tracking-widest text-gray-400">Following</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center sm:text-left">
                  <div className="text-2xl font-black text-gray-900 dark:text-white">
                    {profilePosts.reduce((acc, p) => acc + (p.likesCount || 0), 0)}
                  </div>
                  <div className="text-xs font-black uppercase tracking-widest text-gray-400">Total Likes</div>
                </div>
                {selectedProfile.socialLinks && (
                  <>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="flex items-center gap-4">
                      {selectedProfile.socialLinks.twitter && (
                        <a href={`https://twitter.com/${selectedProfile.socialLinks.twitter}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 transition-colors">
                          <Share2 className="h-5 w-5" />
                        </a>
                      )}
                      {selectedProfile.socialLinks.github && (
                        <a href={`https://github.com/${selectedProfile.socialLinks.github}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
                          <Plus className="h-5 w-5" />
                        </a>
                      )}
                      {selectedProfile.socialLinks.website && (
                        <a href={`https://${selectedProfile.socialLinks.website}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-purple-400 transition-colors">
                          <Eye className="h-5 w-5" />
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            {user?.uid !== selectedProfile.uid && (
              <button 
                onClick={() => handleFollow(selectedProfile.uid)}
                className={cn(
                  "rounded-full px-10 py-4 text-sm font-black transition-all hover:scale-105 active:scale-95 shadow-xl",
                  isFollowing 
                    ? "glass text-gray-500 hover:text-red-500" 
                    : "bg-black text-white dark:bg-white dark:text-black"
                )}
              >
                {isFollowing ? 'Following' : 'Follow Author'}
              </button>
            )}
          </div>
        </header>

        <div className="space-y-10">
          <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Recent Stories</h2>
          <div className="grid gap-8">
            {profilePosts.map(post => (
              <PostCard 
                key={post.id} 
                post={post} 
                isBookmarked={bookmarks.includes(post.id)}
                onBookmark={(e) => handleBookmark(e, post.id)}
                onClick={() => {
                  setSelectedPost(post);
                  handleViewCount(post.id);
                  setCurrentPage('post');
                }} 
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderNotFound = () => (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center flex flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-12 rounded-[3rem] w-full"
      >
        <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 mb-6">
          404
        </div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-4">
          Page Not Found
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 mb-10 font-medium">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => setCurrentPage('home')}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-8 py-4 text-sm font-bold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-gray-100 shadow-xl hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Homepage
        </button>
      </motion.div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-black relative overflow-hidden">
        <div className="bg-blob h-96 w-96 rounded-full bg-purple-400/30 -top-20 -left-20" />
        <div className="bg-blob h-[500px] w-[500px] rounded-full bg-blue-400/30 top-1/2 -right-40" />
        <div className="glass p-12 rounded-[3rem] flex flex-col items-center gap-6 relative z-10 border border-white/20 shadow-2xl">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-purple-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-lg font-black tracking-tight text-gray-900 dark:text-white animate-pulse">Loading experience...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen font-sans text-gray-900 antialiased dark:text-gray-100 relative overflow-hidden">
      {/* Background Blobs */}
      <div className="bg-blob h-96 w-96 rounded-full bg-purple-400/30 -top-20 -left-20" />
      <div className="bg-blob h-[500px] w-[500px] rounded-full bg-blue-400/30 top-1/2 -right-40" />
      <div className="bg-blob h-80 w-80 rounded-full bg-pink-400/30 bottom-20 left-1/4" />

      {currentPage === 'post' && <ReadingProgressBar />}
      
      <Navbar 
        user={user} 
        userProfile={userProfile}
        onNavigate={handleNavigate} 
        currentPage={currentPage} 
        onOpenLogin={() => setIsLoginModalOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        notifications={notifications}
        isNotificationsOpen={isNotificationsOpen}
        onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)}
      />
      
      <main className="pb-24 sm:pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {currentPage === 'home' && renderHome()}
            {currentPage === 'explore' && renderExplore()}
            {currentPage === 'post' && renderPost()}
            {currentPage === 'write' && renderEditor()}
            {currentPage === 'edit' && renderEditor(true)}
            {currentPage === 'dashboard' && renderDashboard()}
            {currentPage === 'admin-dashboard' && renderAdminDashboard()}
            {currentPage === 'profile' && renderProfile()}
            {currentPage === 'public-profile' && renderPublicProfile()}
            {currentPage === '404' && renderNotFound()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Floating Action Button */}
      {user && currentPage !== 'write' && currentPage !== 'edit' && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => handleNavigate('write')}
          className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white shadow-2xl dark:bg-white dark:text-black sm:hidden"
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-white/80 p-4 backdrop-blur-xl dark:bg-black/80 sm:hidden">
        <div className="flex items-center justify-around">
          <button 
            onClick={() => handleNavigate('home')}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              currentPage === 'home' ? "text-purple-600" : "text-gray-500"
            )}
          >
            <Home className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Home</span>
          </button>
          <button 
            onClick={() => handleNavigate('explore')}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              currentPage === 'explore' ? "text-purple-600" : "text-gray-500"
            )}
          >
            <Search className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Explore</span>
          </button>
          <button 
            onClick={() => user ? handleNavigate('dashboard') : setIsLoginModalOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              currentPage === 'dashboard' ? "text-purple-600" : "text-gray-500"
            )}
          >
            <Bookmark className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Saved</span>
          </button>
          <button 
            onClick={() => user ? handleNavigate('profile') : setIsLoginModalOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              currentPage === 'profile' ? "text-purple-600" : "text-gray-500"
            )}
          >
            <UserIcon className="h-5 w-5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Profile</span>
          </button>
        </div>
      </nav>

      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
      />
      <Toaster position="bottom-right" richColors />
      </div>
    </ErrorBoundary>
  );
}
