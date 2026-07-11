import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createReactBlockSpec } from "@blocknote/react";

// Helper to determine icon class based on file type for the configured card
const getFileIconClass = (type) => {
  switch (type) {
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
    case 'protocol-x':
      return 'ri-global-fill';
    case 'sequence-diagram':
      return 'ri-git-commit-fill';
    case 'sheet':
      return 'ri-table-fill';
    default:
      return 'ri-file-text-fill';
  }
};

// Helper to determine icon class based on file type for the selection list
const getFileListIconClass = (type) => {
  switch (type) {
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
    case 'protocol-x':
      return 'ri-global-line';
    case 'sequence-diagram':
      return 'ri-git-commit-line';
    case 'sheet':
      return 'ri-table-line';
    default:
      return 'ri-file-text-line';
  }
};

// React Component for code preview embedding via iframe
function CodePreviewEmbed({ fileId, title, fileType, handleUnlink, handleNavigate, pluginMap = {}, theme }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const isArchFlow = fileType === 'archflow';
  const isJson = fileType === 'json';
  const isDataBridge = fileType === 'data-bridge';
  const isProtocolX = fileType === 'protocol-x';
  const isPromptly = fileType === 'promptly';
  const isSequenceDiagram = fileType === 'sequence-diagram';
  const isSheet = fileType === 'sheet';
  const rawDefaultHeight = isArchFlow ? 450 : (isJson ? 200 : (isDataBridge ? 450 : (isProtocolX ? 400 : (isPromptly ? 350 : (isSequenceDiagram ? 450 : (isSheet ? 800 : 150))))));
  const defaultHeight = Math.max(200, rawDefaultHeight);
  const [iframeHeight, setIframeHeight] = useState(defaultHeight);

  const loadPreviewData = useCallback(async () => {
    if (!window.pluginAPI?.getDocumentsByParentFile) return;
    try {
      const data = await window.pluginAPI.getDocumentsByParentFile(fileId);
      if (data && data.length > 0) {
        const document = data[0];
        let blocks = document?.blocks;
        if (typeof blocks === 'string') {
          try { blocks = JSON.parse(blocks); } catch (e) {}
        }
        const blockObj = isArchFlow
          ? (blocks?.find(b => b.type === "archflow") || blocks?.[0])
          : (isJson
              ? (blocks?.find(b => b.type === "json-analyzer") || blocks?.[0])
              : (isDataBridge
                  ? (blocks?.find(b => b.type === "data-bridge") || blocks?.[0])
                  : (isPromptly
                      ? (blocks?.find(b => b.type === "promptly") || blocks?.[0])
                      : (isSheet
                          ? (blocks?.find(b => b.type === "devscribe-sheet") || blocks?.[0])
                          : blocks?.[0]))));
        
        let savedData = isProtocolX ? blockObj : blockObj?.data;
        if (typeof savedData === 'string') {
          try {
            savedData = JSON.parse(savedData);
          } catch (err) {
            console.warn('Failed parsing raw block string in preview', err);
          }
        }

        let envVariables = [];
        if (isProtocolX) {
          const envId = blockObj?.selectedEnv || "1";
          try {
            if (window.pluginAPI.fetchEnvByScopeId) {
              envVariables = await window.pluginAPI.fetchEnvByScopeId(envId);
            } else if (window.pluginAPI.messaging?.invoke) {
              envVariables = await window.pluginAPI.messaging.invoke('fetch-env-by-scope-id', { scope_id: envId });
            }
          } catch (err) {
            console.warn('Failed fetching env variables for protocol-x preview:', err);
          }
        }

        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'LOAD_PREVIEW',
            data: savedData || (isArchFlow ? { nodes: [], edges: [] } : (isJson ? {} : (isDataBridge ? {} : (isSheet ? { sheets: {} } : { code: '', language: 'javascript' })))),
            envVariables: envVariables
          }, '*');
        }
      }
    } catch (err) {
      console.error(`Failed to fetch preview data for ${isArchFlow ? 'archflow' : (isJson ? 'json' : (isDataBridge ? 'data-bridge' : (isSheet ? 'sheet' : 'code-editor')))}:`, err);
    }
  }, [fileId, isArchFlow, isJson, isDataBridge, isProtocolX, isPromptly, isSheet]);

  useEffect(() => {
    const handleMessage = async (e) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;

      console.log(`🔌 AddDocBlock: Received iframe message type "${e.data?.type}" for fileId "${fileId}":`, e.data);

      if (e.data?.type === 'PREVIEW_READY') {
        console.log(`🔌 AddDocBlock: PREVIEW_READY received, loading preview data for fileId "${fileId}"...`);
        setPreviewReady(true);
        await loadPreviewData();
        setLoading(false);
        console.log(`🔌 AddDocBlock: Preview loaded, setting loading state to false.`);
      } else if (e.data?.type === 'RESIZE_PREVIEW') {
        if (e.data.height && !isSheet) {
          const clamped = Math.max(200, e.data.height);
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
  }, [fileId, isArchFlow, isJson, isDataBridge, isProtocolX, isPromptly, isSheet, loadPreviewData]);

  // Dynamic automatic reload when window (webview) receives focus
  useEffect(() => {
    if (!previewReady) return;
    const handleFocus = () => {
      loadPreviewData();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [previewReady, loadPreviewData]);

  // Periodic polling check every 4 seconds only if document editor is currently active/visible to the user
  useEffect(() => {
    if (!previewReady) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadPreviewData();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [previewReady, loadPreviewData]);

  const pluginInfo = pluginMap[fileType];
  const isCore = !pluginInfo || !!(pluginInfo['core-plugin'] === true || pluginInfo['core-plugin'] === 'true' || pluginInfo.isCore);
  const pluginId = pluginInfo ? pluginInfo.id : fileType;
  const scheme = isCore ? 'devscribe-core-plugin' : 'devscribe-plugin';

  return (
    <div className="doc-link-embed-container" contentEditable={false} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', margin: '8px 0', backgroundColor: 'var(--card)', width: '100%', boxSizing: 'border-box' }}>
      <div className="doc-link-embed-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--inner)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className={isArchFlow ? "ri-bubble-chart-fill" : (fileType === 'json' ? "ri-braces-fill" : (fileType === 'data-bridge' ? "ri-database-2-fill" : (fileType === 'protocol-x' ? "ri-global-fill" : (fileType === 'promptly' ? "ri-terminal-box-fill" : (fileType === 'sequence-diagram' ? "ri-git-commit-fill" : (fileType === 'sheet' ? "ri-table-fill" : "ri-file-code-fill"))))))} style={{ color: isArchFlow ? '#8B5CF6' : (fileType === 'json' ? '#D97706' : (fileType === 'data-bridge' ? '#10B981' : (fileType === 'protocol-x' ? '#EF4444' : (fileType === 'promptly' ? '#0969DA' : (fileType === 'sequence-diagram' ? '#6366F1' : (fileType === 'sheet' ? '#107C41' : '#2563EB')))))), fontSize: '16px' }}></i>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{title}</span>
          <span style={{ fontSize: '11px', color: 'var(--dim)', backgroundColor: 'var(--border-strong)', padding: '2px 6px', borderRadius: '4px' }}>Preview</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button 
            onClick={async (e) => { 
              e.stopPropagation(); 
              setRefreshing(true); 
              await loadPreviewData(); 
              setRefreshing(false); 
            }}
            disabled={loading || refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-strong)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: 'var(--text)', backgroundColor: 'var(--card)', cursor: previewReady ? 'pointer' : 'default', opacity: previewReady ? 1 : 0.6 }}
            title="Refresh preview content"
          >
            <i className={`ri-refresh-line ${(loading || refreshing) ? 'ri-spin' : ''}`}></i>
            Refresh
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleNavigate(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-strong)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: 'var(--text)', backgroundColor: 'var(--card)', cursor: 'pointer' }}
            title="Open full page"
          >
            <i className="ri-external-link-line"></i>
            Edit
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); handleUnlink(e); }}
            style={{ border: 'none', background: 'none', padding: '4px', cursor: 'pointer', color: 'var(--faint)' }}
            title="Unlink file"
          >
            <i className="ri-close-line" style={{ fontSize: '16px' }}></i>
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', height: `${iframeHeight}px`, maxHeight: '800px', minHeight: '200px', width: '100%', transition: 'height 0.2s ease' }}>
        <iframe
          key={`${fileId}-${theme}`}
          ref={iframeRef}
          title={isArchFlow ? "Diagram Editor Preview" : (isJson ? "JSON Analyzer Preview" : (isDataBridge ? "Data Bridge Preview" : (fileType === 'protocol-x' ? "API Preview" : (fileType === 'promptly' ? "Runbook Preview" : (fileType === 'sequence-diagram' ? "Sequence Diagram Preview" : (fileType === 'sheet' ? "Spreadsheet Preview" : "Code Editor Preview"))))))}
          src={`${scheme}://${pluginId}/#/?fileId=${fileId}&preview=true&theme=${theme}`}
          style={{ width: '100%', height: '100%', border: 'none', overflow: 'hidden' }}
          scrolling="no"
        />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--card)', color: 'var(--dim)', fontSize: '13px', gap: '8px' }}>
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
  const [pluginMap, setPluginMap] = useState({});
  const [embeddableTypes, setEmbeddableTypes] = useState([]);

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

  const [theme, setTheme] = useState(() => {
    const urlTheme = getThemeFromUrl();
    if (urlTheme === "dark" || urlTheme === "light") return urlTheme;
    return localStorage.getItem('document-editor-theme') || 'light';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const urlTheme = getThemeFromUrl();
      if (urlTheme === "dark" || urlTheme === "light") {
        setTheme(urlTheme);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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

  // Load dynamic embeddable types and metadata from registered plugins
  useEffect(() => {
    const loadEmbeddableTypes = async () => {
      try {
        const pMap = {};
        if (window.pluginAPI?.getPlugins) {
          const plugins = await window.pluginAPI.getPlugins();
          (plugins || []).forEach(p => {
            if (p.preview === true || p.preview === "true") {
              pMap[p.fileType] = { ...p, isCore: false };
            }
          });
        }
        if (window.pluginAPI?.getCorePlugins) {
          const corePlugins = await window.pluginAPI.getCorePlugins();
          (corePlugins || []).forEach(p => {
            if (p.preview === true || p.preview === "true") {
              pMap[p.fileType] = { ...p, isCore: true };
            }
          });
        }

        setPluginMap(pMap);

        const types = Object.keys(pMap);
        if (types.length > 0) {
          setEmbeddableTypes(types);
        }
      } catch (err) {
        console.warn("Failed resolving preview support dynamically:", err);
      }
    };

    loadEmbeddableTypes();
  }, []);

  const DEFAULT_EMBEDDABLE_TYPES = ['code-editor', 'archflow', 'json', 'data-bridge', 'protocol-x', 'promptly', 'sequence-diagram', 'sheet'];

  const isEmbeddable = (type) => {
    if (embeddableTypes.length > 0) {
      return embeddableTypes.includes(type);
    }
    return DEFAULT_EMBEDDABLE_TYPES.includes(type);
  };

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
              } else if (firstBlock.type === 'archflow') {
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
  const isEmbeddableType = isEmbeddable(actualFileType);
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
          pluginMap={pluginMap}
          theme={theme}
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
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '6px', borderBottom: '1px solid var(--border)' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1, marginRight: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={getFileListIconClass(f.fileType)} style={{ color: 'var(--faint)', fontSize: '14px' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {f.title || 'Untitled'}
                    </span>
                  </div>
                  {getFullPath(f.folderId) && (
                    <span style={{ fontSize: '11px', color: 'var(--dim)', marginLeft: '22px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {getFullPath(f.folderId)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button 
                    onClick={() => handleLinkExisting(f, 'card')}
                    style={{ border: '1px solid var(--border-strong)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', backgroundColor: 'var(--card)', cursor: 'pointer' }}
                  >
                    Link
                  </button>
                  {isEmbeddable(f.fileType) && (
                    <button 
                      onClick={() => handleLinkExisting(f, 'embed')}
                      style={{ border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#FFFFFF', backgroundColor: 'var(--accent)', cursor: 'pointer' }}
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
