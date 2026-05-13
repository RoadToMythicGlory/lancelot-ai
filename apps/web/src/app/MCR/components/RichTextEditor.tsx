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

// 12 default text colors: 6 dark variants (top row) + 6 light/medium (bottom row).
// Selecting any swatch applies the color immediately to the current selection.
const TEXT_COLORS: { name: string; value: string }[] = [
  { name: 'שחור', value: '#000000' },
  { name: 'אדום כהה', value: '#7f1d1d' },
  { name: 'כתום כהה', value: '#9a3412' },
  { name: 'חרדל', value: '#854d0e' },
  { name: 'ירוק כהה', value: '#166534' },
  { name: 'כחול כהה', value: '#1e3a8a' },
  { name: 'אפור', value: '#6b7280' },
  { name: 'אדום', value: '#dc2626' },
  { name: 'כתום', value: '#f97316' },
  { name: 'צהוב', value: '#facc15' },
  { name: 'ירוק', value: '#22c55e' },
  { name: 'כחול', value: '#3b82f6' },
];

const HIGHLIGHT_COLORS: { name: string; value: string }[] = [
  { name: 'צהוב', value: '#ffeb3b' },
  { name: 'ירוק', value: '#8bc34a' },
  { name: 'כחול', value: '#03a9f4' },
  { name: 'ורוד', value: '#ff4081' },
  { name: 'כתום', value: '#ff9800' },
  { name: 'סגול', value: '#9c27b0' },
];

const ContextMenu = ({ editor, position, onClose }: ContextMenuProps) => {
  const [showHighlightColors, setShowHighlightColors] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  // Critical: prevents mouse-down on any toolbar button from blurring the
  // editor's contenteditable area. Without this, the DOM selection collapses
  // before the click handler fires and color/format commands have nothing
  // to apply to.
  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const currentColor = editor.getAttributes('textStyle').color as string | undefined;

  return (
    <div
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg p-2 z-50"
      style={{ left: position.x, top: position.y, maxWidth: 380 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={preventBlur}
    >
      <div className="flex gap-1 items-center mb-2 flex-wrap">
        <button
          type="button"
          onMouseDown={preventBlur}
          onClick={() => {
            editor.chain().focus().toggleBold().run();
            onClose();
          }}
          className={`px-3 py-2 rounded font-bold ${
            editor.isActive('bold') ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          title="מודגש"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={preventBlur}
          onClick={() => {
            editor.chain().focus().toggleItalic().run();
            onClose();
          }}
          className={`px-3 py-2 rounded italic ${
            editor.isActive('italic') ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          title="נטוי"
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={preventBlur}
          onClick={() => {
            editor.chain().focus().toggleStrike().run();
            onClose();
          }}
          className={`px-3 py-2 rounded line-through ${
            editor.isActive('strike') ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          title="קו חוצה"
        >
          S
        </button>

        <div className="border-l border-gray-300 h-6 mx-1" />

        <div className="relative">
          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => setShowHighlightColors((v) => !v)}
            className={`px-3 py-2 rounded ${
              editor.isActive('highlight') ? 'bg-gray-300' : 'hover:bg-gray-100'
            }`}
            title="צבע סימון"
          >
            🖍️
          </button>
          {showHighlightColors && (
            <div
              className="absolute top-full mt-1 right-0 bg-white border border-gray-300 rounded-lg shadow-lg p-2 z-10"
              onMouseDown={preventBlur}
            >
              <div className="grid grid-cols-3 gap-1">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onMouseDown={preventBlur}
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
                type="button"
                onMouseDown={preventBlur}
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

        <div className="border-l border-gray-300 h-6 mx-1" />

        <button
          type="button"
          onMouseDown={preventBlur}
          onClick={() => {
            editor
              .chain()
              .focus()
              .unsetAllMarks()
              .unsetColor()
              .unsetHighlight()
              .run();
            onClose();
          }}
          className="px-3 py-2 rounded hover:bg-gray-100 text-sm flex items-center gap-1"
          title="נקה את כל העיצובים (מודגש, נטוי, קו חוצה, צבע, סימון)"
        >
          🧹 נקה עיצוב
        </button>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
        <span className="text-xs text-gray-600 whitespace-nowrap">צבע טקסט:</span>
        <div className="grid grid-cols-6 gap-1">
          {TEXT_COLORS.map((c) => {
            const isActive = currentColor?.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                onMouseDown={preventBlur}
                onClick={() => {
                  editor.chain().focus().setColor(c.value).run();
                  onClose();
                }}
                className={`w-7 h-7 rounded border hover:scale-110 transition-transform ${
                  isActive ? 'border-2 border-blue-500 ring-1 ring-blue-300' : 'border-gray-300'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
                aria-label={`צבע טקסט ${c.name}`}
              />
            );
          })}
        </div>
        <button
          type="button"
          onMouseDown={preventBlur}
          onClick={() => {
            editor.chain().focus().unsetColor().run();
            onClose();
          }}
          className="text-xs px-2 py-1 hover:bg-gray-100 rounded text-gray-600 whitespace-nowrap"
          title="הסר צבע טקסט"
        >
          ✕ צבע
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
          className="min-h-[150px] p-3 [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:w-full"
        >
          <EditorContent 
            editor={editor} 
            className="prose max-w-none w-full h-full prose-strong:text-inherit"
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

