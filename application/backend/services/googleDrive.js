import { google } from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const uploadsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

export const hasDriveOAuthConfig = () => {
  const values = [
    process.env.GOOGLE_DRIVE_FOLDER_ID,
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REFRESH_TOKEN
  ];
  return values.every((value) => value?.trim() && !/^your_|placeholder|_here$/i.test(value.trim()));
};

export const getDriveClient = () => {
  if (!hasDriveOAuthConfig()) return null;
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
};

export const uploadFileToDrive = async (file, applicantName = 'Applicant', fieldName = 'document') => {
  if (!file) return null;
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive is not configured. Contact the site administrator.');
  const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const originalName = file.originalname || 'document';
  const uniqueName = `${safe(applicantName)}_${safe(fieldName)}_${Date.now()}_${crypto.randomUUID()}_${safe(path.basename(originalName))}`;
  const response = await drive.files.create({
    requestBody: { name: uniqueName, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] },
    media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
    fields: 'id,name,size,mimeType',
    supportsAllDrives: true
  });
  if (!response.data.id) throw new Error('Google Drive did not return a file ID.');
  return {
    fileId: response.data.id,
    fileName: response.data.name || uniqueName,
    originalName,
    mimeType: response.data.mimeType || file.mimetype,
    size: Number(response.data.size || file.size),
    storageType: 'gdrive'
  };
};

export const streamFileFromDrive = async (fileId) => {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive is not configured.');
  const [metadata, download] = await Promise.all([
    drive.files.get({ fileId, fields: 'id,name,mimeType,size', supportsAllDrives: true }),
    drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' })
  ]);
  return { metadata: metadata.data, stream: download.data };
};

// Legacy files from the former local fallback remain accessible only through the authenticated admin route.
export const streamLegacyLocalFile = (fileName) => {
  const safeName = path.basename(fileName || '');
  if (!safeName || safeName !== fileName) throw new Error('Document not found.');
  const filePath = path.join(uploadsDirectory, safeName);
  if (!fs.existsSync(filePath)) throw new Error('Document not found.');
  return fs.createReadStream(filePath);
};
