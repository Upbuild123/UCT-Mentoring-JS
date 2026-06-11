const { google } = require('googleapis');
const fs = require('fs');

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

async function getDrive() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

async function findFolder(drive, name, parentId) {
  const query = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
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

async function shareFolder(drive, folderId, email) {
  await drive.permissions.create({
    fileId: folderId,
    requestBody: { type: 'user', role: 'writer', emailAddress: email },
    supportsAllDrives: true,
    sendNotificationEmail: false,
  });
}

const MENTOR_EMAILS = [
  'gina@upbuild.com',
  'michael@upbuild.com',
  'tzipi@upbuild.com',
  'mary@upbuild.com',
  'vipin@upbuild.com',
  'melissa@upbuild.com',
];

async function createStudentRoundFolder(studentName, round, studentEmail = '') {
  const drive = await getDrive();
  const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  let studentFolderId = await findFolder(drive, studentName, parentId);
  const isNew = !studentFolderId;
  if (isNew) {
    studentFolderId = await createFolder(drive, studentName, parentId);
  }

  if (isNew && studentEmail) {
    await shareFolder(drive, studentFolderId, studentEmail);
  }

  if (isNew) {
    for (const email of MENTOR_EMAILS) {
      await shareFolder(drive, studentFolderId, email);
    }
  }

  const roundFolderId = await createFolder(drive, `Round ${round}`, studentFolderId);
  const folderUrl = await getWebLink(drive, roundFolderId);
  return { folderId: roundFolderId, folderUrl };
}

async function uploadFile(localPath, folderId, driveFileName) {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: driveFileName,
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
      name: driveFileName,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id',
    supportsAllDrives: true,
  });
  return getWebLink(drive, res.data.id);
}

module.exports = { createStudentRoundFolder, uploadFile, uploadBuffer };
