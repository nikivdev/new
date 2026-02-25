// Generated from SQL schema by @jazz/schema
// DO NOT EDIT MANUALLY

// Shared decoder for UTF-8 strings
const decoder = new TextDecoder();

// Delta type constants
export const DELTA_ADDED = 1;
export const DELTA_UPDATED = 2;
export const DELTA_REMOVED = 3;

// Crockford Base32 alphabet (matches Rust ObjectId encoding - lowercase)
const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * Convert a 16-byte binary ObjectId to Base32 string.
 * Matches the Rust ObjectId encoding format.
 */
function objectIdToString(bytes: Uint8Array, offset: number): string {
  // Read as two 64-bit values (little-endian)
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 16);
  const lo = view.getBigUint64(0, true);
  const hi = view.getBigUint64(8, true);

  // Combine into 128-bit value
  let value = (hi << 64n) | lo;

  // Encode to Base32 (26 characters for 128 bits)
  const chars = new Array(26);
  for (let i = 25; i >= 0; i--) {
    chars[i] = CROCKFORD_ALPHABET[Number(value & 0x1fn)];
    value >>= 5n;
  }

  return chars.join('');
}

/** Delta type for incremental updates */
export type Delta<T> =
  | { type: 'added'; row: T }
  | { type: 'updated'; row: T }
  | { type: 'removed'; id: string };

/**
 * Decoder state for reading from a binary buffer.
 * Used for composing decoders for nested/joined rows.
 */
export class BinaryReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  offset: number;

  constructor(buffer: ArrayBufferLike, startOffset = 0) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer as ArrayBuffer);
    this.offset = startOffset;
  }

  readObjectId(): string {
    const id = objectIdToString(this.bytes, this.offset);
    this.offset += 16;
    return id;
  }

  readU32(): number {
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readI32(): number {
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readI64(): bigint {
    const val = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readF64(): number {
    const val = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readBool(): boolean {
    return this.bytes[this.offset++] === 1;
  }

  /** Read nullable value. Returns null if not present (presence byte = 0). */
  readNullable<T>(readValue: () => T): T | null {
    if (this.bytes[this.offset++] === 0) return null;
    return readValue();
  }

  /**
   * Read a nullable ObjectId ref.
   * Nullable refs have a presence byte before the 16-byte ObjectId.
   */
  readNullableRef(): string | null {
    if (this.bytes[this.offset++] === 0) {
      this.offset += 16; // Skip the zeroed ObjectId bytes
      return null;
    }
    return this.readObjectId();
  }
}

/**
 * Decode binary rows for Summaries table (batch format)
 *
 * Row buffer layout:
 * - Fixed size: 32 bytes
 * - Variable columns: 3
 * - Offset table: 8 bytes
 */
export function decodeSummaryRows(buffer: ArrayBufferLike): Array<{ id: string; repoPath: string; startedAt: bigint; finishedAt: bigint; prompt: string; summary: string }> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer as ArrayBuffer);
  let offset = 0;

  // Read row count
  const rowCount = view.getUint32(offset, true);
  offset += 4;

  const rows = new Array(rowCount);

  for (let i = 0; i < rowCount; i++) {
    // Read row size (row buffer with id as first 16 bytes)
    const rowSize = view.getUint32(offset, true);
    offset += 4;
    const rowStart = offset;
    const rowEnd = rowStart + rowSize;
    const bufferStart = rowStart; // Row buffer starts here (id is first 16 bytes)

    // Fixed columns
    const id = objectIdToString(bytes, bufferStart + 0);
    const startedAt = view.getBigInt64(bufferStart + 16, true);
    const finishedAt = view.getBigInt64(bufferStart + 24, true);

    // Variable columns (using offset table)
    const offsetTableStart = bufferStart + 32;
    const varOffset1 = bufferStart + view.getUint32(offsetTableStart + 0, true);
    const varOffset2 = bufferStart + view.getUint32(offsetTableStart + 4, true);
    const varDataStart = bufferStart + 32 + 8;

    const repoPath = decoder.decode(bytes.subarray(varDataStart, varOffset1));
    const prompt = decoder.decode(bytes.subarray(varOffset1, varOffset2));
    const summary = decoder.decode(bytes.subarray(varOffset2, rowEnd));

    rows[i] = { id, repoPath, startedAt, finishedAt, prompt, summary };
    offset = rowEnd;
  }

  return rows;
}

/**
 * Decode a Summary delta from binary
 * Format: u8 type (1=added, 2=updated, 3=removed) + [row buffer with id] or just ObjectId for removed
 */
export function decodeSummaryDelta(buffer: ArrayBufferLike): Delta<{ id: string; repoPath: string; startedAt: bigint; finishedAt: bigint; prompt: string; summary: string }> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer as ArrayBuffer);
  const deltaType = bytes[0];

  if (deltaType === DELTA_REMOVED) {
    const id = objectIdToString(bytes, 1);
    return { type: 'removed', id };
  }

  // Added or Updated: decode the row buffer (id is first 16 bytes)
  const bufferStart = 1; // After delta type byte
  const rowEnd = bytes.length;

  const id = objectIdToString(bytes, bufferStart + 0);
  const startedAt = view.getBigInt64(bufferStart + 16, true);
  const finishedAt = view.getBigInt64(bufferStart + 24, true);
  const offsetTableStart = bufferStart + 32;
  const varOffset1 = bufferStart + view.getUint32(offsetTableStart + 0, true);
  const varOffset2 = bufferStart + view.getUint32(offsetTableStart + 4, true);
  const varDataStart = bufferStart + 32 + 8;
  const repoPath = decoder.decode(bytes.subarray(varDataStart, varOffset1));
  const prompt = decoder.decode(bytes.subarray(varOffset1, varOffset2));
  const summary = decoder.decode(bytes.subarray(varOffset2, rowEnd));

  return {
    type: deltaType === DELTA_ADDED ? 'added' : 'updated',
    row: { id, repoPath, startedAt, finishedAt, prompt, summary }
  };
}

/**
 * Read a Summary row using a BinaryReader.
 * NOTE: This table has variable columns - use decodeSummaryRows/decodeSummaryDelta instead.
 */
export function readSummary(reader: BinaryReader): { id: string; repoPath: string; startedAt: bigint; finishedAt: bigint; prompt: string; summary: string } {
  throw new Error('readSummary requires row boundary context - use decodeSummaryRows or decodeSummaryDelta instead');
}

/**
 * Decode binary rows for AgentMessages table (batch format)
 *
 * Row buffer layout:
 * - Fixed size: 24 bytes
 * - Variable columns: 4
 * - Offset table: 12 bytes
 */
export function decodeAgentMessageRows(buffer: ArrayBufferLike): Array<{ id: string; repoPath: string; requestId: string; role: string; content: string; createdAt: bigint }> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer as ArrayBuffer);
  let offset = 0;

  // Read row count
  const rowCount = view.getUint32(offset, true);
  offset += 4;

  const rows = new Array(rowCount);

  for (let i = 0; i < rowCount; i++) {
    // Read row size (row buffer with id as first 16 bytes)
    const rowSize = view.getUint32(offset, true);
    offset += 4;
    const rowStart = offset;
    const rowEnd = rowStart + rowSize;
    const bufferStart = rowStart; // Row buffer starts here (id is first 16 bytes)

    // Fixed columns
    const id = objectIdToString(bytes, bufferStart + 0);
    const createdAt = view.getBigInt64(bufferStart + 16, true);

    // Variable columns (using offset table)
    const offsetTableStart = bufferStart + 24;
    const varOffset1 = bufferStart + view.getUint32(offsetTableStart + 0, true);
    const varOffset2 = bufferStart + view.getUint32(offsetTableStart + 4, true);
    const varOffset3 = bufferStart + view.getUint32(offsetTableStart + 8, true);
    const varDataStart = bufferStart + 24 + 12;

    const repoPath = decoder.decode(bytes.subarray(varDataStart, varOffset1));
    const requestId = decoder.decode(bytes.subarray(varOffset1, varOffset2));
    const role = decoder.decode(bytes.subarray(varOffset2, varOffset3));
    const content = decoder.decode(bytes.subarray(varOffset3, rowEnd));

    rows[i] = { id, repoPath, requestId, role, content, createdAt };
    offset = rowEnd;
  }

  return rows;
}

/**
 * Decode a AgentMessage delta from binary
 * Format: u8 type (1=added, 2=updated, 3=removed) + [row buffer with id] or just ObjectId for removed
 */
export function decodeAgentMessageDelta(buffer: ArrayBufferLike): Delta<{ id: string; repoPath: string; requestId: string; role: string; content: string; createdAt: bigint }> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer as ArrayBuffer);
  const deltaType = bytes[0];

  if (deltaType === DELTA_REMOVED) {
    const id = objectIdToString(bytes, 1);
    return { type: 'removed', id };
  }

  // Added or Updated: decode the row buffer (id is first 16 bytes)
  const bufferStart = 1; // After delta type byte
  const rowEnd = bytes.length;

  const id = objectIdToString(bytes, bufferStart + 0);
  const createdAt = view.getBigInt64(bufferStart + 16, true);
  const offsetTableStart = bufferStart + 24;
  const varOffset1 = bufferStart + view.getUint32(offsetTableStart + 0, true);
  const varOffset2 = bufferStart + view.getUint32(offsetTableStart + 4, true);
  const varOffset3 = bufferStart + view.getUint32(offsetTableStart + 8, true);
  const varDataStart = bufferStart + 24 + 12;
  const repoPath = decoder.decode(bytes.subarray(varDataStart, varOffset1));
  const requestId = decoder.decode(bytes.subarray(varOffset1, varOffset2));
  const role = decoder.decode(bytes.subarray(varOffset2, varOffset3));
  const content = decoder.decode(bytes.subarray(varOffset3, rowEnd));

  return {
    type: deltaType === DELTA_ADDED ? 'added' : 'updated',
    row: { id, repoPath, requestId, role, content, createdAt }
  };
}

/**
 * Read a AgentMessage row using a BinaryReader.
 * NOTE: This table has variable columns - use decodeAgentMessageRows/decodeAgentMessageDelta instead.
 */
export function readAgentMessage(reader: BinaryReader): { id: string; repoPath: string; requestId: string; role: string; content: string; createdAt: bigint } {
  throw new Error('readAgentMessage requires row boundary context - use decodeAgentMessageRows or decodeAgentMessageDelta instead');
}
