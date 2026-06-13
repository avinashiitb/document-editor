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

  const handleCreateEditor = (view) => {
    editorRef.current = view;
  };

  const handleKeyDown = (e) => {
    const view = editorRef.current;
    if (!view) return;

    const { state } = view;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);

    if (e.key === "ArrowUp") {
      if (line.number === 1 && cursor === line.from) {
        const documentBlocks = editor.document;
        const index = documentBlocks.findIndex(b => b.id === block.id);
        if (index > 0) {
          e.preventDefault();
          const prevBlock = documentBlocks[index - 1];
          editor.setTextCursorPosition(prevBlock.id, "end");
        }
      }
    } else if (e.key === "ArrowDown") {
      const totalLines = state.doc.lines;
      if (line.number === totalLines && cursor === line.to) {
        const documentBlocks = editor.document;
        const index = documentBlocks.findIndex(b => b.id === block.id);
        if (index < documentBlocks.length - 1) {
          e.preventDefault();
          const nextBlock = documentBlocks[index + 1];
          editor.setTextCursorPosition(nextBlock.id, "start");
        }
      }
    }
  };

  const currentLanguage = block.props.language || "javascript";
  const extensions = [javascript({ jsx: true }), EditorView.lineWrapping];

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
        border: theme === 'dark' ? '1px solid #343746' : '1px solid #E5E7EB',
        borderRadius: '4px',
        overflow: 'hidden',
        margin: '12px 0',
        fontFamily: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
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
        // 1. Try to get code from data-code attribute (used by BlockNote/custom serializers)
        let codeText = el.getAttribute?.("data-code");

        // 2. If not present, extract text preserving line breaks
        if (codeText === null || codeText === undefined) {
          // Manual fallback walker to preserve line breaks from <br> and divs in detached fragments
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
        return {
          code: codeText,
          language: lang,
        };
      }
      return undefined;
    },
    toExternalHTML: ({ block }) => {
      const codeText = block.props.code || "";
      const lang = block.props.language || "javascript";
      return (
        <pre data-content-type="codeBlock" data-language={lang} data-code={codeText}>
          <code>{codeText}</code>
        </pre>
      );
    }
  }
);
