const ZIP_DOS_EPOCH = new Date("1980-01-01T00:00:00Z");
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function dateToZipTime(dateValue?: string) {
  const date = new Date(dateValue || "");
  const safeDate = Number.isNaN(date.getTime()) || date < ZIP_DOS_EPOCH ? ZIP_DOS_EPOCH : date;
  const dosTime = (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | Math.floor(safeDate.getSeconds() / 2);
  const dosDate = ((safeDate.getFullYear() - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate();
  return { dosTime, dosDate };
}
function pushUint16(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

export async function buildZipBlob(files: Array<{ name: string; blob: Blob; updatedAt?: string }>) {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name.replace(/\\/g, "/"));
    const checksum = crc32(data);
    const { dosTime, dosDate } = dateToZipTime(file.updatedAt);

    const localHeader: number[] = [];
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0x0800);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, dosTime);
    pushUint16(localHeader, dosDate);
    pushUint32(localHeader, checksum);
    pushUint32(localHeader, data.byteLength);
    pushUint32(localHeader, data.byteLength);
    pushUint16(localHeader, nameBytes.byteLength);
    pushUint16(localHeader, 0);
    localParts.push(new Uint8Array(localHeader), nameBytes, data);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0x0800);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, dosTime);
    pushUint16(centralHeader, dosDate);
    pushUint32(centralHeader, checksum);
    pushUint32(centralHeader, data.byteLength);
    pushUint32(centralHeader, data.byteLength);
    pushUint16(centralHeader, nameBytes.byteLength);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (typeof part === "string" ? encoder.encode(part).byteLength : part instanceof Blob ? part.size : part.byteLength), 0);
  const endHeader: number[] = [];
  pushUint32(endHeader, 0x06054b50);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, files.length);
  pushUint16(endHeader, files.length);
  pushUint32(endHeader, centralSize);
  pushUint32(endHeader, offset);
  pushUint16(endHeader, 0);
  return new Blob([...localParts, ...centralParts, new Uint8Array(endHeader)], { type: "application/zip" });
}
