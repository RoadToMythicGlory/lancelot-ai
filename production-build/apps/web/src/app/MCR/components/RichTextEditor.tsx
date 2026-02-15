'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface ContextMenuProps {
  editor: Editor;
  position: { x: number; y: number };
  onClose: () => void;
}

const ContextMenu = ({ editor, position, onClose }: ContextMenuProps) => {
  const [showHighlightColors, setShowHighlightColors] = useState(false);
  
  useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  const highlightColors = [
    { name: 'צהוב', value: '#ffeb3b' },
    { name: 'ירוק', value: '#8bc34a' },
    { name: 'כחול', value: '#03a9f4' },
    { name: 'ורוד', value: '#ff4081' },
    { name: 'כתום', value: '#ff9800' },
    { name: 'סגול', value: '#9c27b0' },
  ];

  return (
    <div
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg p-2 z-50"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().toggleBold().run();
            onClose();
          }}
          className={`px-3 py-2 rounded font-bold ${
            editor.isActive('bold') ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().toggleItalic().run();
            onClose();
          }}
          className={`px-3 py-2 rounded italic ${
            editor.isActive('italic') ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().toggleStrike().run();
            onClose();
          }}
          className={`px-3 py-2 rounded line-through ${
            editor.isActive('strike') ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          title="Strikethrough"
        >
          S
        </button>
        
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowHighlightColors(!showHighlightColors)}
            className={`px-3 py-2 rounded ${
              editor.isActive('highlight') ? 'bg-gray-300' : 'hover:bg-gray-100'
            }`}
            title="Highlight"
          >
            🖍️
          </button>
          {showHighlightColors && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-300 rounded-lg shadow-lg p-2">
              <div className="grid grid-cols-3 gap-1">
                {highlightColors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color: color.value }).run();
                      onClose();
                    }}
                    className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
              <button
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  onClose();
                }}
                className="mt-2 w-full text-xs px-2 py-1 hover:bg-gray-100 rounded"
              >
                הסר סימון
              </button>
            </div>
          )}
        </div>

        <div className="border-l border-gray-300 h-6 mx-1"></div>
        <input
          type="color"
          onChange={(e) => {
            editor.chain().focus().setColor(e.target.value).run();
          }}
          value={editor.getAttributes('textStyle').color || '#000000'}
          className="w-8 h-8 border rounded cursor-pointer"
          title="Text Color"
        />
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().unsetAllMarks().run();
            onClose();
          }}
          className="px-2 py-1 rounded hover:bg-gray-100 text-sm"
          title="Clear Formatting"
        >
          ✕ נקה עיצוב
        </button>
      </div>
    </div>
  );
};

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TextStyle,
      Color,
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Check if there's selected text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0 && editor) {
      // Position the context menu near the cursor
      const rect = editorRef.current?.getBoundingClientRect();
      if (rect) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // In a real implementation, we'd handle file upload here
      editor?.commands.insertContent(`[קובץ: ${file.name}]`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <div className="border rounded-lg overflow-hidden relative" ref={editorRef}>
        <div className="absolute top-2 right-2 text-xs text-gray-400 pointer-events-none">
          בחר טקסט ולחץ עם הכפתור הימני לעיצוב
        </div>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onContextMenu={handleContextMenu}
          className="min-h-[150px] p-3"
        >
          <EditorContent 
            editor={editor} 
            className="prose max-w-none"
            placeholder={placeholder}
          />
        </div>
      </div>
      
      {contextMenu && editor && (
        <ContextMenu
          editor={editor}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

