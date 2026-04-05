import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { 
  Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2, 
  Undo, Redo, Code, Image as ImageIcon, Sparkles, Loader2,
  Wand2, FileText, Eye, EyeOff, CheckCircle2
} from 'lucide-react';
import { summarizeContent, improveWriting } from '../services/gemini';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  isSaving?: boolean;
}

const MenuButton = ({ onClick, isActive, children, title }: any) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={cn(
      "p-2 rounded-xl transition-all duration-200",
      isActive 
        ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30 scale-105" 
        : "text-gray-500 hover:bg-white/50 hover:text-black dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
    )}
  >
    {children}
  </button>
);

export default function Editor({ content, onChange, isSaving }: EditorProps) {
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-3xl shadow-2xl border border-white/20 my-10 max-w-full h-auto',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[400px] py-8 px-4',
      },
    },
  });

  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Enter the URL of the image:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleAiAction = async (action: 'summarize' | 'improve') => {
    const text = editor.getText();
    if (!text || text.length < 20) {
      toast.error('Please write more content before using AI assistance.');
      return;
    }

    setIsAiLoading(true);
    setShowAiMenu(false);
    try {
      if (action === 'summarize') {
        const summary = await summarizeContent(text);
        if (summary) {
          editor.chain().focus().insertContent(`\n\n> **AI Summary:** ${summary}\n\n`).run();
          toast.success('Summary generated!');
        }
      } else if (action === 'improve') {
        const improved = await improveWriting(text);
        if (improved) {
          editor.chain().focus().setContent(improved).run();
          toast.success('Writing improved!');
        }
      }
    } catch (error) {
      console.error('AI Action failed:', error);
      toast.error('AI assistance failed. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="rounded-[2rem] glass-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 backdrop-blur-md">
        <div className="flex items-center gap-1.5 mr-2">
          <button
            type="button"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all duration-200",
              isPreviewMode 
                ? "bg-black text-white dark:bg-white dark:text-black shadow-lg" 
                : "bg-white/50 text-gray-600 hover:bg-white dark:bg-white/10 dark:text-gray-400 dark:hover:bg-white/20"
            )}
          >
            {isPreviewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {isPreviewMode ? 'Edit Mode' : 'Live Preview'}
          </button>
        </div>

        {!isPreviewMode && (
          <>
            <MenuButton 
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={() => editor.chain().focus().toggleCode().run()}
              isActive={editor.isActive('code')}
              title="Code"
            >
              <Code className="h-4 w-4" />
            </MenuButton>
            <div className="mx-1 h-6 w-px bg-gray-200/20" />
            <MenuButton 
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <Heading1 className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <Heading2 className="h-4 w-4" />
            </MenuButton>
            <div className="mx-1 h-6 w-px bg-gray-200/20" />
            <MenuButton 
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet List"
            >
              <List className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Ordered List"
            >
              <ListOrdered className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Quote"
            >
              <Quote className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={addImage}
              title="Insert Image"
            >
              <ImageIcon className="h-4 w-4" />
            </MenuButton>

            <div className="mx-1 h-6 w-px bg-gray-200/20" />

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAiMenu(!showAiMenu)}
                disabled={isAiLoading}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition-all duration-200",
                  showAiMenu 
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30" 
                    : "bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400"
                )}
              >
                {isAiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AI
              </button>

              {showAiMenu && (
                <div className="absolute left-0 top-full z-50 mt-2 w-56 origin-top-left rounded-2xl border border-white/20 bg-white/90 p-2 shadow-2xl backdrop-blur-xl dark:bg-gray-900/90">
                  <button
                    onClick={() => handleAiAction('improve')}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-purple-500/10 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-purple-500/20 dark:hover:text-purple-400 transition-all"
                  >
                    <Wand2 className="h-4 w-4" />
                    Improve Writing
                  </button>
                  <button
                    onClick={() => handleAiAction('summarize')}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-gray-700 hover:bg-purple-500/10 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-purple-500/20 dark:hover:text-purple-400 transition-all"
                  >
                    <FileText className="h-4 w-4" />
                    Summarize Post
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex-1" />
        
        <div className="flex items-center gap-3 px-3">
          {isSaving ? (
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-green-500">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </div>
          )}
        </div>

        {!isPreviewMode && (
          <>
            <MenuButton 
              onClick={() => editor.chain().focus().undo().run()}
              title="Undo"
            >
              <Undo className="h-4 w-4" />
            </MenuButton>
            <MenuButton 
              onClick={() => editor.chain().focus().redo().run()}
              title="Redo"
            >
              <Redo className="h-4 w-4" />
            </MenuButton>
          </>
        )}
      </div>
      <div className="px-6 min-h-[500px] bg-white/10 dark:bg-black/10">
        {isPreviewMode ? (
          <div className="prose prose-lg dark:prose-invert max-w-none py-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ReactMarkdown>{editor.getHTML()}</ReactMarkdown>
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </div>
  );
}
