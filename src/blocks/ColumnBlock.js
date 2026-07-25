import React from 'react';
import { createReactBlockSpec } from "@blocknote/react";

/**
 * Custom ColumnList Block Spec
 * Container for column child blocks.
 */
export const ColumnList = createReactBlockSpec(
  {
    type: "column_list",
    propSchema: {},
    content: "none",
  },
  {
    render: () => {
      return (
        <div 
          className="custom-column-list-container" 
          data-block-type="column_list"
          data-content-type="column_list"
        />
      );
    },
    parse: (el) => {
      if (
        el.getAttribute?.("data-content-type") === "column_list" ||
        el.getAttribute?.("data-block-type") === "column_list" ||
        el.classList?.contains("bn-column-list")
      ) {
        return {};
      }
      return undefined;
    },
    toExternalHTML: () => {
      return (
        <div data-content-type="column_list" className="bn-column-list"></div>
      );
    },
  }
);

/**
 * Custom Column Block Spec
 * Individual column inside a ColumnList.
 */
export const Column = createReactBlockSpec(
  {
    type: "column",
    propSchema: {
      width: { default: "1" },
    },
    content: "none",
  },
  {
    render: ({ block }) => {
      const flexRatio = block.props?.width || "1";
      return (
        <div 
          className="custom-column-block" 
          data-block-type="column"
          data-content-type="column"
          data-width={flexRatio}
          style={{ flex: flexRatio }}
        />
      );
    },
    parse: (el) => {
      if (
        el.getAttribute?.("data-content-type") === "column" ||
        el.getAttribute?.("data-block-type") === "column" ||
        el.classList?.contains("bn-column")
      ) {
        const width = el.getAttribute?.("data-width") || "1";
        return { width };
      }
      return undefined;
    },
    toExternalHTML: ({ block }) => {
      const flexRatio = block.props?.width || "1";
      return (
        <div
          data-content-type="column"
          data-width={flexRatio}
          className="bn-column"
          style={{ flex: flexRatio }}
        ></div>
      );
    },
  }
);

/**
 * Helper to insert column layout of specified count and width ratios
 */
export const insertColumnLayout = (editor, columnCount = 2, ratios = null) => {
  const currentBlock = editor.getTextCursorPosition()?.block;
  if (!currentBlock) return;

  const columnBlocks = Array.from({ length: columnCount }, (_, i) => ({
    type: "column",
    props: {
      width: ratios && ratios[i] !== undefined ? String(ratios[i]) : "1",
    },
    children: [
      {
        type: "paragraph",
        content: [],
      },
    ],
  }));

  const columnListBlock = {
    type: "column_list",
    children: columnBlocks,
  };

  const isCurrentBlockEmpty =
    currentBlock.type === "paragraph" &&
    (!currentBlock.content ||
      currentBlock.content.length === 0 ||
      (currentBlock.content.length === 1 && currentBlock.content[0].type === "text" && currentBlock.content[0].text === ""));

  if (isCurrentBlockEmpty) {
    editor.replaceBlocks([currentBlock.id], [columnListBlock]);
  } else {
    editor.insertBlocks([columnListBlock], currentBlock.id, "after");
  }
};

/**
 * Helper to insert a new block after the column_list container (outside columns)
 */
export const insertBlockAfterColumns = (editor) => {
  const cursor = editor.getTextCursorPosition();
  if (!cursor) return;

  let block = cursor.block;
  let columnListBlock = null;

  // Walk up parents to find the column_list block
  while (block) {
    if (block.type === "column_list") {
      columnListBlock = block;
      break;
    }
    block = editor.getParentBlock(block);
  }

  if (columnListBlock) {
    const newBlocks = editor.insertBlocks(
      [{ type: "paragraph", content: [] }],
      columnListBlock.id,
      "after"
    );
    if (newBlocks && newBlocks.length > 0) {
      editor.setTextCursorPosition(newBlocks[0].id, "start");
    }
  } else {
    const currentBlock = cursor.block;
    const newBlocks = editor.insertBlocks(
      [{ type: "paragraph", content: [] }],
      currentBlock.id,
      "after"
    );
    if (newBlocks && newBlocks.length > 0) {
      editor.setTextCursorPosition(newBlocks[0].id, "start");
    }
  }
};

/**
 * Helper to insert a new block inside the current column after active block
 */
export const insertBlockInsideColumn = (editor) => {
  const cursor = editor.getTextCursorPosition();
  if (!cursor) return;

  const currentBlock = cursor.block;
  const newBlocks = editor.insertBlocks(
    [{ type: "paragraph", content: [] }],
    currentBlock.id,
    "after"
  );
  if (newBlocks && newBlocks.length > 0) {
    editor.setTextCursorPosition(newBlocks[0].id, "start");
  }
};

/**
 * Slash Menu Items for inserting Multi-Column Layouts & Column Navigation
 */
export const getColumnSlashMenuItems = (editor) => [
  {
    title: "2 Columns",
    onItemClick: () => insertColumnLayout(editor, 2, [1, 1]),
    aliases: ["columns", "2col", "two columns", "side by side", "layout"],
    group: "Layout",
    icon: <i className="ri-layout-2-line" style={{ fontSize: "16px" }} />,
    subtext: "Create 2 equal columns side by side",
  },
  {
    title: "3 Columns",
    onItemClick: () => insertColumnLayout(editor, 3, [1, 1, 1]),
    aliases: ["columns", "3col", "three columns", "layout"],
    group: "Layout",
    icon: <i className="ri-layout-3-line" style={{ fontSize: "16px" }} />,
    subtext: "Create 3 equal columns side by side",
  },
  {
    title: "4 Columns",
    onItemClick: () => insertColumnLayout(editor, 4, [1, 1, 1, 1]),
    aliases: ["columns", "4col", "four columns", "layout"],
    group: "Layout",
    icon: <i className="ri-layout-4-line" style={{ fontSize: "16px" }} />,
    subtext: "Create 4 equal columns side by side",
  },
  {
    title: "Left Sidebar (1:2)",
    onItemClick: () => insertColumnLayout(editor, 2, [1, 2]),
    aliases: ["sidebar", "left sidebar", "asymmetric", "layout"],
    group: "Layout",
    icon: <i className="ri-layout-left-line" style={{ fontSize: "16px" }} />,
    subtext: "Create a narrow left column and wide right column",
  },
  {
    title: "Right Sidebar (2:1)",
    onItemClick: () => insertColumnLayout(editor, 2, [2, 1]),
    aliases: ["sidebar", "right sidebar", "asymmetric", "layout"],
    group: "Layout",
    icon: <i className="ri-layout-right-line" style={{ fontSize: "16px" }} />,
    subtext: "Create a wide left column and narrow right column",
  },
  {
    title: "Insert Block Below Columns",
    onItemClick: () => insertBlockAfterColumns(editor),
    aliases: ["exit column", "after columns", "below columns", "outside column", "next block"],
    group: "Layout",
    icon: <i className="ri-corner-down-right-line" style={{ fontSize: "16px" }} />,
    subtext: "Add a new full-width block below the multi-column section",
  },
  {
    title: "Insert Block Inside Column",
    onItemClick: () => insertBlockInsideColumn(editor),
    aliases: ["add inside column", "column block", "into column"],
    group: "Layout",
    icon: <i className="ri-add-box-line" style={{ fontSize: "16px" }} />,
    subtext: "Add a new block inside the current column",
  },
];
