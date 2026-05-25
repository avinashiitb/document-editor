import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { java } from '@codemirror/lang-java';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { EditorView } from '@codemirror/view';

function App() {
  const [code, setCode] = useState('');
  const [fileName, setFileName] = useState('App.tsx');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [language, setLanguage] = useState('javascript');
  const [output, setOutput] = useState('');
  const [wordWrap, setWordWrap] = useState(false);

  // Panel States
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('TERMINAL');
  const [panelHeight, setPanelHeight] = useState(250);
  const isDragging = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Menu State
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

  // DevScribe Documents Architecture
  const [contentDoc, setContentDoc] = useState(null);

  // Scrape FileId aggressively from any electron-router bounds
  const getFileId = () => {
    let id = window.pluginAPI?.context?.fileId;
    if (id) return id;

    // Fallback URL parsing
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

  useEffect(() => {
    const loadInitialData = async () => {
      if (window.pluginAPI && fileId) {
        try {
          console.log('Fetching details for fileId:', fileId);
          const fileInfo = await window.pluginAPI.getFileDetailsById(fileId);
          if (fileInfo && fileInfo.title) {
            setFileName(fileInfo.title);
          }

          // Fetch breadcrumb path
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

          console.log('Loading block documents by parent file...');
          const data = await window.pluginAPI.getDocumentsByParentFile(fileId);
          console.log('Loaded API data:', data);

          if (data && data.length > 0) {
            const document = data[0];
            setContentDoc(document);

            let savedData = document?.blocks?.[0]?.data;
            console.log('Detected block data layer:', savedData);

            // Safely parse if the database returns stringified JSON
            if (typeof savedData === 'string') {
              try {
                savedData = JSON.parse(savedData);
              } catch (e) {
                console.warn('Failed parsing raw block string', e);
              }
            }

            if (savedData && typeof savedData === 'object') {
              if (savedData.code !== undefined && savedData.code !== null) setCode(savedData.code);
              if (savedData.language !== undefined && savedData.language !== null) setLanguage(savedData.language);
              if (savedData.wordWrap !== undefined && savedData.wordWrap !== null) setWordWrap(savedData.wordWrap);

              const hasOutput = savedData.output !== undefined && savedData.output !== null && savedData.output !== '';
              if (hasOutput) {
                setOutput(savedData.output);
                setActiveTab('OUTPUT');
              }

              if (savedData.panelOpen !== undefined && savedData.panelOpen !== null) {
                setPanelOpen(savedData.panelOpen);
              } else if (hasOutput) {
                // Backward compatibility: automatically open if there's output but no saved panel state
                setPanelOpen(true);
              }
            }
          } else {
            console.log('No documents array found. Falling back to default state.');
          }
        } catch (err) {
          console.warn('Failed to load initial data:', err);
        } finally {
          setIsReady(true);
        }
      } else {
        // If not in DevScribe env, just set ready
        setIsReady(true);
      }
    };

    // Give it a small delay just in case IPC isn't fully ready immediately
    setTimeout(loadInitialData, 100);
  }, [fileId]);

  const handleSave = useCallback(async (showNotification = true) => {
    if (window.pluginAPI && window.pluginAPI.updateDocument && fileId) {
      console.log('Attempting to save block document...');

      const payloadData = { code, language, output, panelOpen, wordWrap };
      console.log('Payload structure mapping to block data:', payloadData);

      const updatedContents = {
        version: "1.0.0",
        time: Date.now(),
        blocks: [{ type: "code-editor", data: payloadData }],
        parent_file: fileId,
        _id: contentDoc?._id,
      };

      try {
        await window.pluginAPI.updateDocument(fileId, [updatedContents]);
        console.log('Save operation completed successfully via updateDocument');
        if (showNotification && window.pluginAPI.notify) {
          window.pluginAPI.notify('Code saved successfully', 'success');
        }
      } catch (err) {
        console.error('Save error thrown by updateDocument:', err);
        if (showNotification && window.pluginAPI.notify) {
          window.pluginAPI.notify('Failed to save code', 'error');
        }
      }
    } else {
      console.warn('Cannot save: pluginAPI, updateDocument, or fileId is not defined.');
    }
  }, [code, language, output, panelOpen, wordWrap, fileId, contentDoc]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Only auto-save if we have successfully loaded data first
    if (!isReady) return;

    // Auto-save with a 1-second debounce
    const timeoutId = setTimeout(() => {
      handleSave(false);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [code, language, output, panelOpen, handleSave, isReady]);

  const editorExtensions = useMemo(() => {
    const extensions = [];
    switch (language) {
      case 'javascript': extensions.push(javascript({ jsx: true })); break;
      case 'typescript': extensions.push(javascript({ jsx: true, typescript: true })); break;
      case 'java': extensions.push(java()); break;
      case 'sqlite': extensions.push(sql()); break;
      case 'docker': extensions.push(yaml()); break;
      case 'shell': extensions.push(StreamLanguage.define(shell)); break;
      default: extensions.push(javascript({ jsx: true })); break;
    }
    if (wordWrap) {
      extensions.push(EditorView.lineWrapping);
    }
    return extensions;
  }, [language, wordWrap]);

  const getLangDotColor = () => {
    switch (language) {
      case 'javascript': return 'yellow';
      case 'typescript': return 'blue';
      case 'docker': return 'blue';
      case 'sqlite': return 'gray';
      case 'java': return 'red';
      default: return 'green';
    }
  };

  const handleRun = async (action = 'run') => {
    if (!window.pluginAPI) {
      setOutput('Error: window.pluginAPI is not available in this environment.');
      setActiveTab('OUTPUT');
      setPanelOpen(true);
      return;
    }

    setOutput('Executing...');
    setActiveTab('OUTPUT');
    setPanelOpen(true);
    setIsExecuting(true);

    try {
      let result;
      if (language === 'javascript') {
        result = await window.pluginAPI.runJsCode(code);
      } else if (language === 'typescript') {
        result = await window.pluginAPI.runTsCode(code);
      } else if (language === 'shell') {
        result = await window.pluginAPI.runShellCommand(code);
      } else if (language === 'java') {
        result = await window.pluginAPI.runJavaCode(code);
      } else if (language === 'sqlite') {
        result = await window.pluginAPI.runSqliteCommand(code);
      } else if (language === 'docker') {
        result = await window.pluginAPI.runDockerCompose(code, action === 'stop' ? 'down' : 'up -d', fileName, fileId);
      }

      if (typeof result === 'object' && result !== null) {
        setOutput(JSON.stringify(result, null, 2));
      } else {
        setOutput(String(result) || 'Executed successfully (no output).');
      }
    } catch (err) {
      setOutput(`Error: ${err.message || String(err)}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const newHeight = window.innerHeight - e.clientY;
    if (newHeight >= 60 && newHeight <= window.innerHeight - 100) {
      setPanelHeight(newHeight);
      if (!panelOpen) setPanelOpen(true);
    }
  }, [panelOpen]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.body.style.cursor = 'default';
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div className="App light-theme">
      <header className="readdy-light-topbar">
        <div className="topbar-left">
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              fontSize: 12,
              color: '#9ca3af',
              overflow: 'visible',
              flexWrap: 'nowrap',
            }}
            aria-label="file path"
          >
            <i className="fa-solid fa-folder" style={{ marginRight: 6, fontSize: 11, opacity: 0.7, color: '#9ca3af' }}></i>
            {(breadcrumbs.length > 0
              ? breadcrumbs
              : [{ label: fileName, isFile: true }]
            ).map((seg, idx) => (
              <React.Fragment key={idx}>
                {!seg.isFile && (
                  <>
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#9ca3af',
                        cursor: 'default',
                      }}
                      title={seg.label}
                    >
                      {seg.label}
                    </span>
                    <span style={{ color: '#9ca3af', opacity: 0.5, margin: '0 4px', fontSize: 13, userSelect: 'none' }}>›</span>
                  </>
                )}
                {seg.isFile && (
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#111827',
                      cursor: 'default',
                    }}
                    title={seg.label}
                  >
                    {seg.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="topbar-center">
          <div className="language-pill">
            <span className={`lang-dot ${getLangDotColor()}`}></span>
            <select className="pill-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="shell">Shell</option>
              <option value="java">Java</option>
              <option value="sqlite">SQLite</option>
              <option value="docker">Docker Compose</option>
            </select>
            <i className="ri-arrow-down-s-line chevron"></i>
          </div>
        </div>

        <div className="topbar-right">
          {/* <button className="icon-btn-light" onClick={handleSave} title="Save (Cmd/Ctrl + S)"><i className="ri-save-3-line"></i></button>
          <button className="icon-btn-light" title="Dark Mode (Mock)"><i className="ri-moon-line"></i></button> */}
          <button
            className={`icon-btn-light ${wordWrap ? 'active' : ''}`}
            onClick={() => setWordWrap(!wordWrap)}
            title="Toggle Word Wrap"
          >
            <i className="ri-text-wrap"></i>
          </button>

          <button
            className={`icon-btn-light ${panelOpen ? 'active' : ''}`}
            onClick={() => { setActiveTab('OUTPUT'); setPanelOpen(!panelOpen); }}
            title="Toggle Terminal"
          >
            <i className="ri-layout-bottom-2-line"></i>
          </button>

          {language === 'docker' ? (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button disabled={isExecuting} onClick={() => handleRun('run')} className="run-btn-light">
                {isExecuting ? <i className="ri-loader-4-line ri-spin" style={{ marginRight: '4px' }}></i> : <i className="ri-play-fill run-play-icon"></i>}
                Up
              </button>
              <button disabled={isExecuting} onClick={() => handleRun('stop')} className="run-btn-light" style={{ backgroundColor: '#EF4444' }}>
                {isExecuting ? <i className="ri-loader-4-line ri-spin" style={{ marginRight: '4px' }}></i> : <i className="ri-stop-fill run-play-icon"></i>}
                Down
              </button>
            </div>
          ) : (
            <button disabled={isExecuting} onClick={() => handleRun('run')} className="run-btn-light">
              {isExecuting ? <i className="ri-loader-4-line ri-spin" style={{ marginRight: '4px' }}></i> : <i className="ri-play-fill run-play-icon"></i>}
              Run Code
            </button>
          )}

          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 12px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#374151",
                cursor: "pointer",
                fontWeight: 500,
                marginLeft: "4px"
              }}
            >
              <i className="ri-lock-line" style={{ marginRight: "6px", color: "#6b7280" }}></i>
              Options
              <i className="ri-arrow-down-s-line" style={{ marginLeft: "4px", color: "#6b7280" }}></i>
            </button>

            {isMenuOpen && (
              <div style={{
                position: "absolute",
                right: 0,
                marginTop: "6px",
                width: "192px",
                backgroundColor: "white",
                borderRadius: "8px",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                border: "1px solid #E5E7EB",
                zIndex: 50
              }}>
                <div style={{ padding: "4px 0" }}>
                  <div style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 600, color: "#6B7280", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                    Export Options
                  </div>
                  <button
                    className="menu-item-light hover-bg-gray"
                    onClick={() => {
                      try {
                        const payload = JSON.stringify({
                          _id: contentDoc?._id || `code-editor-${Date.now()}`,
                          version: contentDoc?.version || 1,
                          time: Date.now(),
                          parent_file: fileId || "standalone-export",
                          blocks: [
                            {
                              type: "code-editor",
                              data: { code, language, output, panelOpen }
                            }
                          ],
                          createdAt: contentDoc?.createdAt || Date.now(),
                          updatedAt: Date.now(),
                          fileType: "code-editor"
                        }, null, 2);

                        const blob = new Blob([payload], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        const safeName = fileName ? fileName.split('.')[0] : 'export';
                        a.download = `${safeName}.ds`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        if (window.pluginAPI && window.pluginAPI.notify) {
                          window.pluginAPI.notify("Exported successfully", "success");
                        }
                      } catch (err) {
                        console.error("Export failed:", err);
                        if (window.pluginAPI && window.pluginAPI.notify) {
                          window.pluginAPI.notify("Export failed", "error");
                        }
                      }
                      setIsMenuOpen(false);
                    }}
                    style={{ width: "100%", display: "flex", alignItems: "center", padding: "8px 16px", backgroundColor: "transparent", border: "none", fontSize: "13px", color: "#374151", cursor: "pointer", textAlign: "left" }}
                  >
                    <i className="ri-file-code-fill" style={{ marginRight: "10px", color: "#2563EB" }}></i>
                    Devscribe (.ds)
                  </button>

                  <div style={{ borderTop: "1px solid #E5E7EB", margin: "4px 10px" }}></div>

                  <div style={{ padding: "8px 16px", fontSize: "11px", fontWeight: 600, color: "#6B7280", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                    Preferences
                  </div>
                  <button
                    className="menu-item-light hover-bg-gray"
                    onClick={() => {
                      if (window.pluginAPI && window.pluginAPI.notify) {
                        window.pluginAPI.notify("Settings opened", "info");
                      }
                      setIsMenuOpen(false);
                    }}
                    style={{ width: "100%", display: "flex", alignItems: "center", padding: "8px 16px", backgroundColor: "transparent", border: "none", fontSize: "13px", color: "#374151", cursor: "pointer", textAlign: "left" }}
                  >
                    <i className="ri-settings-4-line" style={{ marginRight: "10px", color: "#4B5563" }}></i>
                    Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace">
        <div className="editor-container">
          <CodeMirror
            value={code}
            height="100%"
            extensions={editorExtensions}
            onChange={(value) => setCode(value)}
            theme="light"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
            }}
            style={{ flex: 1, textAlign: 'left', height: '100%' }}
          />
        </div>

        <div className={`light-bottom-panel ${panelOpen ? 'open' : 'closed'}`} style={panelOpen ? { height: `${panelHeight}px` } : {}}>
          {panelOpen && (
            <>
              <div className="panel-resizer" onMouseDown={handleMouseDown}></div>
              <div className="light-panel-header">
                <div className="panel-title">
                  <i className="ri-terminal-box-line"></i>
                  <span>TERMINAL</span>
                  <span className="terminal-subtitle">bash</span>
                </div>
                <div className="panel-actions">
                  <button className="icon-btn-light" onClick={() => setOutput('')} title="Clear Output">
                    <i className="ri-delete-bin-line" style={{ fontSize: '14px' }}></i>
                  </button>
                  <button className="icon-btn-light" onClick={() => setPanelOpen(false)} title="Close Panel">
                    <i className="ri-arrow-down-s-line"></i>
                  </button>
                </div>
              </div>

              <div className="light-panel-content">
                {activeTab === 'OUTPUT' && <pre>{output}</pre>}
                {activeTab === 'TERMINAL' && (
                  <div className="terminal-placeholder">
                    <span style={{ color: '#3B82F6', fontWeight: 600 }}>&gt; Ready to execute...</span>
                    <br />
                    <span><span style={{ color: '#3B82F6' }}>~</span> <span style={{ color: '#6B7280' }}>$</span> </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
