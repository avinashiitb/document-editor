/**
 * DevScribe Document Editor - LLM Parser
 * Converts stored BlockNote document blocks into clean, structured, LLM-readable Markdown.
 */

/**
 * Converts BlockNote inline content array or string into markdown text with styles.
 * @param {Array|string} content - BlockNote content structure
 * @returns {string} Formatted markdown text
 */
function inlineContentToMarkdown(content) {
  if (!content) return "";
  if (typeof content === "string") return content;

  if (!Array.isArray(content)) {
    if (typeof content === "object" && content.text) {
      content = [content];
    } else {
      return String(content || "");
    }
  }

  return content
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;

      // Link block
      if (item.type === "link") {
        const linkText = inlineContentToMarkdown(item.content || item.text || item.href || "link");
        return `[${linkText}](${item.href || ""})`;
      }

      let text = String(item.text || "");
      if (!text) return "";

      const styles = item.styles || {};
      if (styles.code) {
        text = `\`${text}\``;
      }
      if (styles.bold) {
        text = `**${text}**`;
      }
      if (styles.italic) {
        text = `*${text}*`;
      }
      if (styles.strike) {
        text = `~~${text}~~`;
      }
      if (styles.underline) {
        text = `<u>${text}</u>`;
      }

      return text;
    })
    .join("");
}

/**
 * Converts a single BlockNote block into its markdown string representation.
 * @param {Object} block - BlockNote block object
 * @param {number} depth - Indentation depth for nested lists
 * @returns {string} Markdown text for block
 */
function blockToMarkdown(block, depth = 0) {
  if (!block || typeof block !== "object") return "";

  const type = block.type || "paragraph";
  const props = block.props || {};
  const indent = "  ".repeat(depth);
  const inlineText = inlineContentToMarkdown(block.content);
  const children = Array.isArray(block.children) ? block.children : [];

  let result = "";

  switch (type) {
    case "heading": {
      const level = Math.min(Math.max(Number(props.level) || 1, 1), 6);
      const prefix = "#".repeat(level);
      result = `${prefix} ${inlineText}`;
      break;
    }

    case "paragraph": {
      result = inlineText;
      break;
    }

    case "bulletListItem": {
      result = `${indent}- ${inlineText}`;
      break;
    }

    case "numberedListItem": {
      result = `${indent}1. ${inlineText}`;
      break;
    }

    case "checkListItem": {
      const mark = props.checked ? "x" : " ";
      result = `${indent}- [${mark}] ${inlineText}`;
      break;
    }

    case "quote": {
      const lines = inlineText.split("\n");
      result = lines.map((l) => `> ${l}`).join("\n");
      break;
    }

    case "codeBlock": {
      const lang = props.language || "";
      result = `\`\`\`${lang}\n${inlineText}\n\`\`\``;
      break;
    }

    case "divider": {
      result = "---";
      break;
    }

    case "table": {
      if (props.rows && Array.isArray(props.rows)) {
        result = props.rows
          .map((row, idx) => {
            const cells = Array.isArray(row) ? row : (row.cells || []);
            const rowStr = `| ${cells.map((c) => inlineContentToMarkdown(c)).join(" | ")} |`;
            if (idx === 0) {
              const separator = `| ${cells.map(() => "---").join(" | ")} |`;
              return `${rowStr}\n${separator}`;
            }
            return rowStr;
          })
          .join("\n");
      } else {
        result = inlineText;
      }
      break;
    }

    case "addDoc": {
      const fId = props.fileId || props.docId || "";
      const title = props.title || "Embedded Document";
      const fType = props.fileType || "document";
      const mode = props.embedMode || "embed";
      result = `[Embedded Artifact: "${title}" (fileType: "${fType}", id: "${fId}", mode: "${mode}")]`;
      break;
    }

    default: {
      result = inlineText;
      break;
    }
  }

  // Recursively process child blocks (e.g. nested lists)
  if (children.length > 0) {
    const childrenMarkdown = children
      .map((child) => blockToMarkdown(child, depth + 1))
      .filter((s) => s.trim().length > 0)
      .join("\n");
    if (childrenMarkdown) {
      result += (result ? "\n" : "") + childrenMarkdown;
    }
  }

  return result;
}

/**
 * Converts a list of BlockNote blocks into markdown text.
 * @param {Array<Object>} blocks - Array of BlockNote blocks
 * @returns {string} Complete Markdown document string
 */
function blocksToMarkdown(blocks = []) {
  if (!Array.isArray(blocks)) return "";

  const sections = [];
  for (const block of blocks) {
    const md = blockToMarkdown(block, 0);
    if (md && md.trim().length > 0) {
      sections.push(md);
    }
  }

  return sections.join("\n\n").trim();
}

/**
 * Extracts blocks array from various possible document payload wrappers stored in SQLite
 * @param {string|Array|Object} rawPayload - Raw document data from SQLite
 * @returns {Array<Object>} Extracted BlockNote blocks array
 */
function extractBlocks(rawPayload) {
  if (!rawPayload) return [];

  let data = rawPayload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }

  if (Array.isArray(data)) {
    // Check if it's the standard DevScribe plugin payload wrapper:
    // [ { type: "document-editor", data: { blocks: [...] } } ]
    if (data.length > 0 && data[0] && data[0].type === "document-editor" && data[0].data?.blocks) {
      return Array.isArray(data[0].data.blocks) ? data[0].data.blocks : [];
    }
    // Or if it's directly an array of BlockNote blocks:
    if (data.length > 0 && data[0] && (data[0].type || data[0].id)) {
      return data;
    }
  }

  if (data && typeof data === "object") {
    if (Array.isArray(data.blocks)) return data.blocks;
    if (data.data && Array.isArray(data.data.blocks)) return data.data.blocks;
  }

  return [];
}

/**
 * Primary export: Converts stored document-editor blocks into clean, LLM-readable text (Markdown).
 * @param {string|Array|Object} documentPayload - Stored blocks from SQLite documents table
 * @returns {string} Human and LLM-readable Markdown string
 */
function toLlmText(documentPayload) {
  const blocks = extractBlocks(documentPayload);
  if (!blocks || blocks.length === 0) {
    if (typeof documentPayload === "string" && documentPayload.trim()) {
      return documentPayload.trim();
    }
    return "";
  }
  return blocksToMarkdown(blocks);
}

module.exports = {
  toLlmText,
  blocksToMarkdown,
  blockToMarkdown,
  inlineContentToMarkdown,
  extractBlocks,
};
