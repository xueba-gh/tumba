import { ProjectSchema, type Project } from "./schema.js";

/** CRC-32 table for ZIP checksums */
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]!) & 0xff]!;
  }
  return (crc ^ -1) >>> 0;
}

export interface ZipEntry {
  filename: string;
  data: Uint8Array;
}

/**
 * Creates an uncompressed ZIP archive as a Uint8Array.
 * Storage method 0 is universally compatible without external compression dependencies.
 */
export function createZipArchive(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const textEncoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const filenameBytes = textEncoder.encode(entry.filename);
    const data = entry.data;
    const dataCrc = crc32(data);
    const dataLen = data.length;

    // Local header: 30 bytes + filename length + data length
    const localHeader = new Uint8Array(30 + filenameBytes.length + dataLen);
    const lv = new DataView(localHeader.buffer);

    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0, true); // General purpose bit flag
    lv.setUint16(8, 0, true); // Compression method (0 = Store)
    lv.setUint16(10, 0, true); // File last modification time
    lv.setUint16(12, 0, true); // File last modification date
    lv.setUint32(14, dataCrc, true); // CRC-32
    lv.setUint32(18, dataLen, true); // Compressed size
    lv.setUint32(22, dataLen, true); // Uncompressed size
    lv.setUint16(26, filenameBytes.length, true); // Filename length
    lv.setUint16(28, 0, true); // Extra field length

    localHeader.set(filenameBytes, 30);
    localHeader.set(data, 30 + filenameBytes.length);
    localHeaders.push(localHeader);

    // Central directory header: 46 bytes + filename length
    const centralHeader = new Uint8Array(46 + filenameBytes.length);
    const cv = new DataView(centralHeader.buffer);

    cv.setUint32(0, 0x02014b50, true); // Central directory header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0, true); // General purpose bit flag
    cv.setUint16(10, 0, true); // Compression method
    cv.setUint16(12, 0, true); // Last mod time
    cv.setUint16(14, 0, true); // Last mod date
    cv.setUint32(16, dataCrc, true); // CRC-32
    cv.setUint32(20, dataLen, true); // Compressed size
    cv.setUint32(24, dataLen, true); // Uncompressed size
    cv.setUint16(28, filenameBytes.length, true); // Filename length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(40, 0, true); // External file attributes
    cv.setUint32(42, currentOffset, true); // Relative offset of local header

    centralHeader.set(filenameBytes, 46);
    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length;
  }

  const cdOffset = currentOffset;
  let cdSize = 0;
  for (const ch of centralHeaders) {
    cdSize += ch.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Disk with central directory
  ev.setUint16(8, entries.length, true); // Central directory records on this disk
  ev.setUint16(10, entries.length, true); // Total central directory records
  ev.setUint32(12, cdSize, true); // Size of central directory
  ev.setUint32(16, cdOffset, true); // Offset of central directory
  ev.setUint16(20, 0, true); // Comment length

  // Combine everything
  const totalLength = cdOffset + cdSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const lh of localHeaders) {
    result.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}

/**
 * Parses a ZIP archive from Uint8Array/ArrayBuffer.
 * Supports Store (method 0) and Deflate (method 8 via DecompressionStream if available).
 */
export async function parseZipArchive(buffer: Uint8Array): Promise<ZipEntry[]> {
  const textDecoder = new TextDecoder();
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const entries: ZipEntry[] = [];

  // Find EOCD (End of Central Directory) signature 0x06054b50 searching from end
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP file: End of Central Directory signature not found");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > buffer.length || view.getUint32(pos, true) !== 0x02014b50) {
      break;
    }

    const compression = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const filenameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);

    const filenameBytes = buffer.subarray(pos + 46, pos + 46 + filenameLen);
    const filename = textDecoder.decode(filenameBytes);

    // Advance CD pointer
    pos += 46 + filenameLen + extraLen + commentLen;

    // Skip directory entries ending with '/'
    if (filename.endsWith("/")) continue;

    // Read local header at localHeaderOffset
    if (
      localHeaderOffset + 30 > buffer.length ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      continue;
    }

    const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFilenameLen + localExtraLen;
    const rawData = buffer.subarray(dataStart, dataStart + compressedSize);

    let finalData: Uint8Array;
    if (compression === 0) {
      finalData = new Uint8Array(rawData);
    } else if (compression === 8) {
      // Deflate
      if (typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        // Copy into a fresh ArrayBuffer-backed view: rawData may be a subarray of a
        // SharedArrayBuffer-backed buffer, which BufferSource does not accept.
        await writer.write(Uint8Array.from(rawData));
        await writer.close();
        const response = new Response(ds.readable);
        const arrayBuf = await response.arrayBuffer();
        finalData = new Uint8Array(arrayBuf);
      } else {
        throw new Error(
          `Cannot extract compressed ZIP entry ${filename}: DecompressionStream API is unavailable in this environment`,
        );
      }
    } else {
      throw new Error(`Unsupported compression method ${compression} for file ${filename}`);
    }

    entries.push({ filename, data: finalData });
  }

  return entries;
}

/** Export a Project + media files into a ZIP Uint8Array */
export function exportProjectToZip(
  project: Project,
  mediaFiles: Map<string, Uint8Array>,
): Uint8Array<ArrayBuffer> {
  const textEncoder = new TextEncoder();
  const entries: ZipEntry[] = [
    {
      filename: "project.json",
      data: textEncoder.encode(JSON.stringify(project, null, 2)),
    },
  ];

  for (const [name, data] of mediaFiles.entries()) {
    const cleanName = name.replace(/^media\//, "");
    entries.push({
      filename: `media/${cleanName}`,
      data,
    });
  }

  return createZipArchive(entries);
}

/** Import a Project + media files from a ZIP Uint8Array */
export async function importProjectFromZip(
  zipBuffer: Uint8Array,
): Promise<{ project: Project; mediaFiles: Map<string, Uint8Array> }> {
  const entries = await parseZipArchive(zipBuffer);
  const textDecoder = new TextDecoder();

  const projectEntry = entries.find(
    (e) => e.filename === "project.json" || e.filename.endsWith("/project.json"),
  );
  if (!projectEntry) {
    throw new Error("Invalid project ZIP: project.json missing from root");
  }

  const jsonText = textDecoder.decode(projectEntry.data);
  const parsedJson = JSON.parse(jsonText);
  const project = ProjectSchema.parse(parsedJson);

  const mediaFiles = new Map<string, Uint8Array>();
  for (const entry of entries) {
    if (entry.filename === projectEntry.filename) continue;
    // Extract filename from media/ folder
    const match = entry.filename.match(/(?:^|\/)media\/(.+)$/);
    if (match && match[1]) {
      mediaFiles.set(match[1], entry.data);
    } else {
      const baseName = entry.filename.split("/").pop();
      if (baseName) {
        mediaFiles.set(baseName, entry.data);
      }
    }
  }

  return { project, mediaFiles };
}
