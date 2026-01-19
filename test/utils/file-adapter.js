/**
 * Node.js File Adapter
 * Converts file buffers to File-like objects compatible with parser's loadFile() method
 * Provides FileReader polyfill for Node.js environment
 */

import fs from 'fs';
import path from 'path';

/**
 * FileReader polyfill for Node.js
 * Provides synchronous readAsArrayBuffer for File objects
 */
class FileReaderPolyfill {
  readAsArrayBuffer(blob) {
    // Simulate async behavior with immediate resolution
    // The blob should have a buffer property from our File wrapper
    if (blob && typeof blob === 'object' && blob.buffer) {
      const buffer = blob.buffer;
      if (Buffer.isBuffer(buffer)) {
        // Convert Buffer to ArrayBuffer
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        // Schedule callback asynchronously but with minimal delay
        setImmediate(() => {
          this.result = arrayBuffer;
          if (this.onload) {
            this.onload({ target: { result: arrayBuffer } });
          }
        });
        return;
      }
    }
    
    // Error case
    setImmediate(() => {
      const error = new Error('Failed to read blob');
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  abort() {
    // No-op for now
  }
}

/**
 * Install FileReader polyfill globally if not present (Node.js environment)
 */
if (typeof globalThis !== 'undefined' && !globalThis.FileReader) {
  globalThis.FileReader = FileReaderPolyfill;
}

/**
 * Create a File-like object from a buffer
 * @param {Buffer|ArrayBuffer} buffer - File content as buffer
 * @param {string} filename - Name of the file
 * @returns {object} File-like object compatible with parser
 */
function createFileFromBuffer(buffer, filename) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  
  return {
    name: filename,
    size: buf.length,
    buffer: buf,
    // Implement slice for browser compatibility
    slice: function(start, end) {
      return buf.slice(start, end);
    }
  };
}

/**
 * Load a world file from filesystem and return File-like object
 * @param {string} filePath - Absolute or relative path to world file
 * @returns {object} File-like object
 */
function loadWorldFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const buffer = fs.readFileSync(absolutePath);
  const filename = path.basename(filePath);
  
  return createFileFromBuffer(buffer, filename);
}

/**
 * Create an in-memory ArrayBuffer from File-like object (for Node.js)
 * @param {object} fileObject - File-like object with size property
 * @returns {Promise<ArrayBuffer>} ArrayBuffer representation
 */
async function fileToArrayBuffer(fileObject) {
  // If it's our File-like object with buffer property
  if (fileObject && fileObject.buffer && Buffer.isBuffer(fileObject.buffer)) {
    return fileObject.buffer.buffer.slice(
      fileObject.buffer.byteOffset,
      fileObject.buffer.byteOffset + fileObject.buffer.byteLength
    );
  }
  
  // Fallback for real File objects (browser)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(fileObject);
  });
}

export { createFileFromBuffer, loadWorldFile, fileToArrayBuffer };
