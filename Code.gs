/**
 * WildRoad v2.1 - Google Apps Script Backend
 * Bidirectional Sync + Google Drive Photo Upload
 *
 * INSTRUKCJA:
 * 1. Otwórz swój Google Sheet
 * 2. Extensions → Apps Script
 * 3. Skasuj cały istniejący kod i wklej TEN plik
 * 4. Kliknij "Deploy" → "New deployment"
 * 5. Type: "Web app"
 * 6. Execute as: "Me"
 * 7. Who has access: "Anyone"
 * 8. Kliknij "Deploy" → skopiuj NOWY URL
 * 9. Wklej nowy URL w ustawieniach aplikacji WildRoad
 *
 * WAŻNE: Każda zmiana kodu wymaga NOWEGO deploymentu!
 * (Deploy → Manage deployments → ołówek → New version → Deploy)
 *
 * UPRAWNIENIA: Przy pierwszym deployu Google poprosi o dostęp do:
 * - Google Sheets (odczyt/zapis arkusza)
 * - Google Drive (tworzenie folderu i upload zdjęć)
 * Kliknij "Zezwól" / "Allow"
 */

// ===== KONFIGURACJA =====
const SHEET_ID = '';  // zostaw puste jeśli skrypt jest w arkuszu
const DRIVE_FOLDER_NAME = 'WildRoad Zdjęcia';

const SHEET_NAME = 'Zdarzenia';
const HEADER_ROW = 1;
const COL_ID = 1;
const COL_LAST_MODIFIED = 20;
const COL_COUNT = 21;

// ===== HELPERS =====

function getSpreadsheet() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'ID', 'Data', 'Godzina', 'Grupa', 'Droga', 'KM', 'Strona', 'Gatunek',
      'Osoba', 'GPS Raw', 'Lat', 'Lng', 'Lat DMS', 'Lng DMS', 'Photo Name',
      'Godzina Działania', 'Virtual Col', 'Step', 'Month Index', 'Last Modified', 'Synced'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

// ===== GOOGLE DRIVE PHOTO MANAGEMENT =====

/**
 * Pobiera lub tworzy główny folder WildRoad na Google Drive
 */
function getDriveFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/**
 * Pobiera lub tworzy podfolder na dany miesiąc (np. "2026-03")
 */
function getMonthFolder(yearMonth) {
  const parent = getDriveFolder();
  const subs = parent.getFoldersByName(yearMonth);
  if (subs.hasNext()) return subs.next();
  return parent.createFolder(yearMonth);
}

/**
 * Zapisuje zdjęcie na Google Drive
 * @param {string} base64Data - dane zdjęcia w formacie data:image/jpeg;base64,...
 * @param {string} fileName - nazwa pliku np. "27032026_DK62_55+300_P_Kot.jpg"
 * @param {string} yearMonth - miesiąc do podfolderu np. "2026-03"
 * @returns {object} {fileId, fileUrl, thumbnailUrl}
 */
function uploadPhoto(base64Data, fileName, yearMonth) {
  // Wyciągnij czyste base64 z data URL
  var raw = base64Data;
  if (raw.indexOf(',') > -1) {
    raw = raw.split(',')[1];
  }

  // Dekoduj base64 → blob
  var decoded = Utilities.base64Decode(raw);
  var blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);

  // Zapisz w odpowiednim folderze
  var folder = getMonthFolder(yearMonth || 'inne');

  // Sprawdź czy plik już istnieje (nadpisz)
  var existing = folder.getFilesByName(fileName);
  if (existing.hasNext()) {
    var oldFile = existing.next();
    oldFile.setTrashed(true); // usuń stary
  }

  var file = folder.createFile(blob);

  // Ustaw publiczny dostęp do odczytu (żeby thumbnail działał)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = file.getId();
  return {
    fileId: fileId,
    fileUrl: 'https://drive.google.com/file/d/' + fileId + '/view',
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400'
  };
}

/**
 * Usuwa zdjęcie z Google Drive po ID
 */
function deletePhoto(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.toString() };
  }
}

// ===== HTTP HANDLERS =====

function doGet(e) {
  var params = e ? e.parameter : {};
  var action = params.action || 'ping';
  var result;

  try {
    switch (action) {
      case 'ping':
        var sheet = getSheet();
        var folder = getDriveFolder();
        result = {
          ok: true,
          msg: 'WildRoad API v2.1',
          ts: Date.now(),
          sheetName: sheet.getName(),
          rowCount: Math.max(0, sheet.getLastRow() - HEADER_ROW),
          driveFolder: folder.getName(),
          driveFolderUrl: folder.getUrl()
        };
        break;

      case 'fetchAll':
        result = fetchAllRecords();
        break;

      case 'fetchSince':
        var since = parseInt(params.since || '0');
        result = fetchRecordsSince(since);
        break;

      default:
        result = { ok: false, error: 'Unknown GET action: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;
  try {
    var raw = e.postData.contents;
    var body = JSON.parse(raw);
    var action = body.action;

    switch (action) {
      case 'insert':
        result = insertRow(body.row);
        break;

      case 'update':
        result = updateRow(body.id, body.row);
        break;

      case 'sync':
        result = fullSync(body.records || []);
        break;

      case 'delete':
        result = deleteRow(body.id);
        break;

      case 'uploadPhoto':
        // Upload zdjęcia na Google Drive
        var photoResult = uploadPhoto(body.photoData, body.fileName, body.yearMonth);
        // Aktualizuj wiersz w arkuszu z linkiem do zdjęcia
        if (body.eventId) {
          updatePhotoLink(body.eventId, photoResult.fileUrl, photoResult.thumbnailUrl, photoResult.fileId);
        }
        result = { ok: true, action: 'photoUploaded', ...photoResult };
        break;

      case 'deletePhoto':
        result = deletePhoto(body.fileId);
        break;

      case 'ping':
        result = { ok: true, msg: 'POST ping OK', ts: Date.now() };
        break;

      default:
        result = { ok: false, error: 'Unknown POST action: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== CRUD =====

function fetchAllRecords() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return { ok: true, records: [], count: 0 };

  var numRows = lastRow - HEADER_ROW;
  var data = sheet.getRange(HEADER_ROW + 1, 1, numRows, COL_COUNT).getValues();
  var records = [];
  for (var i = 0; i < data.length; i++) {
    var obj = rowToObj(data[i]);
    if (obj.id) records.push(obj);
  }
  return { ok: true, records: records, count: records.length };
}

function fetchRecordsSince(since) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return { ok: true, records: [], count: 0 };

  var numRows = lastRow - HEADER_ROW;
  var data = sheet.getRange(HEADER_ROW + 1, 1, numRows, COL_COUNT).getValues();
  var records = [];
  for (var i = 0; i < data.length; i++) {
    var obj = rowToObj(data[i]);
    if (obj.id && obj.lastModified > since) records.push(obj);
  }
  return { ok: true, records: records, count: records.length };
}

function insertRow(rowData) {
  var sheet = getSheet();
  rowData[COL_LAST_MODIFIED - 1] = Date.now();
  rowData[COL_COUNT - 1] = 'yes';
  sheet.appendRow(rowData);
  return { ok: true, action: 'inserted', id: rowData[0] };
}

function updateRow(id, rowData) {
  var sheet = getSheet();
  var rowIdx = findRowById(sheet, id);

  rowData[COL_LAST_MODIFIED - 1] = Date.now();
  rowData[COL_COUNT - 1] = 'yes';

  if (rowIdx === -1) {
    sheet.appendRow(rowData);
    return { ok: true, action: 'inserted_new', id: id };
  }

  sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
  return { ok: true, action: 'updated', id: id };
}

function deleteRow(id) {
  var sheet = getSheet();
  var rowIdx = findRowById(sheet, id);
  if (rowIdx === -1) return { ok: false, error: 'Not found: ' + id };
  sheet.deleteRow(rowIdx);
  return { ok: true, action: 'deleted', id: id };
}

/**
 * Aktualizuje link do zdjęcia w wierszu arkusza
 * Dodaje kolumny Photo URL i Thumbnail URL (22, 23) jeśli nie istnieją
 */
function updatePhotoLink(eventId, fileUrl, thumbnailUrl, fileId) {
  var sheet = getSheet();

  // Sprawdź/dodaj kolumny na linki do zdjęć
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colPhotoUrl = headers.indexOf('Photo URL') + 1;
  var colThumbUrl = headers.indexOf('Thumbnail URL') + 1;
  var colFileId = headers.indexOf('Drive File ID') + 1;

  if (colPhotoUrl === 0) {
    colPhotoUrl = sheet.getLastColumn() + 1;
    sheet.getRange(1, colPhotoUrl).setValue('Photo URL').setFontWeight('bold');
  }
  if (colThumbUrl === 0) {
    colThumbUrl = sheet.getLastColumn() + 1;
    sheet.getRange(1, colThumbUrl).setValue('Thumbnail URL').setFontWeight('bold');
  }
  if (colFileId === 0) {
    colFileId = sheet.getLastColumn() + 1;
    sheet.getRange(1, colFileId).setValue('Drive File ID').setFontWeight('bold');
  }

  var rowIdx = findRowById(sheet, eventId);
  if (rowIdx === -1) return;

  sheet.getRange(rowIdx, colPhotoUrl).setValue(fileUrl);
  sheet.getRange(rowIdx, colThumbUrl).setValue(thumbnailUrl);
  sheet.getRange(rowIdx, colFileId).setValue(fileId);
}

// ===== BIDIRECTIONAL SYNC =====

function fullSync(localRecords) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();

  var sheetMap = {};
  if (lastRow > HEADER_ROW) {
    var numRows = lastRow - HEADER_ROW;
    var data = sheet.getRange(HEADER_ROW + 1, 1, numRows, COL_COUNT).getValues();
    for (var i = 0; i < data.length; i++) {
      var obj = rowToObj(data[i]);
      if (obj.id) {
        sheetMap[obj.id] = { obj: obj, rowIdx: i + HEADER_ROW + 1 };
      }
    }
  }

  var localMap = {};
  for (var i = 0; i < localRecords.length; i++) {
    localMap[localRecords[i].id] = localRecords[i];
  }

  var toUpdateClient = [];
  var toWriteSheet = [];

  for (var i = 0; i < localRecords.length; i++) {
    var lr = localRecords[i];
    var sheetEntry = sheetMap[lr.id];

    if (!sheetEntry) {
      var row = objToRow(lr);
      row[COL_LAST_MODIFIED - 1] = lr.lastModified || Date.now();
      row[COL_COUNT - 1] = 'yes';
      toWriteSheet.push({ act: 'append', row: row });
    } else {
      var localMod = lr.lastModified || 0;
      var sheetMod = sheetEntry.obj.lastModified || 0;

      if (localMod > sheetMod) {
        var row2 = objToRow(lr);
        row2[COL_LAST_MODIFIED - 1] = localMod;
        row2[COL_COUNT - 1] = 'yes';
        toWriteSheet.push({ act: 'update', rowIdx: sheetEntry.rowIdx, row: row2 });
      } else if (sheetMod > localMod) {
        toUpdateClient.push(sheetEntry.obj);
      }
    }
  }

  for (var id in sheetMap) {
    if (!localMap[id]) {
      toUpdateClient.push(sheetMap[id].obj);
    }
  }

  for (var i = 0; i < toWriteSheet.length; i++) {
    var tw = toWriteSheet[i];
    if (tw.act === 'append') {
      sheet.appendRow(tw.row);
    } else if (tw.act === 'update') {
      sheet.getRange(tw.rowIdx, 1, 1, tw.row.length).setValues([tw.row]);
    }
  }

  return {
    ok: true,
    action: 'synced',
    updatedOnSheet: toWriteSheet.length,
    toUpdateClient: toUpdateClient,
    syncTimestamp: Date.now()
  };
}

// ===== UTILITIES =====

function findRowById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW) return -1;
  var ids = sheet.getRange(HEADER_ROW + 1, COL_ID, lastRow - HEADER_ROW, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + HEADER_ROW + 1;
  }
  return -1;
}

function formatDateYMD(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    var y = parsed.getFullYear();
    var m = ('0' + (parsed.getMonth() + 1)).slice(-2);
    var d = ('0' + parsed.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  return s;
}

function rowToObj(row) {
  return {
    id: String(row[0] || ''),
    dataSgloszen: formatDateYMD(row[1]),
    godzinaSgloszen: String(row[2] || ''),
    grupa: String(row[3] || ''),
    droga: String(row[4] || ''),
    km: String(row[5] || ''),
    strona: String(row[6] || ''),
    gatunek: String(row[7] || ''),
    osoba: String(row[8] || ''),
    gpsRaw: row[9] ? String(row[9]) : null,
    lat: row[10] ? Number(row[10]) : null,
    lng: row[11] ? Number(row[11]) : null,
    latDMS: String(row[12] || ''),
    lngDMS: String(row[13] || ''),
    photoName: row[14] ? String(row[14]) : null,
    godzinaDzialania: row[15] ? String(row[15]) : null,
    virtualCol: String(row[16] || ''),
    step: parseInt(row[17]) || 1,
    monthIndex: parseInt(row[18]) || 1,
    lastModified: parseInt(row[19]) || 0,
    synced: String(row[20] || '')
  };
}

function objToRow(obj) {
  return [
    obj.id || '',
    obj.dataSgloszen || '',
    obj.godzinaSgloszen || '',
    obj.grupa || '',
    obj.droga || '',
    obj.km || '',
    obj.strona || '',
    obj.gatunek || '',
    obj.osoba || '',
    obj.gpsRaw || '',
    obj.lat || '',
    obj.lng || '',
    obj.latDMS || '',
    obj.lngDMS || '',
    obj.photoName || '',
    obj.godzinaDzialania || '',
    obj.virtualCol || '',
    obj.step || 1,
    obj.monthIndex || 1,
    obj.lastModified || Date.now(),
    'yes'
  ];
}

// ===== TEST (uruchom ręcznie w edytorze) =====
function testSetup() {
  var sheet = getSheet();
  var folder = getDriveFolder();
  Logger.log('Sheet: ' + sheet.getName() + ' (' + sheet.getLastRow() + ' rows)');
  Logger.log('Drive folder: ' + folder.getName() + ' → ' + folder.getUrl());
  Logger.log('Setup OK!');
}
