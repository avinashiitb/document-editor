import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import { Extension, textInputRule, InputRule } from "@tiptap/core";

import { defaultBlockSpecs, BlockNoteSchema } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  SideMenuController,
  SideMenu,
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  BlockColorsItem,
  useBlockNoteEditor,
  useExtensionState,
  useComponentsContext
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import { AddDocBlock, insertAddDocBlock } from './blocks/AddDocBlock';
import { CustomCodeBlock } from './blocks/CustomCodeBlock';
import { ColumnList, Column, getColumnSlashMenuItems } from './blocks/ColumnBlock';
import { sanitizeBlocks } from './utils/editorUtils';
import TopBar from './header/topbar';

function detectContentType(content) {
  try {
    JSON.parse(content);
    return 'json';
  } catch { }

  if (content.includes('<html') || content.includes('<div')) {
    return 'html';
  }

  if (
    content.includes('# ') ||
    content.includes('## ') ||
    content.includes('```')
  ) {
    return 'markdown';
  }

  if (
    content.match(/SELECT|INSERT|UPDATE|DELETE/i)
  ) {
    return 'sql';
  }

  return 'text';
}

const editorContainer = { instance: null };

const SymbolConversionExtension = Extension.create({
  name: "symbolConversion",
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*(?:`{3})([a-zA-Z0-9+#-]*)\s$/,
        handler: ({ state, range, match }) => {
          const editor = editorContainer.instance;
          if (editor) {
            const currentBlock = editor.getTextCursorPosition()?.block;
            if (currentBlock && currentBlock.type === "paragraph") {
              setTimeout(() => {
                editor.updateBlock(currentBlock.id, {
                  type: "codeBlock",
                  props: {
                    language: match[1] || "javascript",
                    code: "",
                  },
                });
              }, 0);
              return state.tr.delete(range.from, range.to);
            }
          }
          return null;
        },
      }),
      textInputRule({
        find: /->$/,
        replace: "→",
      }),
      textInputRule({
        find: /<-$/,
        replace: "←",
      }),
      textInputRule({
        find: /!=$/,
        replace: "≠",
      }),
      textInputRule({
        find: /=>$/,
        replace: "⇒",
      }),
      textInputRule({
        find: />=$/,
        replace: "≥",
      }),
      textInputRule({
        find: /<=$/,
        replace: "≤",
      }),
      textInputRule({
        find: /\+-$/,
        replace: "±",
      }),
      textInputRule({
        find: /\.\.\.$/,
        replace: "…",
      }),
      textInputRule({
        find: /\(c\)$/i,
        replace: "©",
      }),
      textInputRule({
        find: /\(r\)$/i,
        replace: "®",
      }),
      textInputRule({
        find: /\(tm\)$/i,
        replace: "™",
      }),
    ];
  },
});

const BlockConvertItem = (props) => {
  const Components = useComponentsContext();
  const [searchQuery, setSearchQuery] = useState("");
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });

  const conversionItems = [
    { type: "paragraph", label: "Paragraph", icon: "ri-paragraph" },
    { type: "heading", level: 1, label: "Heading 1", icon: "ri-h-1" },
    { type: "heading", level: 2, label: "Heading 2", icon: "ri-h-2" },
    { type: "heading", level: 3, label: "Heading 3", icon: "ri-h-3" },
    { type: "bulletListItem", label: "Bullet List", icon: "ri-list-unordered" },
    { type: "numberedListItem", label: "Numbered List", icon: "ri-list-ordered" },
    { type: "checkListItem", label: "Check List", icon: "ri-checkbox-line" },
    { type: "toggleListItem", label: "Toggle List", icon: "ri-arrow-right-s-line" },
    { type: "quote", label: "Quote", icon: "ri-double-quotes-l" },
    { type: "codeBlock", label: "Code Block", icon: "ri-code-box-line" },
  ];

  const filteredItems = conversionItems.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!Components) return null;

  return (
    <Components.Generic.Menu.Root position={"right"} sub={true}>
      <Components.Generic.Menu.Trigger sub={true}>
        <Components.Generic.Menu.Item
          className={"bn-menu-item"}
          subTrigger={true}
        >
          {props.children}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>

      <Components.Generic.Menu.Dropdown
        sub={true}
        className={"bn-menu-dropdown"}
      >
        <div className="menu-search-wrapper">
          <input
            type="text"
            className="menu-search-input"
            placeholder="Search block types..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()} // Prevent closing menu on click
          />
        </div>
        <div className="block-conversion-list">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => (
              <Components.Generic.Menu.Item
                key={idx}
                className={"bn-menu-item"}
                onClick={() => {
                  if (block) {
                    if (item.type === "heading") {
                      editor.updateBlock(block, { type: "heading", props: { level: item.level } });
                    } else {
                      editor.updateBlock(block, { type: item.type });
                    }
                    editor.getExtension(SideMenuExtension)?.unfreezeMenu();
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={item.icon} style={{ fontSize: '14px' }}></i>
                  <span>{item.label}</span>
                </div>
              </Components.Generic.Menu.Item>
            ))
          ) : (
            <div className="block-conversion-no-results">No block types found</div>
          )}
        </div>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};

const CustomDragHandleMenu = (props) => {
  return (
    <DragHandleMenu {...props}>
      <RemoveBlockItem {...props}>Delete</RemoveBlockItem>
      <BlockColorsItem {...props}>Colors</BlockColorsItem>
      <BlockConvertItem>Convert to</BlockConvertItem>
    </DragHandleMenu>
  );
};

const CustomSideMenu = (props) => (
  <SideMenu {...props}>
    <DragHandleButton
      {...props}
      dragHandleMenu={(menuProps) => (
        <CustomDragHandleMenu {...menuProps} />
      )}
    />
  </SideMenu>
);

// Destructure defaultBlockSpecs to exclude the default codeBlock spec
const { codeBlock: _, ...restDefaultBlockSpecs } = defaultBlockSpecs;

// Schema Definition using custom block spec
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...restDefaultBlockSpecs,
    addDoc: AddDocBlock(),
    codeBlock: CustomCodeBlock(),
    column_list: ColumnList(),
    column: Column(),
  },
});

function App() {
  const [fileName, setFileName] = useState('Untitled Document');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [initialContent, setInitialContent] = useState(null);
  const [contentDoc, setContentDoc] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [zoomLevel, setZoomLevel] = useState(100);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 10, 50));
  };

  const handleZoomReset = () => {
    setZoomLevel(100);
  };

  const getThemeFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      let t = url.searchParams.get("theme");
      if (!t && window.location.hash.includes("?")) {
        t = new URLSearchParams(window.location.hash.split("?")[1]).get("theme");
      }
      return t;
    } catch (e) {
      return null;
    }
  };

  // Theme state persisted in localStorage
  const [theme, setTheme] = useState(() => {
    const urlTheme = getThemeFromUrl();
    if (urlTheme === "dark" || urlTheme === "light") return urlTheme;
    const preloadTheme = window.pluginAPI?.context?.theme;
    if (preloadTheme === "dark" || preloadTheme === "light") return preloadTheme;
    return localStorage.getItem('document-editor-theme') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('document-editor-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.className = theme + '-theme';
  }, [theme]);

  // Listen for runtime theme changes via window.postMessage
  useEffect(() => {
    const handleMessage = ({ data }) => {
      if (data && data.type === 'theme-changed') {
        if (data.theme === 'dark' || data.theme === 'light') {
          setTheme(data.theme);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Sync theme when URL updates
  useEffect(() => {
    const handleHashChange = () => {
      const urlTheme = getThemeFromUrl();
      if (urlTheme === "dark" || urlTheme === "light") {
        setTheme(urlTheme);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);





  // Fetch FileId from context or URL search params
  const getFileId = () => {
    let id = window.pluginAPI?.context?.fileId;
    if (id) return id;

    try {
      const url = new URL(window.location.href);
      id = url.searchParams.get("fileId");
      if (!id && window.location.hash.includes("?")) {
        const hashParams = new URLSearchParams(window.location.hash.split("?")[1]);
        id = hashParams.get("fileId");
      }
    } catch (e) { }
    return id;
  };

  const fileId = getFileId();

  // Load Initial Data from DevScribe DB
  useEffect(() => {
    const loadInitialData = async () => {
      if (window.pluginAPI && fileId) {
        try {
          console.log('Fetching details for fileId:', fileId);
          const fileInfo = await window.pluginAPI.getFileDetailsById(fileId);
          if (fileInfo && fileInfo.title) {
            setFileName(fileInfo.title);
          }

          // Fetch breadcrumbs
          if (window.pluginAPI.getNestedPath) {
            window.pluginAPI.getNestedPath({ fileId }).then((result) => {
              if (result) {
                const segs = [
                  ...result.folders.map((f) => ({ label: f.name, isFile: false })),
                  ...(result.file ? [{ label: result.file.title, isFile: true }] : []),
                ];
                setBreadcrumbs(segs);
              }
            }).catch(() => { });
          }

          console.log('Loading documents by parent file...');
          const data = await window.pluginAPI.getDocumentsByParentFile(fileId);
          console.log('Loaded API data:', data);

          if (data && data.length > 0) {
            const documentObj = data[0];
            setContentDoc(documentObj);

            let savedData = documentObj?.blocks?.[0]?.data;
            console.log('Detected block data layer:', savedData);

            if (typeof savedData === 'string') {
              try {
                savedData = JSON.parse(savedData);
              } catch (e) {
                console.warn('Failed parsing raw block string', e);
              }
            }

            if (savedData && typeof savedData === 'object' && savedData.blocks) {
              // Loaded rich text blocks from BlockNote
              setInitialContent(sanitizeBlocks(savedData.blocks));
            } else {
              setInitialContent(sanitizeBlocks(getDefaultBlocks(fileInfo?.title)));
            }
          } else {
            console.log('No documents found. Initializing default welcome document.');
            setInitialContent(sanitizeBlocks(getDefaultBlocks(fileInfo?.title)));
          }
        } catch (err) {
          console.warn('Failed to load initial data:', err);
          setInitialContent(sanitizeBlocks(getDefaultBlocks()));
        } finally {
          setIsReady(true);
        }
      } else {
        // Fallback for standalone development outside DevScribe
        setInitialContent(sanitizeBlocks(getDefaultBlocks()));
        setIsReady(true);
      }
    };

    setTimeout(loadInitialData, 100);
  }, [fileId]);

  // Generate standard default welcome document
  const getDefaultBlocks = (title) => {
    const docTitle = title ? title.replace(/\.[^/.]+$/, "") : "Untitled Document";
    return [
      {
        type: "heading",
        content: [{ type: "text", text: `Welcome to ${docTitle}`, styles: {} }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "This is your distraction-free document editor. Here you can write rich text, nest lists, embed media, and format code—or simply paste Markdown or HTML content to import your files directly.", styles: {} }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Type '/' to browse commands, formatting options, and block types. It supports Markdown shortcuts directly—for example, type ``` + space for a Code Block or ## + space for a Heading.", styles: {} }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Need to link external files? Type '/' and search 'link file' to embed Code documents, API specs, diagrams, or live terminals directly into your workspace.", styles: {} }]
      }
    ];
  };

  // Local file upload handler converting assets to Base64 data URLs
  const handleUploadFile = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert asset to Base64'));
        }
      };
      reader.onerror = () => {
        reject(reader.error || new Error('FileReader encountered an error'));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Instantiates the editor once the initial content is loaded
  const editor = useCreateBlockNote(
    {
      schema: schema,
      initialContent: initialContent || undefined,
      uploadFile: handleUploadFile,
      tables: {
        headers: true,
        splitCells: true,
        cellBackgroundColor: true,
        cellTextColor: true
      },
      pasteHandler: ({ event, editor, defaultPasteHandler }) => {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return defaultPasteHandler();

        const hasHTML = event.clipboardData?.types.includes("text/html");
        const language = detectContentType(text);
        console.log("Detected language type:", language, "hasHTML:", hasHTML);

        if (hasHTML && language !== 'markdown') {
          return defaultPasteHandler();
        }

        if (language === 'html') {
          return defaultPasteHandler();
        }

        if (language === 'markdown' || language === 'sql' || language === 'text') {
          const cursor = editor.getTextCursorPosition();
          const target = event.target;
          const isInCode = cursor?.block?.type === 'codeBlock' ||
            (target && typeof target.closest === 'function' && target.closest('pre, code, textarea, .bn-code-block, [data-content-type="codeBlock"]'));

          if (!isInCode) {
            try {
              const blocks = sanitizeBlocks(editor.tryParseMarkdownToBlocks(text));
              const currentBlock = editor.getTextCursorPosition()?.block;
              const isBlockEmpty = currentBlock && (
                !currentBlock.content ||
                currentBlock.content.length === 0 ||
                (currentBlock.content.length === 1 && currentBlock.content[0].type === "text" && currentBlock.content[0].text === "")
              );

              if (isBlockEmpty && currentBlock.type === "paragraph") {
                editor.replaceBlocks([currentBlock.id], blocks);
              } else if (currentBlock) {
                editor.insertBlocks(blocks, currentBlock.id, "after");
              } else {
                editor.replaceBlocks(editor.document, blocks);
              }
            } catch (err) {
              console.error("Failed to parse markdown:", err);
              defaultPasteHandler();
            }
            return true;
          }
        }

        return defaultPasteHandler();
      },
      _tiptapOptions: {
        extensions: [SymbolConversionExtension],
      }
    },
    [initialContent !== null]
  );

  useEffect(() => {
    editorContainer.instance = editor;
    return () => {
      editorContainer.instance = null;
    };
  }, [editor]);

  // Sync / Save callback
  const handleSave = useCallback(async (blocksToSave, showNotification = false) => {
    if (window.pluginAPI && window.pluginAPI.updateDocument && fileId && blocksToSave) {
      console.log('Attempting to save block document...');
      setSaveStatus('saving');

      const payloadData = { blocks: blocksToSave };
      console.log('Payload structure mapping to block data:', payloadData);

      const updatedContents = {
        version: "1.0.0",
        time: Date.now(),
        blocks: [{ type: "document-editor", data: payloadData }],
        parent_file: fileId,
        _id: contentDoc?._id,
      };

      try {
        await window.pluginAPI.updateDocument(fileId, [updatedContents]);
        console.log('Save operation completed successfully via updateDocument');
        setSaveStatus('saved');
        if (showNotification && window.pluginAPI.notify) {
          window.pluginAPI.notify('Document saved successfully', 'success');
        }
      } catch (err) {
        console.error('Save error thrown by updateDocument:', err);
        setSaveStatus('error');
        if (showNotification && window.pluginAPI.notify) {
          window.pluginAPI.notify('Failed to save document', 'error');
        }
      }
    } else {
      console.warn('Cannot save: pluginAPI, updateDocument, fileId, or blocksToSave is not defined.');
    }
  }, [fileId, contentDoc]);

  // Handle typing auto-save with a 1.2s debounce
  const saveTimeoutRef = useRef(null);
  const handleEditorChange = useCallback(() => {
    if (!editor) return;

    // Ensure every column has a trailing text/paragraph block below non-paragraph elements (like codeBlock)
    const traverseColumns = (blocks) => {
      for (const block of blocks) {
        if (block.type === 'column') {
          const children = block.children || [];
          if (children.length > 0) {
            const lastChild = children[children.length - 1];
            if (lastChild.type !== 'paragraph') {
              try {
                editor.insertBlocks(
                  [{ type: 'paragraph', content: [] }],
                  lastChild.id,
                  'after'
                );
              } catch (_) {}
            }
          }
        }
        if (block.children && block.children.length > 0) {
          traverseColumns(block.children);
        }
      }
    };

    try {
      traverseColumns(editor.document);
    } catch (_) {}

    setSaveStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave(editor.document);
    }, 1200);
  }, [editor, handleSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Handle Enter key inside column blocks to ensure it ALWAYS creates a new paragraph block inside the column and NEVER creates a new column
  useEffect(() => {
    const handleEnterKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && editor) {
        const target = e.target;
        const cursor = editor.getTextCursorPosition();
        const currentBlock = cursor?.block;

        // Skip interception if focus or cursor is inside a code block -- let CodeMirror create new lines
        const isInCode = currentBlock?.type === 'codeBlock' ||
          (target && typeof target.closest === 'function' && target.closest('pre, code, textarea, .cm-editor, .bn-code-block, [data-content-type="codeBlock"]'));

        if (isInCode) return;

        if (!cursor || !currentBlock) return;

        // 1. Direct hit on column or column_list container node
        if (currentBlock.type === 'column' || currentBlock.type === 'column_list') {
          e.preventDefault();
          e.stopPropagation();
          const targetId = currentBlock.type === 'column' ? currentBlock.id : currentBlock.children?.[0]?.id || currentBlock.id;
          const newBlocks = editor.insertBlocks(
            [{ type: 'paragraph', content: [] }],
            targetId,
            currentBlock.type === 'column' ? 'nested' : 'after'
          );
          if (newBlocks && newBlocks.length > 0) {
            editor.setTextCursorPosition(newBlocks[0].id, 'start');
          }
          return;
        }

        // 2. Check if currentBlock is inside a column
        let parentBlock = null;
        try {
          parentBlock = editor.getParentBlock(currentBlock.id);
        } catch (_) {}

        if (parentBlock && parentBlock.type === 'column') {
          const isBlockEmpty =
            !currentBlock.content ||
            currentBlock.content.length === 0 ||
            (currentBlock.content.length === 1 && currentBlock.content[0].type === "text" && currentBlock.content[0].text === "");

          // If current block is empty or is a non-paragraph block (except codeBlock)
          if (isBlockEmpty || currentBlock.type !== 'paragraph') {
            e.preventDefault();
            e.stopPropagation();
            const newBlocks = editor.insertBlocks(
              [{ type: 'paragraph', content: [] }],
              currentBlock.id,
              'after'
            );
            if (newBlocks && newBlocks.length > 0) {
              editor.setTextCursorPosition(newBlocks[0].id, 'start');
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleEnterKey, true);
    return () => document.removeEventListener('keydown', handleEnterKey, true);
  }, [editor]);

  // Handle Backspace key inside column blocks to ensure it NEVER deletes columns or merges across column boundaries
  useEffect(() => {
    const handleBackspaceKey = (e) => {
      if (e.key === 'Backspace' && editor) {
        const target = e.target;
        const cursor = editor.getTextCursorPosition();
        const currentBlock = cursor?.block;

        // Skip interception if focus or cursor is inside a code block -- let CodeMirror handle backspace
        const isInCode = currentBlock?.type === 'codeBlock' ||
          (target && typeof target.closest === 'function' && target.closest('pre, code, textarea, .cm-editor, .bn-code-block, [data-content-type="codeBlock"]'));

        if (isInCode) return;

        if (!cursor || !currentBlock) return;

        // 1. Direct selection on column or column_list node
        if (currentBlock.type === 'column' || currentBlock.type === 'column_list') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 2. Check if currentBlock is inside a column
        let parentBlock = null;
        try {
          parentBlock = editor.getParentBlock(currentBlock.id);
        } catch (_) {}

        if (parentBlock && parentBlock.type === 'column') {
          const children = parentBlock.children || [];
          const isFirstChild = children.length > 0 && children[0].id === currentBlock.id;
          const isBlockEmpty =
            !currentBlock.content ||
            currentBlock.content.length === 0 ||
            (currentBlock.content.length === 1 && currentBlock.content[0].type === "text" && currentBlock.content[0].text === "");

          const isAtStart = cursor.textCursorPosition === 0 || isBlockEmpty;

          // If current block is the TOP / FIRST element in the column:
          if (isFirstChild) {
            if (isAtStart) {
              e.preventDefault();
              e.stopPropagation();

              // If it's a non-paragraph block (like Heading, etc.), convert it to paragraph
              if (currentBlock.type !== 'paragraph') {
                editor.updateBlock(currentBlock.id, {
                  type: 'paragraph',
                  props: {},
                  content: []
                });
              }
              // If it's already a paragraph and empty, do nothing (keep empty text block in column)
              return;
            }
          } else if (isBlockEmpty) {
            // If it's NOT the first child, but is an empty block, remove it and focus previous block IN SAME COLUMN
            e.preventDefault();
            e.stopPropagation();
            const childIdx = children.findIndex(c => c.id === currentBlock.id);
            const prevSibling = childIdx > 0 ? children[childIdx - 1] : null;

            editor.removeBlocks([currentBlock.id]);
            if (prevSibling) {
              editor.setTextCursorPosition(prevSibling.id, 'end');
            }
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handleBackspaceKey, true);
    return () => document.removeEventListener('keydown', handleBackspaceKey, true);
  }, [editor]);

  // Keyboard shortcut Ctrl/Cmd + S to trigger instant save
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (editor) {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          handleSave(editor.document, true);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor, handleSave]);

  if (!isReady || !editor) {
    return (
      <div className="editor-loading">
        <i className="ri-loader-4-line ri-spin loading-icon"></i>
        <span>Loading Document...</span>
      </div>
    );
  }

  return (
    <div className={`App document-editor-app ${theme}-theme`}>
      <TopBar
        fileName={fileName}
        breadcrumbs={breadcrumbs}
        saveStatus={saveStatus}
        editor={editor}
        contentDoc={contentDoc}
        fileId={fileId}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />

      <div className="workspace">
        <main className="editor-container" id="blocknote-editor-wrapper">
          <div className="editor-paper" style={{ zoom: `${zoomLevel}%` }}>
            <BlockNoteView
              editor={editor}
              onChange={handleEditorChange}
              theme={theme}
              slashMenu={false}
              sideMenu={false}
            >
              <SuggestionMenuController
                triggerCharacter={"/"}
                getItems={async (query) => {
                  const items = [
                    ...getDefaultReactSlashMenuItems(editor),
                    ...getColumnSlashMenuItems(editor),
                    insertAddDocBlock(editor)
                  ];
                  return items.filter(item =>
                    item.title.toLowerCase().includes(query.toLowerCase()) ||
                    item.aliases?.some(alias => alias.toLowerCase().includes(query.toLowerCase()))
                  );
                }}
              />
              <SideMenuController sideMenu={CustomSideMenu} />
            </BlockNoteView>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
