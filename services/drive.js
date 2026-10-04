const { google } = require('googleapis');
const fs = require('fs');

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
    // Service accounts have no storage of their own, so act as a real Workspace user
    // (requires domain-wide delegation for the Drive scope)
    clientOptions: process.env.GOOGLE_IMPERSONATE_USER
      ? { subject: process.env.GOOGLE_IMPERSONATE_USER }
      : undefined,
  });
}

async function getDrive() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

function escapeQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(drive, name, parentId) {
  const query = `name = '${escapeQuery(name)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return res.data.id;
}

async function getWebLink(drive, fileId) {
  const res = await drive.files.get({
    fileId,
    fields: 'webViewLink',
    supportsAllDrives: true,
  });
  return res.data.webViewLink;
}

async function findOrCreateFolder(drive, name, parentId) {
  return (await findFolder(drive, name, parentId)) || createFolder(drive, name, parentId);
}

// Files go straight into <parent>/<Student Name>/Mentoring/ (file names carry the round).
// Student folders are created and shared by hand ahead of the course, so a missing one is an error.
async function getStudentMentoringFolder(studentName) {
  const drive = await getDrive();
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  const mentoringName = process.env.GOOGLE_DRIVE_MENTORING_SUBFOLDER || 'Mentoring';

  const studentFolderId = await findFolder(drive, studentName.trim(), parentId);
  if (!studentFolderId) {
    throw new Error(`No Google Drive folder named "${studentName}" in the student folders. Create it (or fix the name) and click Retry.`);
  }

  const folderId = await findOrCreateFolder(drive, mentoringName, studentFolderId);
  const folderUrl = await getWebLink(drive, folderId);
  return { folderId, folderUrl };
}

async function listFolderFiles(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, createdTime)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

function splitExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

// "X. Recording.mp4" plus its resubmitted versions "X. Recording v2.mp4", "v3", ...
function isVersionOf(fileName, driveFileName) {
  if (fileName === driveFileName) return true;
  const [stem, ext] = splitExt(driveFileName);
  return fileName.startsWith(`${stem} v`) && fileName.endsWith(ext)
    && /^\d+$/.test(fileName.slice(stem.length + 2, fileName.length - ext.length));
}

// Never overwrite: a resubmitted round is saved alongside the original as "... v2", "... v3"
async function nextVersionName(drive, folderId, driveFileName) {
  const existing = new Set((await listFolderFiles(drive, folderId)).map(f => f.name));
  if (!existing.has(driveFileName)) return driveFileName;
  const [stem, ext] = splitExt(driveFileName);
  let n = 2;
  while (existing.has(`${stem} v${n}${ext}`)) n++;
  return `${stem} v${n}${ext}`;
}

// True if this file (any version) was already uploaded after `since`, i.e. by the current submission
async function uploadedSince(folderId, driveFileName, since) {
  const drive = await getDrive();
  const sinceMs = new Date(since).getTime();
  return (await listFolderFiles(drive, folderId))
    .some(f => isVersionOf(f.name, driveFileName) && new Date(f.createdTime).getTime() >= sinceMs);
}

async function uploadFile(localPath, folderId, driveFileName) {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: await nextVersionName(drive, folderId, driveFileName),
      parents: [folderId],
    },
    media: {
      body: fs.createReadStream(localPath),
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  return getWebLink(drive, res.data.id);
}

async function uploadBuffer(buffer, folderId, driveFileName, mimeType) {
  const drive = await getDrive();
  const { Readable } = require('stream');
  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: await nextVersionName(drive, folderId, driveFileName),
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id',
    supportsAllDrives: true,
  });
  return getWebLink(drive, res.data.id);
}

module.exports = { getStudentMentoringFolder, uploadedSince, uploadFile, uploadBuffer };
