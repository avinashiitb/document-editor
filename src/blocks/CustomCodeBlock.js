import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createReactBlockSpec } from "@blocknote/react";
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { loadLanguage } from '@uiw/codemirror-extensions-langs';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { githubLight } from '@uiw/codemirror-theme-github';

// Custom hook to detect dark/light theme changes from .App container
function useThemeDetector() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const appEl = document.querySelector('.App');
    if (!appEl) return;

    const updateTheme = () => {
      if (appEl.classList.contains('dark-theme')) {
        setTheme('dark');
      } else {
        setTheme('light');
      }
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(appEl, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return theme;
}

function CustomCodeBlockComponent({ block, editor }) {
  const theme = useThemeDetector();
  const editorRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const isWordWrap = block.props?.wordWrap !== "false";

  const handleCodeChange = useCallback((newValue) => {
    if (newValue !== block.props.code) {
      editor.updateBlock(block.id, {
        props: {
          ...block.props,
          code: newValue
        }
      });
    }
  }, [block, editor]);

  const toggleWordWrap = () => {
    editor.updateBlock(block.id, {
      props: {
        ...block.props,
        wordWrap: isWordWrap ? "false" : "true"
      }
    });
  };

  const handleCopyCode = () => {
    const codeText = block.props?.code || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codeText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  const handleCreateEditor = (view) => {
    editorRef.current = view;
    if (block.props.code === "") {
      const cursor = editor.getTextCursorPosition();
      if (cursor && cursor.block.id === block.id) {
        setTimeout(() => {
          view.focus();
        }, 50);
      }
    }
  };

  const handleKeyDown = (e) => {
    const view = editorRef.current;
    if (!view) return;

    const { state } = view;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;

    if (isCmdOrCtrl && e.key === "Enter") {
      e.preventDefault();
      const newBlocks = editor.insertBlocks(
        [{ type: "paragraph", content: [] }],
        block.id,
        "after"
      );
      if (newBlocks && newBlocks.length > 0) {
        editor.setTextCursorPosition(newBlocks[0].id, "start");
      }
      return;
    }

    if (e.key === "ArrowUp") {
      if (line.number === 1 && cursor === line.from) {
        let prevBlock = null;
        try {
          prevBlock = editor.getPrevBlock(block.id);
        } catch (_) {}

        if (!prevBlock) {
          const documentBlocks = editor.document;
          const index = documentBlocks.findIndex(b => b.id === block.id);
          if (index > 0) prevBlock = documentBlocks[index - 1];
        }

        if (prevBlock) {
          e.preventDefault();
          editor.setTextCursorPosition(prevBlock.id, "end");
        }
      }
    } else if (e.key === "ArrowDown") {
      const totalLines = state.doc.lines;
      if (line.number === totalLines && cursor === line.to) {
        let nextBlock = null;
        try {
          nextBlock = editor.getNextBlock(block.id);
        } catch (_) {}

        if (!nextBlock) {
          const documentBlocks = editor.document;
          const index = documentBlocks.findIndex(b => b.id === block.id);
          if (index !== -1 && index < documentBlocks.length - 1) nextBlock = documentBlocks[index + 1];
        }

        if (nextBlock) {
          e.preventDefault();
          editor.setTextCursorPosition(nextBlock.id, "start");
        } else {
          e.preventDefault();
          const newBlocks = editor.insertBlocks(
            [{ type: "paragraph", content: [] }],
            block.id,
            "after"
          );
          if (newBlocks && newBlocks.length > 0) {
            editor.setTextCursorPosition(newBlocks[0].id, "start");
          }
        }
      }
    }
  };

  const currentLanguage = block.props.language || "javascript";
  const extensions = [javascript({ jsx: true })];

  if (isWordWrap) {
    extensions.push(EditorView.lineWrapping);
  }

  if (currentLanguage !== "javascript" && currentLanguage !== "js") {
    try {
      const langExt = loadLanguage(currentLanguage);
      if (langExt) {
        extensions.push(langExt);
      }
    } catch (e) {
      console.warn("Failed to load CodeMirror language extension for:", currentLanguage, e);
    }
  }

  const activeTheme = theme === 'dark' ? dracula : githubLight;

  return (
    <div
      className="custom-code-block-wrapper-cm"
      style={{
        position: 'relative',
        border: theme === 'dark' ? '1px solid #343746' : '1px solid #E5E7EB',
        borderRadius: '6px',
        overflow: 'hidden',
        margin: '12px 0',
        fontFamily: 'inherit',
        width: 'fit-content',
        minWidth: '40%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        backgroundColor: theme === 'dark' ? '#282a36' : '#ffffff',
      }}
    >
      {/* Code Block Header */}
      <div
        className="code-block-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: theme === 'dark' ? '#21222c' : '#F3F4F6',
          borderBottom: theme === 'dark' ? '1px solid #343746' : '1px solid #E5E7EB',
          userSelect: 'none',
        }}
      >
        {/* Left Side: Code Icon & Label (NO language selector option) */}
        <div
          className="code-block-header-left"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: theme === 'dark' ? '#BD93F9' : '#4B5563',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.02em',
          }}
        >
          <i className="ri-code-s-slash-line" style={{ fontSize: '14px' }}></i>
          <span>Code</span>
        </div>

        {/* Right Side: Header Action Buttons */}
        <div
          className="code-block-header-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Text Wrap Option */}
          <button
            onClick={toggleWordWrap}
            title={isWordWrap ? "Disable Text Wrap" : "Enable Text Wrap"}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: theme === 'dark' ? '1px solid #44475a' : '1px solid #D1D5DB',
              background: isWordWrap
                ? (theme === 'dark' ? '#383a59' : '#EFF6FF')
                : (theme === 'dark' ? '#21222c' : '#FFFFFF'),
              color: isWordWrap
                ? (theme === 'dark' ? '#8BE9FD' : '#2563EB')
                : (theme === 'dark' ? '#F8F8F2' : '#374151'),
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500',
              transition: 'all 0.15s ease',
            }}
          >
            <i className="ri-text-wrap" style={{ fontSize: '13px' }}></i>
            <span>{isWordWrap ? "Wrap" : "Unwrap"}</span>
          </button>

          {/* Copy Code Button */}
          <button
            onClick={handleCopyCode}
            title="Copy Code"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: theme === 'dark' ? '1px solid #44475a' : '1px solid #D1D5DB',
              background: theme === 'dark' ? '#21222c' : '#FFFFFF',
              color: copied ? '#10B981' : (theme === 'dark' ? '#F8F8F2' : '#374151'),
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500',
              transition: 'all 0.15s ease',
            }}
          >
            <i className={copied ? "ri-check-line" : "ri-file-copy-line"} style={{ fontSize: '13px' }}></i>
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* CodeMirror instance */}
      <div onKeyDown={handleKeyDown}>
        <CodeMirror
          value={block.props.code || ""}
          extensions={extensions}
          theme={activeTheme}
          onChange={handleCodeChange}
          onCreateEditor={handleCreateEditor}
          style={{ fontSize: '14px' }}
        />
      </div>
    </div>
  );
}

export const CustomCodeBlock = createReactBlockSpec(
  {
    type: "codeBlock",
    propSchema: {
      language: { default: "javascript" },
      code: { default: "" },
      wordWrap: { default: "true" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      return <CustomCodeBlockComponent block={block} editor={editor} />;
    },
    parse: (el) => {
      if (
        el.nodeName === "PRE" ||
        el.getAttribute?.("data-content-type") === "codeBlock" ||
        (el.classList && el.classList.contains("bn-code-block"))
      ) {
        let codeText = el.getAttribute?.("data-code");

        if (codeText === null || codeText === undefined) {
          let text = "";
          const walk = (node) => {
            if (node.nodeType === 3) {
              text += node.nodeValue;
            } else if (node.nodeName === "BR") {
              text += "\n";
            } else if (
              node.nodeName === "DIV" ||
              node.nodeName === "P" ||
              node.nodeName === "TR" ||
              node.nodeName === "LI" ||
              (node.nodeName.length === 2 && node.nodeName[0] === "H" && node.nodeName[1] >= "1" && node.nodeName[1] <= "6")
            ) {
              if (text && !text.endsWith("\n")) {
                text += "\n";
              }
              for (let child = node.firstChild; child; child = child.nextSibling) {
                walk(child);
              }
              if (!text.endsWith("\n")) {
                text += "\n";
              }
            } else {
              for (let child = node.firstChild; child; child = child.nextSibling) {
                walk(child);
              }
            }
          };
          walk(el);
          codeText = text;
        }

        const lang = el.getAttribute?.("data-language") || el.getAttribute?.("language") || "javascript";
        const wordWrap = el.getAttribute?.("data-word-wrap") || "true";

        return {
          code: codeText,
          language: lang,
          wordWrap,
        };
      }
      return undefined;
    },
    toExternalHTML: ({ block }) => {
      const codeText = block.props.code || "";
      const lang = block.props.language || "javascript";
      const wordWrap = block.props.wordWrap || "true";
      return (
        <pre data-content-type="codeBlock" data-language={lang} data-word-wrap={wordWrap} data-code={codeText}>
          <code>{codeText}</code>
        </pre>
      );
    }
  }
);
