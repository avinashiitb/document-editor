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
    
    // Recursively sanitize child blocks
    if (sanitized.children) {
      sanitized.children = sanitizeBlocks(sanitized.children);
    }
    
    return sanitized;
  });
};
