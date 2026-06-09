import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createReactBlockSpec } from "@blocknote/react";

// Helper to determine icon class based on file type for the configured card
const getFileIconClass = (type) => {
  switch (type) {
    case 'diagram':
    case 'archflow':
    case 'canvas':
      return 'ri-bubble-chart-fill';
    case 'terminal':
    case 'promptly':
      return 'ri-terminal-box-fill';
    case 'json':
      return 'ri-braces-fill';
    case 'data-bridge':
      return 'ri-database-2-fill';
    default:
      return 'ri-file-text-fill';
  }
};

// Helper to determine icon class based on file type for the selection list
const getFileListIconClass = (type) => {
  switch (type) {
    case 'diagram':
    case 'archflow':
    case 'canvas':
      return 'ri-bubble-chart-line';
    case 'terminal':
    case 'promptly':
      return 'ri-terminal-box-line';
    case 'json':
      return 'ri-braces-line';
    case 'data-bridge':
      return 'ri-database-2-line';
    default:
      return 'ri-file-text-line';
  }
};

// React Component for code preview embedding via iframe
function CodePreviewEmbed({ fileId, title, fileType, handleUnlink, handleNavigate }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const isDiag = fileType === 'archflow' || fileType === 'diagram';
  const isJson = fileType === 'json';
  const isDataBridge = fileType === 'data-bridge';
  const rawDefaultHeight = isDiag ? 450 : (isJson ? 200 : (isDataBridge ? 450 : 150));
  const defaultHeight = Math.min(800, Math.max(200, rawDefaultHeight));
  const [iframeHeight, setIframeHeight] = useState(defaultHeight);

  useEffect(() => {
    const handleMessage = async (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;

      if (e.data?.type === 'PREVIEW_READY') {
        if (window.pluginAPI?.getDocumentsByParentFile) {
          try {
            const data = await window.pluginAPI.getDocumentsByParentFile(fileId);
            if (data && data.length > 0) {
              const document = data[0];
              const blockObj = isDiag
                ? (document?.blocks?.find(b => b.type === "archflow") || document?.blocks?.[0])
                : (isJson
                    ? (document?.blocks?.find(b => b.type === "json-analyzer") || document?.blocks?.[0])
                    : (isDataBridge
                        ? (document?.blocks?.find(b => b.type === "data-bridge") || document?.blocks?.[0])
                        : document?.blocks?.[0]));
              let savedData = blockObj?.data;
              if (typeof savedData === 'string') {
                try {
                  savedData = JSON.parse(savedData);
                } catch (err) {
                  console.warn('Failed parsing raw block string in preview', err);
                }
              }
              iframeRef.current.contentWindow.postMessage({
                type: 'LOAD_PREVIEW',
                data: savedData || (isDiag ? { nodes: [], edges: [] } : (isJson ? {} : (isDataBridge ? {} : { code: '', language: 'javascript' })))
              }, '*');
            }
          } catch (err) {
            console.error(`Failed to fetch preview data for ${isDiag ? 'archflow' : (isJson ? 'json' : (isDataBridge ? 'data-bridge' : 'code-editor'))}:`, err);
          }
        }
        setLoading(false);
      } else if (e.data?.type === 'RESIZE_PREVIEW') {
        if (e.data.height) {
          const clamped = Math.min(800, Math.max(200, e.data.height));
          setIframeHeight(clamped);
        }
      } else if (e.data?.type === 'IFRAME_WHEEL') {
        const scrollContainer = document.querySelector('.editor-container');
        if (scrollContainer) {
          scrollContainer.scrollBy({ top: e.data.deltaY, behavior: 'auto' });
        }
      } else if (e.data?.type === 'RUN_CODE') {
        const { code, language, javaConfig, fileName } = e.data;
        let result;
        try {
          if (!window.pluginAPI) {
            result = 'Error: pluginAPI is not available.';
          } else {
            if (language === 'javascript') {
              result = await window.pluginAPI.runJsCode(code);
            } else if (language === 'typescript') {
              result = await window.pluginAPI.runTsCode(code);
            } else if (language === 'shell') {
              result = await window.pluginAPI.runShellCommand(code);
            } else if (language === 'java') {
              const config = javaConfig || {
                javaHome: localStorage.getItem('code_editor_java_home') || '/usr/libexec/java_home',
                mainClass: localStorage.getItem('code_editor_main_class') || 'Main',
                enableSecurityManager: localStorage.getItem('code_editor_enable_security_manager') === 'true',
                jvmArgs: localStorage.getItem('code_editor_jvm_args') || '-Xmx512m -Xms256m'
              };
              result = await window.pluginAPI.runJavaCode(code, config);
            } else if (language === 'sqlite') {
              result = await window.pluginAPI.runSqliteCommand(code);
            } else if (language === 'docker') {
              result = await window.pluginAPI.runDockerCompose(code, 'up -d', fileName || 'preview-compose', fileId);
            }

            if (typeof result === 'object' && result !== null) {
              result = JSON.stringify(result, null, 2);
            } else {
              result = String(result) || 'Executed successfully (no output).';
            }
          }
        } catch (err) {
          result = `Error: ${err.message || String(err)}`;
        }

        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'RUN_CODE_RESULT',
            result: result
          }, '*');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fileId, isDiag, isJson, isDataBridge]);

  const pluginId = isDiag ? 'archflow' : (isJson ? 'json' : (isDataBridge ? 'data-bridge' : 'code-editor'));

  return (
    <div className="doc-link-embed-container" contentEditable={false} style={{ position: 'relative', border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden', margin: '8px 0', backgroundColor: '#FFFFFF', width: '100%', boxSizing: 'border-box' }}>
      <div className="doc-link-embed-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F3F4F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className={isDiag ? "ri-bubble-chart-fill" : (fileType === 'json' ? "ri-braces-fill" : (fileType === 'data-bridge' ? "ri-database-2-fill" : "ri-file-code-fill"))} style={{ color: isDiag ? '#8B5CF6' : (fileType === 'json' ? '#D97706' : (fileType === 'data-bridge' ? '#10B981' : '#2563EB')), fontSize: '16px' }}></i>
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#1F2937' }}>{title}</span>
          <span style={{ fontSize: '11px', color: '#6B7280', backgroundColor: '#E5E7EB', padding: '2px 6px', borderRadius: '4px' }}>Preview</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); handleNavigate(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #D1D5DB', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#374151', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
            title="Open full page"
          >
            <i className="ri-external-link-line"></i>
            Edit
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleUnlink(e); }}
            style={{ border: 'none', background: 'none', padding: '4px', cursor: 'pointer', color: '#9CA3AF' }}
            title="Unlink file"
          >
            <i className="ri-close-line" style={{ fontSize: '16px' }}></i>
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', height: `${iframeHeight}px`, maxHeight: '800px', minHeight: '200px', width: '100%', transition: 'height 0.2s ease' }}>
        <iframe
          ref={iframeRef}
          title={isDiag ? "Diagram Editor Preview" : (isJson ? "JSON Analyzer Preview" : (isDataBridge ? "Data Bridge Preview" : "Code Editor Preview"))}
          src={`devscribe-core-plugin://${pluginId}/#/?fileId=${fileId}&preview=true`}
          style={{ width: '100%', height: '100%', border: 'none', overflow: 'hidden' }}
          scrolling="no"
        />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', color: '#6B7280', fontSize: '13px', gap: '8px' }}>
            <i className="ri-loader-4-line ri-spin" style={{ fontSize: '18px' }}></i>
            Loading preview...
          </div>
        )}
      </div>
    </div>
  );
}

// 1. React Component for custom "Add/Link Document" block
function AddDocBlockComponent({ block, editor }) {
  const { fileId, title, fileType, embedMode } = block.props;
  const [searchQuery, setSearchQuery] = useState("");
  const [allFiles, setAllFiles] = useState([]);
  const [folders, setFolders] = useState([]);

  // Fetch folders hierarchy
  useEffect(() => {
    if (window.pluginAPI?.messaging?.invoke) {
      window.pluginAPI.messaging.invoke("getFolders")
        .then(res => {
          setFolders(res || []);
        })
        .catch(err => console.error("Failed to load folders:", err));
    }
  }, []);

  const folderMap = useMemo(() => {
    const map = {};
    (folders || []).forEach(f => {
      map[f._id] = f;
    });
    return map;
  }, [folders]);

  const getFullPath = useCallback((folderId) => {
    if (!folderId) return '';
    const parts = [];
    let currentId = folderId;
    const visited = new Set();
    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const folder = folderMap[currentId];
      if (!folder) break;
      parts.unshift(folder.name);
      currentId = folder.parentId;
    }
    return parts.join(' / ');
  }, [folderMap]);

  // Helper to extract current file's fileId
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

  const currentFileId = getFileId();

  // Load files for linking
  useEffect(() => {
    if (window.pluginAPI?.getAllFiles) {
      window.pluginAPI.getAllFiles()
        .then(files => {
          // Filter out the currently active file, but include all other file types
          const filtered = (files || []).filter(f => f._id !== currentFileId);
          setAllFiles(filtered);
        })
        .catch(err => console.error("Failed to fetch files for linking:", err));
    }
  }, [currentFileId]);

  const handleLinkExisting = (selectedFile, linkMode = 'card') => {
    editor.updateBlock(block, {
      type: "addDoc",
      props: {
        fileId: selectedFile._id,
        title: selectedFile.title,
        fileType: selectedFile.fileType || "document",
        embedMode: linkMode
      }
    });
  };

  const handleNavigate = () => {
    if (fileId && window.pluginAPI?.openFileInTab) {
      window.pluginAPI.openFileInTab(fileId, fileType || "document", title);
    }
  };

  const handleUnlink = (e) => {
    e.stopPropagation();
    editor.updateBlock(block, {
      type: "addDoc",
      props: {
        fileId: "",
        title: "",
        fileType: "document"
      }
    });
  };

  const [actualFileType, setActualFileType] = useState(fileType);

  useEffect(() => {
    setActualFileType(fileType);
  }, [fileType]);

  useEffect(() => {
    if (!fileId) return;
    
    // We only need to resolve if it is currently classified as 'document' or undefined/empty
    if (fileType && fileType !== 'document') return;

    let isMounted = true;

    const resolveFileType = async () => {
      try {
        // 1. Fetch file details to check type in files table
        if (window.pluginAPI?.getFileDetailsById) {
          const fileInfo = await window.pluginAPI.getFileDetailsById(fileId);
          if (!isMounted) return;
          
          if (fileInfo && fileInfo.fileType && fileInfo.fileType !== 'document') {
            setActualFileType(fileInfo.fileType);
            editor.updateBlock(block, {
              props: {
                ...block.props,
                fileType: fileInfo.fileType
              }
            });
            return;
          }
        }

        // 2. Fetch documents associated to inspect first block type (fallback for legacy imports)
        if (window.pluginAPI?.getDocumentsByParentFile) {
          const docs = await window.pluginAPI.getDocumentsByParentFile(fileId);
          if (!isMounted) return;

          if (docs && docs.length > 0) {
            const doc = docs[0];
            let blocks = doc.blocks;
            if (typeof blocks === 'string') {
              try { blocks = JSON.parse(blocks); } catch (e) {}
            }

            if (Array.isArray(blocks) && blocks.length > 0) {
              const firstBlock = blocks[0];
              let resolvedType = 'document';
              if (firstBlock.type === 'code-editor') {
                resolvedType = 'code-editor';
              } else if (firstBlock.type === 'promptly') {
                resolvedType = 'promptly';
              } else if (firstBlock.type === 'diagram' || firstBlock.type === 'archflow') {
                resolvedType = 'archflow';
              }

              if (resolvedType !== 'document') {
                setActualFileType(resolvedType);
                editor.updateBlock(block, {
                  props: {
                    ...block.props,
                    fileType: resolvedType
                  }
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed resolving actual fileType for link:", err);
      }
    };

    resolveFileType();

    return () => {
      isMounted = false;
    };
  }, [fileId, fileType, block, editor]);

  // If a file is already linked, render a Notion-style file reference card or preview if it's an embeddable file and was embedded
  const isEmbeddableType = actualFileType === 'code-editor' || actualFileType === 'archflow' || actualFileType === 'diagram' || actualFileType === 'json' || actualFileType === 'data-bridge';
  const resolvedEmbedMode = embedMode || (isEmbeddableType ? 'embed' : 'card');
  if (fileId) {
    if (isEmbeddableType && resolvedEmbedMode === 'embed') {
      return (
        <CodePreviewEmbed
          fileId={fileId}
          title={title}
          fileType={actualFileType}
          handleUnlink={handleUnlink}
          handleNavigate={handleNavigate}
        />
      );
    }

    return (
      <div className="doc-link-card-configured" contentEditable={false} onClick={handleNavigate}>
        <div className="doc-link-card-left">
          <i className={`${getFileIconClass(actualFileType)} doc-link-card-icon`}></i>
          <span className="doc-link-card-title">{title}</span>
        </div>
        <button className="doc-link-card-unlink-btn" onClick={handleUnlink} title="Unlink file">
          <i className="ri-close-line"></i>
        </button>
      </div>
    );
  }


  // Unconfigured state: Render the search and link selector inside the block
  return (
    <div className="add-doc-block-unconfigured" contentEditable={false}>
      <div className="add-doc-block-content">
        <div className="add-doc-block-panel">
          <div className="add-doc-block-search-wrapper">
            <i className="ri-search-line"></i>
            <input
              type="text"
              placeholder="Search files to link..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="add-doc-block-search-input"
              autoFocus
            />
          </div>
          <div className="add-doc-block-list">
            {allFiles.filter(f => (f.title || '').toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
              <div
                key={f._id}
                className="add-doc-block-list-item"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '6px', borderBottom: '1px solid #F3F4F6' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1, marginRight: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={getFileListIconClass(f.fileType)} style={{ color: '#9CA3AF', fontSize: '14px' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {f.title || 'Untitled'}
                    </span>
                  </div>
                  {getFullPath(f.folderId) && (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', marginLeft: '22px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {getFullPath(f.folderId)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button 
                    onClick={() => handleLinkExisting(f, 'card')}
                    style={{ border: '1px solid #D1D5DB', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#374151', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
                  >
                    Link
                  </button>
                  {(f.fileType === 'code-editor' || f.fileType === 'archflow' || f.fileType === 'diagram' || f.fileType === 'json' || f.fileType === 'data-bridge') && (
                    <button 
                      onClick={() => handleLinkExisting(f, 'embed')}
                      style={{ border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#FFFFFF', backgroundColor: '#4F46E5', cursor: 'pointer' }}
                    >
                      Embed
                    </button>
                  )}
                </div>
              </div>
            ))}
            {allFiles.filter(f => (f.title || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="add-doc-block-list-empty">
                No files found in workspace
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. Custom Block Definition
export const AddDocBlock = createReactBlockSpec(
  {
    type: "addDoc",
    propSchema: {
      fileId: { default: "" },
      title: { default: "" },
      fileType: { default: "document" },
      embedMode: { default: "" }
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      return <AddDocBlockComponent block={block} editor={editor} />;
    }
  }
);

// 3. Custom Slash Menu Command for "Add/Link Document"
export const insertAddDocBlock = (editor) => ({
  title: "Link File",
  onItemClick: () => {
    const currentBlock = editor.getTextCursorPosition()?.block;
    const isBlockEmpty =
      !currentBlock ||
      !currentBlock.content ||
      currentBlock.content.length === 0 ||
      (currentBlock.content.length === 1 && currentBlock.content[0].type === "text" && currentBlock.content[0].text === "");

    if (currentBlock && isBlockEmpty && currentBlock.type === "paragraph") {
      editor.replaceBlocks([currentBlock.id], [{ type: "addDoc" }]);
    } else {
      editor.insertBlocks([{ type: "addDoc" }], currentBlock?.id, "after");
    }
  },
  aliases: ["link file", "add/link documnt", "doc link", "link document"],
  group: "External Page",
  icon: <i className="ri-links-line" style={{ fontSize: "16px", color: "#4F46E5" }}></i>
});
