(() => {
  if (window.__CQS_ZIP__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));

  const encoder = new TextEncoder();
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function toBlob(value, type = "application/octet-stream") {
    if (value instanceof Blob) return value;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return new Blob([value], { type });
    return new Blob([String(value ?? "")], { type });
  }

  function sanitizeEntryPath(path) {
    return String(path || "file")
      .replace(/\\/g, "/")
      .split("/")
      .filter((segment) => segment && segment !== "." && segment !== "..")
      .map((segment) => segment.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/[. ]+$/g, "") || "file")
      .join("/")
      .slice(0, 600) || "file";
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const dosTime = ((date.getHours() & 0x1f) << 11)
      | ((date.getMinutes() & 0x3f) << 5)
      | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
    const dosDate = (((year - 1980) & 0x7f) << 9)
      | (((date.getMonth() + 1) & 0x0f) << 5)
      | (date.getDate() & 0x1f);
    return { dosTime, dosDate };
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value & 0xffff, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function updateCrc(crc, chunk) {
    let value = crc;
    for (let i = 0; i < chunk.length; i += 1) value = CRC_TABLE[(value ^ chunk[i]) & 0xff] ^ (value >>> 8);
    return value;
  }

  async function crc32(blob, onChunk) {
    let crc = 0xffffffff;
    let processed = 0;

    if (typeof blob.stream === "function") {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
          crc = updateCrc(crc, chunk);
          processed += chunk.length;
          onChunk?.(processed, blob.size);
        }
      } finally {
        try { await reader.cancel(); } catch (_) {}
        reader.releaseLock?.();
      }
    } else {
      const buffer = typeof blob.arrayBuffer === "function"
        ? await blob.arrayBuffer()
        : await new Response(blob).arrayBuffer();
      const chunk = new Uint8Array(buffer);
      crc = updateCrc(crc, chunk);
      processed = chunk.length;
      onChunk?.(processed, blob.size);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeLocalHeader(entry) {
    const buffer = new ArrayBuffer(30);
    const view = new DataView(buffer);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 0x0800);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, entry.dosTime);
    writeUint16(view, 12, entry.dosDate);
    writeUint32(view, 14, entry.crc);
    writeUint32(view, 18, entry.size);
    writeUint32(view, 22, entry.size);
    writeUint16(view, 26, entry.nameBytes.length);
    writeUint16(view, 28, 0);
    return new Uint8Array(buffer);
  }

  function makeCentralHeader(entry) {
    const buffer = new ArrayBuffer(46);
    const view = new DataView(buffer);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 0x0314);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, 0x0800);
    writeUint16(view, 10, 0);
    writeUint16(view, 12, entry.dosTime);
    writeUint16(view, 14, entry.dosDate);
    writeUint32(view, 16, entry.crc);
    writeUint32(view, 20, entry.size);
    writeUint32(view, 24, entry.size);
    writeUint16(view, 28, entry.nameBytes.length);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, entry.offset);
    return new Uint8Array(buffer);
  }

  function makeEndRecord(entryCount, centralSize, centralOffset) {
    const buffer = new ArrayBuffer(22);
    const view = new DataView(buffer);
    writeUint32(view, 0, 0x06054b50);
    writeUint16(view, 4, 0);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, entryCount);
    writeUint16(view, 10, entryCount);
    writeUint32(view, 12, centralSize);
    writeUint32(view, 16, centralOffset);
    writeUint16(view, 20, 0);
    return new Uint8Array(buffer);
  }

  async function buildZip(inputEntries, options = {}) {
    const entries = [];
    let totalBytes = 0;
    for (const input of inputEntries || []) {
      const blob = toBlob(input.data, input.type);
      const name = sanitizeEntryPath(input.name);
      if (blob.size > 0xffffffff) throw new Error(tr("檔案超過 ZIP32 支援上限：{name}", "File exceeds the ZIP32 limit: {name}", { name }));
      totalBytes += blob.size;
      if (totalBytes > 0xffffffff) throw new Error(tr("封存總大小超過 4 GB，目前版本尚未支援 ZIP64。", "The archive exceeds 4 GB. ZIP64 is not supported in this version."));
      const nameBytes = encoder.encode(name);
      if (nameBytes.length > 0xffff) throw new Error(tr("ZIP 內部路徑過長：{name}", "ZIP entry path is too long: {name}", { name }));
      const { dosTime, dosDate } = dosDateTime(input.date instanceof Date ? input.date : new Date());
      entries.push({ name, nameBytes, blob, size: blob.size, dosTime, dosDate, crc: 0, offset: 0 });
    }
    if (entries.length > 0xffff) throw new Error(tr("檔案數量超過 ZIP32 支援上限。", "The file count exceeds the ZIP32 limit."));

    let completedBytes = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (options.isCancelled?.()) throw new Error(tr("使用者取消封存。", "Archive cancelled by the user."));
      entry.crc = await crc32(entry.blob, (processed) => {
        if (options.isCancelled?.()) throw new Error(tr("使用者取消封存。", "Archive cancelled by the user."));
        options.onProgress?.({
          phase: "checksum",
          index,
          count: entries.length,
          name: entry.name,
          processedBytes: completedBytes + processed,
          totalBytes,
        });
      });
      completedBytes += entry.size;
    }

    const parts = [];
    let offset = 0;
    for (const entry of entries) {
      if (options.isCancelled?.()) throw new Error(tr("使用者取消封存。", "Archive cancelled by the user."));
      entry.offset = offset;
      const localHeader = makeLocalHeader(entry);
      parts.push(localHeader, entry.nameBytes, entry.blob);
      offset += localHeader.byteLength + entry.nameBytes.byteLength + entry.size;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (const entry of entries) {
      const centralHeader = makeCentralHeader(entry);
      parts.push(centralHeader, entry.nameBytes);
      centralSize += centralHeader.byteLength + entry.nameBytes.byteLength;
    }
    parts.push(makeEndRecord(entries.length, centralSize, centralOffset));
    options.onProgress?.({ phase: "done", index: entries.length, count: entries.length, processedBytes: totalBytes, totalBytes });
    return new Blob(parts, { type: "application/zip" });
  }

  window.__CQS_ZIP__ = Object.freeze({ buildZip, sanitizeEntryPath });
})();
