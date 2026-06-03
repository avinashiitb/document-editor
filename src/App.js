import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

import { defaultBlockSpecs, BlockNoteSchema } from "@blocknote/core";
import { 
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import { AddDocBlock, insertAddDocBlock } from './blocks/AddDocBlock';
import { sanitizeBlocks } from './utils/editorUtils';
import TopBar from './header/topbar';

// Schema Definition using custom block spec
const schema = BlockNoteSchema.create().extend({
  blockSpecs: {
    ...defaultBlockSpecs,
    addDoc: AddDocBlock(),
  },
});

function App() {
  const [fileName, setFileName] = useState('Untitled Document');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [initialContent, setInitialContent] = useState(null);
  const [contentDoc, setContentDoc] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  
  // Theme state persisted in localStorage
  const [theme] = useState(() => {
    return localStorage.getItem('document-editor-theme') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('document-editor-theme', theme);
  }, [theme]);





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
    } catch (e) {}
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
            }).catch(() => {});
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

            if (savedData && typeof savedData === 'object') {
              if (savedData.blocks) {
                // Loaded rich text blocks from BlockNote
                setInitialContent(sanitizeBlocks(savedData.blocks));
              } else if (savedData.code !== undefined && savedData.code !== null) {
                // Graceful migration of old code-editor database entries
                const migratedBlocks = [
                  {
                    type: "heading",
                    content: "Migrated Code File"
                  },
                  {
                    type: "paragraph",
                    content: "This file was migrated from a legacy code editor format."
                  },
                  {
                    type: "code",
                    content: savedData.code,
                    language: savedData.language || "javascript"
                  }
                ];
                setInitialContent(sanitizeBlocks(migratedBlocks));
              } else {
                setInitialContent(sanitizeBlocks(getDefaultBlocks(fileInfo?.title)));
              }
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
        content: [{ type: "text", text: "This is your clean, distraction-free document editing workspace. It supports robust rich text, list nesting, media blocks, and code formatting.", styles: {} }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Type '/' to see all block types and formatting commands.", styles: {} }]
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
        const isInsideCodeBlock = (target) => {
          if (!target) return false;
          let element = target;
          while (element) {
            if (
              element.tagName === 'PRE' || 
              element.tagName === 'CODE' || 
              element.tagName === 'TEXTAREA' ||
              element.classList?.contains('bn-code-block') ||
              element.getAttribute?.('data-content-type') === 'codeBlock'
            ) {
              return true;
            }
            element = element.parentElement;
          }
          return false;
        };

        const cursor = editor.getTextCursorPosition();
        const isCursorInCode = cursor?.block && (
          cursor.block.type === 'codeBlock' || 
          cursor.block.type === 'code' || 
          cursor.block.type === 'pre'
        );

        if (isCursorInCode || isInsideCodeBlock(event.target)) {
          return defaultPasteHandler();
        }

        if (event.clipboardData?.types.includes("text/plain")) {
          const text = event.clipboardData.getData("text/plain");
          
          (async () => {
            try {
              const blocks = await editor.tryParseMarkdownToBlocks(text);
              const nextCursor = editor.getTextCursorPosition();
              if (nextCursor && nextCursor.block) {
                const isBlockEmpty = 
                  !nextCursor.block.content || 
                  nextCursor.block.content.length === 0 || 
                  (nextCursor.block.content.length === 1 && nextCursor.block.content[0].type === "text" && nextCursor.block.content[0].text === "");

                if (isBlockEmpty && nextCursor.block.type === "paragraph") {
                  editor.replaceBlocks([nextCursor.block.id], blocks);
                } else {
                  editor.insertBlocks(blocks, nextCursor.block.id, "after");
                }
              } else {
                editor.replaceBlocks(editor.document, blocks);
              }
            } catch (err) {
              console.error("Failed to parse pasted markdown:", err);
              defaultPasteHandler();
            }
          })();
          
          return true;
        }
        return defaultPasteHandler();
      }
    },
    [initialContent !== null]
  );

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
      />

      <div className="workspace">
        <main className="editor-container" id="blocknote-editor-wrapper">
          <div className="editor-paper">
            <BlockNoteView 
              editor={editor} 
              onChange={handleEditorChange}
              theme={theme}
              slashMenu={false}
            >
              <SuggestionMenuController
                triggerCharacter={"/"}
                getItems={async (query) => {
                  const items = [...getDefaultReactSlashMenuItems(editor), insertAddDocBlock(editor)];
                  return items.filter(item => 
                    item.title.toLowerCase().includes(query.toLowerCase()) ||
                    item.aliases?.some(alias => alias.toLowerCase().includes(query.toLowerCase()))
                  );
                }}
              />
            </BlockNoteView>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
