import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

function App() {
  const [fileName, setFileName] = useState('Untitled Document');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [initialContent, setInitialContent] = useState(null);
  const [contentDoc, setContentDoc] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'

  // Dropdown Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
                setInitialContent(savedData.blocks);
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
                setInitialContent(migratedBlocks);
              } else {
                setInitialContent(getDefaultBlocks(fileInfo?.title));
              }
            } else {
              setInitialContent(getDefaultBlocks(fileInfo?.title));
            }
          } else {
            console.log('No documents found. Initializing default welcome document.');
            setInitialContent(getDefaultBlocks(fileInfo?.title));
          }
        } catch (err) {
          console.warn('Failed to load initial data:', err);
          setInitialContent(getDefaultBlocks());
        } finally {
          setIsReady(true);
        }
      } else {
        // Fallback for standalone development outside DevScribe
        setInitialContent(getDefaultBlocks());
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
        content: `Welcome to ${docTitle}`
      },
      {
        type: "paragraph",
        content: "This is your clean, distraction-free document editing workspace. It supports robust rich text, list nesting, media blocks, and code formatting."
      },
      {
        type: "paragraph",
        content: "Type '/' to see all block types and formatting commands."
      }
    ];
  };

  // Instantiates the editor once the initial content is loaded
  const editor = useCreateBlockNote(
    {
      initialContent: initialContent || undefined,
      tables: {
        headers: true,
        splitCells: true,
        cellBackgroundColor: true,
        cellTextColor: true
      }
    },
    [initialContent !== null]
  );

  // Sync / Save callback
  const handleSave = useCallback(async (blocksToSave, showNotification = false) => {
    if (!window.pluginAPI || !fileId || !blocksToSave) return;

    setSaveStatus('saving');
    const payloadData = { blocks: blocksToSave };

    const updatedContents = {
      version: "1.0.0",
      time: Date.now(),
      blocks: [{ type: "document-editor", data: payloadData }],
      parent_file: fileId,
      _id: contentDoc?._id,
    };

    try {
      await window.pluginAPI.updateDocument(fileId, [updatedContents]);
      setSaveStatus('saved');
      if (showNotification && window.pluginAPI.notify) {
        window.pluginAPI.notify('Document saved successfully', 'success');
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
      if (showNotification && window.pluginAPI.notify) {
        window.pluginAPI.notify('Failed to save document', 'error');
      }
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

  // Export action handling
  const handleExport = async (format) => {
    if (!editor) return;
    try {
      let payload = '';
      let fileExtension = '';
      let mimeType = '';

      if (format === 'ds') {
        payload = JSON.stringify({
          _id: contentDoc?._id || `doc-${Date.now()}`,
          version: "1.0.0",
          time: Date.now(),
          parent_file: fileId || "standalone-export",
          blocks: [{ type: "document-editor", data: { blocks: editor.document } }],
          createdAt: contentDoc?.createdAt || Date.now(),
          updatedAt: Date.now(),
          fileType: "document-editor"
        }, null, 2);
        fileExtension = 'ds';
        mimeType = 'application/json';
      } else if (format === 'md') {
        payload = await editor.blocksToMarkdownLossy(editor.document);
        fileExtension = 'md';
        mimeType = 'text/markdown';
      } else if (format === 'html') {
        payload = await editor.blocksToHTMLLossy(editor.document);
        fileExtension = 'html';
        mimeType = 'text/html';
      }

      const blob = new Blob([payload], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = fileName ? fileName.split('.')[0] : 'document';
      a.download = `${safeName}.${fileExtension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (window.pluginAPI && window.pluginAPI.notify) {
        window.pluginAPI.notify(`Exported as ${format.toUpperCase()} successfully`, 'success');
      }
    } catch (err) {
      console.error('Export failed:', err);
      if (window.pluginAPI && window.pluginAPI.notify) {
        window.pluginAPI.notify('Failed to export document', 'error');
      }
    }
    setIsMenuOpen(false);
  };

  if (!isReady || !editor) {
    return (
      <div className="editor-loading">
        <i className="ri-loader-4-line ri-spin loading-icon"></i>
        <span>Loading Document...</span>
      </div>
    );
  }

  return (
    <div className="App document-editor-app">
      <header className="readdy-light-topbar">
        <div className="topbar-left">
          <nav className="breadcrumb-path" aria-label="file path">
            <i className="ri-file-text-line file-icon-nav" style={{ marginRight: 6, fontSize: 14, color: '#4F46E5' }}></i>
            {(breadcrumbs.length > 0
              ? breadcrumbs
              : [{ label: fileName, isFile: true }]
            ).map((seg, idx) => (
              <React.Fragment key={idx}>
                {!seg.isFile && (
                  <>
                    <span className="breadcrumb-folder" title={seg.label}>
                      {seg.label}
                    </span>
                    <span className="breadcrumb-chevron">›</span>
                  </>
                )}
                {seg.isFile && (
                  <span className="breadcrumb-file" title={seg.label}>
                    {seg.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="topbar-center">
          <div className="save-status-container">
            {saveStatus === 'saved' && (
              <span className="save-status saved" title="All changes saved to DB">
                <i className="ri-checkbox-circle-fill"></i>
                Saved
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="save-status saving" title="Saving changes...">
                <i className="ri-loader-4-line ri-spin"></i>
                Saving
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="save-status error" title="Connection error, click Ctrl/Cmd + S to retry">
                <i className="ri-error-warning-fill"></i>
                Save Error
              </span>
            )}
          </div>
        </div>

        <div className="topbar-right">
          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="options-dropdown-btn"
              id="options-menu-trigger"
            >
              <i className="ri-menu-fill" style={{ marginRight: "6px", color: "#4F46E5" }}></i>
              Document options
              <i className="ri-arrow-down-s-line" style={{ marginLeft: "4px", color: "#6b7280" }}></i>
            </button>

            {isMenuOpen && (
              <div className="options-dropdown-menu">
                <div style={{ padding: "4px 0" }}>
                  <div className="menu-section-header">Export document</div>
                  
                  <button
                    className="menu-item-light"
                    id="export-ds-btn"
                    onClick={() => handleExport('ds')}
                  >
                    <i className="ri-file-code-fill" style={{ marginRight: "10px", color: "#4F46E5" }}></i>
                    DevScribe (.ds)
                  </button>

                  <button
                    className="menu-item-light"
                    id="export-md-btn"
                    onClick={() => handleExport('md')}
                  >
                    <i className="ri-markdown-fill" style={{ marginRight: "10px", color: "#009688" }}></i>
                    Markdown (.md)
                  </button>

                  <button
                    className="menu-item-light"
                    id="export-html-btn"
                    onClick={() => handleExport('html')}
                  >
                    <i className="ri-html5-fill" style={{ marginRight: "10px", color: "#FF5722" }}></i>
                    Web Page (.html)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace">
        <main className="editor-container" id="blocknote-editor-wrapper">
          <div className="editor-paper">
            <BlockNoteView 
              editor={editor} 
              onChange={handleEditorChange}
              theme="light"
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
