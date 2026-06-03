import React, { useState, useRef, useEffect } from 'react';

/**
 * TopBar component for the document editor
 * Encapsulates the path breadcrumbs, auto-save status indicator, and document export actions.
 */
function TopBar({
  fileName,
  breadcrumbs,
  saveStatus,
  editor,
  contentDoc,
  fileId
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Dropdown close listener
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  return (
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

      <div className="topbar-right" style={{ gap: '6px' }}>
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="export-icon-btn"
            title="Export options"
            id="options-menu-trigger"
          >
            <i className="ri-download-2-line" style={{ color: "#4F46E5" }}></i>
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
  );
}

export default TopBar;
