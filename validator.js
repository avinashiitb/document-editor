const { v4: uuidv4 } = require("uuid");

/**
 * Regex for standard UUID v4 format validation
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Helper to normalize block content into an array of inline text/link objects
 */
function formatBlockContent(content) {
  if (typeof content === "string") {
    return [{ type: "text", text: content, styles: {} }];
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return { type: "text", text: item, styles: {} };
      }
      if (item && typeof item === "object") {
        if (item.type === "link") {
          return {
            type: "link",
            href: item.href || "",
            content: formatBlockContent(item.content || item.text || ""),
          };
        }
        return {
          type: item.type || "text",
          text: String(item.text || ""),
          styles: item.styles && typeof item.styles === "object" ? item.styles : {},
        };
      }
      return { type: "text", text: String(item || ""), styles: {} };
    });
  }
  return [];
}

/**
 * Generates a unique valid UUID v4 for a block
 */
function getUniqueBlockId(id, seenIds) {
  let blockId = id && UUID_REGEX.test(String(id)) ? String(id) : uuidv4();
  if (seenIds && seenIds.has(blockId)) {
    blockId = uuidv4();
  }
  if (seenIds) seenIds.add(blockId);
  return blockId;
}

// ==========================================
// Individual Block Transformers
// ==========================================

function createHeadingBlock({ text = "", level = 1, props = {}, children = [], id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "heading",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      level: [1, 2, 3].includes(Number(level)) ? Number(level) : 1,
      isToggleable: false,
      ...props,
    },
    content: formatBlockContent(text),
    children: Array.isArray(children) ? children : [],
  };
}

function createParagraphBlock({ text = "", props = {}, children = [], id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      ...props,
    },
    content: formatBlockContent(text),
    children: Array.isArray(children) ? children : [],
  };
}

function createBulletListItemBlock({ text = "", props = {}, children = [], id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "bulletListItem",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      ...props,
    },
    content: formatBlockContent(text),
    children: Array.isArray(children) ? children : [],
  };
}

function createNumberedListItemBlock({ text = "", props = {}, children = [], id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "numberedListItem",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      ...props,
    },
    content: formatBlockContent(text),
    children: Array.isArray(children) ? children : [],
  };
}

function createCheckListItemBlock({ text = "", checked = false, props = {}, children = [], id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "checkListItem",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      checked: Boolean(checked),
      ...props,
    },
    content: formatBlockContent(text),
    children: Array.isArray(children) ? children : [],
  };
}

function createQuoteBlock({ text = "", props = {}, children = [], id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "quote",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      ...props,
    },
    content: formatBlockContent(text),
    children: Array.isArray(children) ? children : [],
  };
}

function cleanCodeBlockText(rawText, defaultLang = "plain") {
  let text = typeof rawText === "string" ? rawText : extractTextFromBlock({ content: rawText });
  let language = defaultLang;

  if (!text) return { codeText: "", language };

  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const lines = text.split("\n");
    const startIdx = lines.findIndex((l) => l.trim().startsWith("```"));
    if (startIdx !== -1) {
      const fenceLine = lines[startIdx].trim();
      const detectedLang = fenceLine.slice(3).trim();
      if (detectedLang) {
        language = detectedLang;
      }
      lines.splice(startIdx, 1);
    }
    if (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
      lines.pop();
    }
    text = lines.join("\n");
  }

  return { codeText: text, language };
}

function createCodeBlock({ text = "", language = "plain", props = {}, children = [], id, seenIds }) {
  const initialText = props.code !== undefined ? props.code : (text || "");
  const initialLang = props.language || language || "plain";

  const { codeText, language: cleanedLang } = cleanCodeBlockText(initialText, initialLang);

  const finalProps = {
    backgroundColor: "default",
    textColor: "default",
    textAlignment: "left",
    language: cleanedLang || "plain",
    code: codeText,
    ...props,
  };

  return {
    id: getUniqueBlockId(id, seenIds),
    type: "codeBlock",
    props: finalProps,
    content: formatBlockContent(codeText),
    children: Array.isArray(children) ? children : [],
  };
}

function createDividerBlock({ props = {}, id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "divider",
    props: { ...props },
    content: [],
    children: [],
  };
}

function createAddDocBlock({ fileId, title, fileType, embedMode = "embed", props = {}, id, seenIds }) {
  return {
    id: getUniqueBlockId(id, seenIds),
    type: "addDoc",
    props: {
      fileId: fileId || props.fileId,
      docId: fileId || props.docId || props.fileId,
      title: title || props.title,
      fileType: fileType || props.fileType,
      embedMode: embedMode || props.embedMode || "embed",
      ...props,
    },
    content: [],
    children: [],
  };
}

/**
 * Transforms any raw block object into a standard BlockNote block schema based on its type
 */
function transformBlock(block, seenIds = new Set()) {
  if (!block || typeof block !== "object") return null;

  const type = block.type || "paragraph";
  const props = block.props && typeof block.props === "object" ? block.props : {};
  const children = Array.isArray(block.children)
    ? block.children.map((child) => transformBlock(child, seenIds)).filter(Boolean)
    : [];

  const textContent = block.content !== undefined ? block.content : extractTextFromBlock(block);

  switch (type) {
    case "heading":
      return createHeadingBlock({ text: textContent, level: props.level || 1, props, children, id: block.id, seenIds });
    case "paragraph":
      return createParagraphBlock({ text: textContent, props, children, id: block.id, seenIds });
    case "bulletListItem":
      return createBulletListItemBlock({ text: textContent, props, children, id: block.id, seenIds });
    case "numberedListItem":
      return createNumberedListItemBlock({ text: textContent, props, children, id: block.id, seenIds });
    case "checkListItem":
      return createCheckListItemBlock({ text: textContent, checked: props.checked, props, children, id: block.id, seenIds });
    case "quote":
      return createQuoteBlock({ text: textContent, props, children, id: block.id, seenIds });
    case "codeBlock":
      return createCodeBlock({ text: textContent, language: props.language, props, children, id: block.id, seenIds });
    case "divider":
      return createDividerBlock({ props, id: block.id, seenIds });
    case "addDoc":
      return createAddDocBlock({ fileId: props.fileId, title: props.title, fileType: props.fileType, embedMode: props.embedMode, props, id: block.id, seenIds });
    default:
      return createParagraphBlock({ text: textContent, props, children, id: block.id, seenIds });
  }
}

function extractTextFromBlock(block) {
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .join("");
  }
  return block.text || "";
}

/**
 * Converts raw markdown string into BlockNote JSON block objects using block transformers
 */
function convertMarkdownToBlockNoteBlocks(markdownText, seenIds = new Set()) {
  if (!markdownText) return [];
  const lines = String(markdownText).split("\n");
  const blocks = [];
  let inCodeBlock = false;
  let codeLanguage = "plain";
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        blocks.push(createCodeBlock({ text: codeLines.join("\n"), language: codeLanguage || "plain", seenIds }));
        inCodeBlock = false;
        codeLines = [];
      } else {
        inCodeBlock = true;
        codeLanguage = line.trim().slice(3).trim() || "plain";
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ")) {
      blocks.push(createHeadingBlock({ text: trimmed.slice(2).trim(), level: 1, seenIds }));
    } else if (trimmed.startsWith("## ")) {
      blocks.push(createHeadingBlock({ text: trimmed.slice(3).trim(), level: 2, seenIds }));
    } else if (trimmed.startsWith("### ")) {
      blocks.push(createHeadingBlock({ text: trimmed.slice(4).trim(), level: 3, seenIds }));
    } else if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      blocks.push(createBulletListItemBlock({ text: trimmed.slice(2).trim(), seenIds }));
    } else if (/^\d+\.\s/.test(trimmed)) {
      const itemText = trimmed.replace(/^\d+\.\s/, "").trim();
      blocks.push(createNumberedListItemBlock({ text: itemText, seenIds }));
    } else if (trimmed.startsWith("> ")) {
      blocks.push(createQuoteBlock({ text: trimmed.slice(2).trim(), seenIds }));
    } else if (trimmed === "---" || trimmed === "***") {
      blocks.push(createDividerBlock({ seenIds }));
    } else {
      blocks.push(createParagraphBlock({ text: trimmed, seenIds }));
    }
  }

  return blocks;
}

/**
 * Creates and transforms raw input/details into a clean array of BlockNote blocks
 */
function createBlocksFromDetails(rawContent) {
  if (!rawContent && rawContent !== "") return [];
  const seenIds = new Set();

  if (Array.isArray(rawContent)) {
    const blocks = rawContent.map((b) => transformBlock(b, seenIds)).filter(Boolean);
    if (blocks.length > 0) return blocks;
  }

  const textContent = String(rawContent).trim();

  // Try extracting JSON array bounds [ ... ] from textContent
  const firstBracket = textContent.indexOf("[");
  const lastBracket = textContent.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const jsonCandidate = textContent.substring(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed)) {
        const blocks = parsed.map((b) => transformBlock(b, seenIds)).filter(Boolean);
        if (blocks.length > 0) return blocks;
      }
    } catch (e) {
      console.warn("[DocumentEditorValidator] JSON parse fallback to markdown conversion.");
    }
  }

  return convertMarkdownToBlockNoteBlocks(textContent, seenIds);
}

/**
 * Validates raw content and returns structured document-editor payload
 * @param {string|Array|Object} rawContent 
 * @returns {Array<Object>} Document payload structure
 */
function validateAndTransform(rawContent) {
  const formattedBlocks = createBlocksFromDetails(rawContent);
  return [
    {
      type: "document-editor",
      data: {
        blocks: formattedBlocks
      }
    }
  ];
}

module.exports = {
  validateAndTransform,
  createBlocksFromDetails,
  transformBlock,
  convertMarkdownToBlockNoteBlocks,
  cleanCodeBlockText,
};
