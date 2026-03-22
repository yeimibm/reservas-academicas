import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

const supportedTypes = new Set(['png', 'jpg', 'jpeg', 'pdf']);

export function getUploadRoot() {
  return env.UPLOAD_ROOT;
}

export function resolveUploadPath(relativePath: string) {
  return path.join(getUploadRoot(), relativePath);
}

export function getContentTypeFromExtension(extension: string) {
  switch (extension.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

export function extractSupportedExtension(input: string) {
  const extension = input.split('.').pop()?.toLowerCase() ?? '';
  if (!supportedTypes.has(extension)) {
    throw new Error('Tipo de archivo no permitido');
  }

  return extension;
}

export async function saveReceiptUpload(file: File) {
  const extension = extractSupportedExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const now = new Date();
  const relativeDir = path.join(
    'payment-receipts',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0')
  );
  const filename = `${randomUUID()}.${extension}`;
  const relativePath = path.join(relativeDir, filename);
  const absoluteDir = resolveUploadPath(relativeDir);
  const absolutePath = resolveUploadPath(relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    fileType: extension,
    relativePath,
    publicUrl: `/uploads/${relativePath.replace(/\\/g, '/')}`
  };
}

export async function readStoredUpload(relativePath: string) {
  const absolutePath = resolveUploadPath(relativePath);
  await stat(absolutePath);
  return readFile(absolutePath);
}
