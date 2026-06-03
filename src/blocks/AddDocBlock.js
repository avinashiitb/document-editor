import React, { useState, useEffect } from 'react';
import { createReactBlockSpec } from "@blocknote/react";

// Helper to determine icon class based on file type for the configured card
const getFileIconClass = (type) => {
  switch (type) {
    case 'diagram':
    case 'canvas':
      return 'ri-bubble-chart-fill';
    case 'terminal':
    case 'promptly':
      return 'ri-terminal-box-fill';
    default:
      return 'ri-file-text-fill';
  }
};

// Helper to determine icon class based on file type for the selection list
const getFileListIconClass = (type) => {
  switch (type) {
    case 'diagram':
    case 'canvas':
      return 'ri-bubble-chart-line';
    case 'terminal':
    case 'promptly':
      return 'ri-terminal-box-line';
    default:
      return 'ri-file-text-line';
  }
};

// 1. React Component for custom "Add/Link Document" block
function AddDocBlockComponent({ block, editor }) {
  const { fileId, title, fileType } = block.props;
  const [searchQuery, setSearchQuery] = useState("");
  const [allFiles, setAllFiles] = useState([]);

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

  const handleLinkExisting = (selectedFile) => {
    editor.updateBlock(block, {
      type: "addDoc",
      props: {
        fileId: selectedFile._id,
        title: selectedFile.title,
        fileType: selectedFile.fileType || "document"
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

  // If a file is already linked, render a Notion-style file reference card
  if (fileId) {
    return (
      <div className="doc-link-card-configured" contentEditable={false} onClick={handleNavigate}>
        <div className="doc-link-card-left">
          <i className={`${getFileIconClass(fileType)} doc-link-card-icon`}></i>
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
              <button
                key={f._id}
                className="add-doc-block-list-item"
                onClick={() => handleLinkExisting(f)}
              >
                <i className={getFileListIconClass(f.fileType)}></i>
                <span>{f.title || 'Untitled'}</span>
              </button>
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
      fileType: { default: "document" }
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
