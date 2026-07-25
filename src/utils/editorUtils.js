/**
 * Robust sanitation helper to convert legacy/invalid block configurations to standard BlockNote structure.
 * 
 * @param {Array} blocks - Array of block objects to sanitize
 * @returns {Array} Sanitized block list matching standard BlockNote specifications
 */
export const sanitizeBlocks = (blocks) => {
  if (!Array.isArray(blocks)) return [];
  
  return blocks.map(block => {
    if (!block || typeof block !== 'object') {
      return { type: 'paragraph', content: [] };
    }
    
    const sanitized = { ...block };
    
    // Handle table blocks specially since their content field is a TableContent object, not InlineContent[]
    if (sanitized.type === 'table') {
      if (sanitized.content && typeof sanitized.content === 'object' && !Array.isArray(sanitized.content)) {
        const tableContent = { ...sanitized.content };
        if (Array.isArray(tableContent.rows)) {
          tableContent.rows = tableContent.rows.map(row => {
            if (row && typeof row === 'object' && Array.isArray(row.cells)) {
              return {
                ...row,
                cells: row.cells.map(cell => {
                  if (cell && typeof cell === 'object') {
                    let cellContent = cell.content;
                    if (typeof cellContent === 'string') {
                      cellContent = [{ type: 'text', text: cellContent, styles: {} }];
                    } else if (Array.isArray(cellContent)) {
                      cellContent = cellContent.map(inline => {
                        if (typeof inline === 'string') {
                          return { type: 'text', text: inline, styles: {} };
                        }
                        if (inline && typeof inline === 'object') {
                          return {
                            type: inline.type || 'text',
                            text: inline.text || '',
                            styles: inline.styles || {},
                            ...(inline.href ? { href: inline.href } : {}),
                            ...(inline.content ? { content: sanitizeBlocks(inline.content) } : {})
                          };
                        }
                        return { type: 'text', text: '', styles: {} };
                      });
                    } else {
                      cellContent = [];
                    }
                    return {
                      ...cell,
                      content: cellContent
                    };
                  }
                  return { type: 'tableCell', props: {}, content: [] };
                })
              };
            }
            return { cells: [] };
          });
        }
        sanitized.content = tableContent;
      } else {
        sanitized.content = {
          type: "tableContent",
          rows: []
        };
      }
    } else if (sanitized.type === 'column_list' || sanitized.type === 'column') {
      sanitized.content = undefined;
    } else {
      // Convert string content to standard InlineContent[]
      if (typeof sanitized.content === 'string') {
        sanitized.content = [{ type: 'text', text: sanitized.content, styles: {} }];
      } else if (!Array.isArray(sanitized.content)) {
        sanitized.content = [];
      } else {
        // Map inline content array
        sanitized.content = sanitized.content.map(inline => {
          if (typeof inline === 'string') {
            return { type: 'text', text: inline, styles: {} };
          }
          if (inline && typeof inline === 'object') {
            return {
              type: inline.type || 'text',
              text: inline.text || '',
              styles: inline.styles || {},
              ...(inline.href ? { href: inline.href } : {}),
              ...(inline.content ? { content: sanitizeBlocks(inline.content) } : {})
            };
          }
          return { type: 'text', text: '', styles: {} };
        });
      }
    }

    // Map unsupported 'code' blocks gracefully to standard paragraphs with code inline styling
    if (sanitized.type === 'code') {
      sanitized.type = 'paragraph';
      const rawText = block.content || '';
      sanitized.content = [{
        type: 'text',
        text: typeof rawText === 'string' ? rawText : JSON.stringify(rawText),
        styles: { code: true }
      }];
    }

    if (sanitized.type === 'codeBlock') {
      let codeText = '';
      if (sanitized.content && Array.isArray(sanitized.content)) {
        codeText = sanitized.content.map(inline => inline.text || '').join('');
      } else if (typeof sanitized.content === 'string') {
        codeText = sanitized.content;
      }
      sanitized.props = {
        ...sanitized.props,
        code: sanitized.props?.code || codeText
      };
      sanitized.content = [];
    }
    
    // Recursively sanitize child blocks
    if (sanitized.children) {
      sanitized.children = sanitizeBlocks(sanitized.children);
    }
    
    return sanitized;
  });
};
