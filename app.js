const dropzone = document.querySelector("#dropzone");
const input = document.querySelector("#file-input");
const browse = document.querySelector("#browse-button");
const processing = document.querySelector("#processing");
const result = document.querySelector("#result");
const errorBox = document.querySelector("#error");
const preview = document.querySelector("#preview");
const output = { name: "", blob: null, url: "" };

browse.addEventListener("click", () => input.click());
dropzone.addEventListener("click", (event) => {
  if (event.target !== browse) input.click();
});
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") input.click();
});
["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");
}));
dropzone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
input.addEventListener("change", () => handleFile(input.files[0]));
document.querySelector("#reset-button").addEventListener("click", reset);
document.querySelector("#download-button").addEventListener("click", download);

async function handleFile(file) {
  clearError();
  if (!file) return;
  if (!file.type.startsWith("image/")) return showError("Please upload an image file.");
  if (file.size > 50 * 1024 * 1024) return showError("Image size must be under 50 MB.");
  dropzone.classList.add("hidden");
  processing.classList.remove("hidden");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let outputType = file.type;
    let clean;
    if (file.type === "image/jpeg") clean = cleanJpeg(bytes);
    else if (file.type === "image/png") clean = cleanPng(bytes);
    else if (file.type === "image/webp") clean = cleanWebp(bytes);
    else {
      outputType = "image/png";
      clean = await rasterizeToPng(file);
    }
    output.blob = new Blob([clean], { type: outputType });
    output.name = `${file.name.replace(/\.[^.]+$/, "")}-clean.${outputType === "image/png" ? "png" : outputType.split("/")[1].replace("jpeg", "jpg")}`;
    output.url = URL.createObjectURL(output.blob);
    preview.src = output.url;
    document.querySelector("#file-name").textContent = output.name;
    document.querySelector("#file-type").textContent = outputType.split("/")[1].toUpperCase().replace("JPEG", "JPG");
    document.querySelector("#file-size").textContent = formatBytes(output.blob.size);
    document.querySelector("#fingerprint").textContent = "CLEAN + ATTRIBUTION";
    processing.classList.add("hidden");
    result.classList.remove("hidden");
  } catch (error) {
    processing.classList.add("hidden");
    dropzone.classList.remove("hidden");
    showError("This file could not be processed. Please try another image.");
    console.error(error);
  }

  async function rasterizeToPng(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      const image = new Image();
      image.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Unsupported image format"));
      });
      bitmap = image;
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }
}

function textBytes(text) { return new TextEncoder().encode(text); }
function concat(...parts) { const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length; }); return result; }
function xmlEscape(value) { return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character])); }
function xmpMetadata() {
  const exported = new Date().toISOString();
  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="exceldataset">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" ` +
    `xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:cf="https://exceldataset.com/metadata/1.0/" ` +
    `xmp:CreatorTool="exceldataset" xmp:MetadataDate="${exported}" ` +
    `photoshop:Credit="${xmlEscape("https://exceldataset.com")}">` +
    `<dc:creator><rdf:Seq><rdf:li>SM-6876B</rdf:li></rdf:Seq></dc:creator>` +
    `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© 2026 SM-6876B</rdf:li></rdf:Alt></dc:rights>` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">img272726</rdf:li></rdf:Alt></dc:description>` +
    `<photoshop:Instructions>Contact: hello@exceldataset.com</photoshop:Instructions>` +
    `<cf:CameraModel>sm-7647</cf:CameraModel><cf:Device>SM-35378U</cf:Device>` +
    `<cf:Serial>SN7776e8r</cf:Serial><cf:GPSStatus>none</cf:GPSStatus><cf:Synthetic>false</cf:Synthetic>` +
    `</rdf:Description>` +
    `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}
function jpegApp1(data) { return concat(new Uint8Array([0xff, 0xe1, (data.length + 2) >> 8, (data.length + 2) & 255]), data); }
function pngChunk(type, data) { const name = textBytes(type); return concat(u32be(data.length), name, data, u32be(crc32(concat(name, data)))); }
function pngText(keyword, value) {
  // iTXt layout: keyword, compression flag/method, language tag, translated keyword, text.
  return pngChunk("iTXt", concat(
    textBytes(keyword),
    new Uint8Array([0, 0, 0, 0, 0]),
    textBytes(value)
  ));
}
function u32be(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
function u32le(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function read32be(a, i) { return (a[i] << 24) | (a[i + 1] << 16) | (a[i + 2] << 8) | a[i + 3]; }
function read32le(a, i) { return (a[i] | (a[i + 1] << 8) | (a[i + 2] << 16) | (a[i + 3] << 24)) >>> 0; }

function cleanJpeg(bytes) {
  const kept = [bytes.slice(0, 2), jpegApp1(concat(textBytes("http://ns.adobe.com/xap/1.0/\0"), textBytes(xmpMetadata())))];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { kept.push(bytes.slice(i)); break; }
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) { kept.push(bytes.slice(i)); break; }
    const size = (bytes[i + 2] << 8) | bytes[i + 3];
    const remove = marker === 0xfe || (marker >= 0xe0 && marker <= 0xef);
    if (!remove) kept.push(bytes.slice(i, i + 2 + size));
    i += 2 + size;
  }
  return concat(...kept);
}
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
function cleanPng(bytes) {
  const signature = bytes.slice(0, 8); const chunks = [signature]; let i = 8;
  while (i < bytes.length) {
    const length = read32be(bytes, i); const type = String.fromCharCode(...bytes.slice(i + 4, i + 8)); const full = bytes.slice(i, i + 12 + length);
    if (type === "IEND") {
      const fields = [
        ["Author", "SM-6876B"],
        ["Copyright", "© 2026 SM-6876B"],
        ["Source", "https://exceldataset.com"],
        ["Contact", "hello@exceldataset.com"],
        ["Software", "exceldataset"],
        ["Description", "img272726"],
        ["ExportTime", new Date().toISOString()],
        ["CameraModel", "sm-7647"],
        ["Device", "SM-35378U"],
        ["Serial", "SN7776e8r"],
        ["GPSStatus", "none"],
        ["Synthetic", "false"]
      ];
      fields.forEach(([key, value]) => chunks.push(pngText(key, value)));
      chunks.push(full);
      break;
    }
    if (type === "IHDR" || type === "PLTE" || type === "IDAT" || type === "acTL" || type === "fcTL" || type === "fdAT") chunks.push(full);
    i += full.length;
  }
  return concat(...chunks);
}
function cleanWebp(bytes) {
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") throw new Error("Invalid WebP");
  const chunks = [bytes.slice(0, 12)]; let i = 12;
  while (i + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.slice(i, i + 4)); const length = read32le(bytes, i + 4); const data = bytes.slice(i + 8, i + 8 + length);
    if (type !== "EXIF" && type !== "XMP " && type !== "ICCP") chunks.push(bytes.slice(i, i + 8 + length + (length % 2)));
    i += 8 + length + (length % 2);
  }
  const xmp = textBytes(xmpMetadata());
  chunks.push(concat(textBytes("XMP "), u32le(xmp.length), xmp, xmp.length % 2 ? new Uint8Array([0]) : new Uint8Array()));
  const body = concat(...chunks.slice(1)); return concat(textBytes("RIFF"), u32le(body.length + 4), textBytes("WEBP"), body);
}
function formatBytes(bytes) { return `${(bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 ? 2 : 1)} MB`; }
function download() { const link = document.createElement("a"); link.href = output.url; link.download = output.name; link.click(); }
function reset() { if (output.url) URL.revokeObjectURL(output.url); result.classList.add("hidden"); dropzone.classList.remove("hidden"); input.value = ""; clearError(); }
function showError(message) { errorBox.textContent = message; errorBox.classList.remove("hidden"); }
function clearError() { errorBox.classList.add("hidden"); errorBox.textContent = ""; }
