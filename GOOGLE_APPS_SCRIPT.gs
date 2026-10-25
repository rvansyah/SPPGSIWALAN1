/**
 * SPPG SIWALAN 1 - GOOGLE APPS SCRIPT BRIDGE
 *
 * FUNGSI:
 * 1. Membaca stok, transaksi, dan penerima dari Google Sheets agar bisa dibaca aplikasi.
 * 2. Menerima data dari aplikasi saat tombol "Simpan ke Google" ditekan.
 * 3. Mendukung JSONP untuk sinkronisasi otomatis aplikasi (sekitar 15 detik).
 * 4. Tidak menggunakan jenis transaksi "Penyesuaian".
 *
 * CARA PAKAI:
 * - Tempel seluruh kode ini ke Extensions > Apps Script pada spreadsheet.
 * - Deploy > New deployment > Web app.
 * - Execute as: Me
 * - Who has access: Anyone
 * - Salin URL /exec ke menu Google Sheets pada aplikasi.
 */

const SPREADSHEET_ID = '1-ecvesKTdRA5rKZPs5WRxWb2oxARiOIXdoBHQiQMK_4';
const SHEET_BAHAN = 'BAHAN_BAKU';
const SHEET_TRANSAKSI = 'TRANSAKSI';
const SHEET_PENERIMA = 'PENERIMA';
const SHEET_APP_STATE = 'APP_STATE';

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const state = readStateFromTables_();
    const payload = {
      ok: true,
      state: state,
      hasData: {
        items: state.items.length > 0,
        transactions: state.transactions.length > 0,
        beneficiaries: state.beneficiaries.length > 0
      },
      updatedAt: new Date().toISOString()
    };

    const json = JSON.stringify(payload);

    // Aplikasi menggunakan JSONP supaya pembacaan Google Sheets tidak terkena CORS.
    if (params.callback) {
      const safeCallback = String(params.callback).replace(/[^a-zA-Z0-9_.$]/g, '');
      return ContentService
        .createTextOutput(safeCallback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (body.action !== 'save' || !body.state) {
      throw new Error('Payload tidak valid. Aplikasi harus mengirim action=save dan state.');
    }

    // Pastikan hanya transaksi Masuk/Keluar yang disimpan.
    const state = sanitizeState_(body.state);
    writeState_(state);

    return jsonResponse_({
      ok: true,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err)
    });
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSS_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateSheet_(name) {
  const ss = getSS_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readRows_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 1) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function text_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function cleanDate_(v) {
  const s = text_(v);
  return s ? s.substring(0, 10) : '';
}

function nextNumber_(ids) {
  let max = 0;
  (ids || []).forEach(function(id) {
    const m = String(id || '').match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  });
  return max + 1;
}

/**
 * Baca langsung dari tabel Google Sheets.
 * Ini membuat Google Sheets menjadi sumber stok utama.
 * Jadi perubahan manual pada tab BAHAN_BAKU akan terbaca aplikasi pada
 * sinkronisasi berikutnya.
 */
function readStateFromTables_() {
  const items = readRows_(SHEET_BAHAN).map(function(r) {
    return {
      id: text_(r[0]),
      name: text_(r[1]),
      category: text_(r[2]) || 'Lainnya',
      unit: text_(r[3]) || 'pcs',
      price: num_(r[4]),
      opening: num_(r[5]),
      stock: num_(r[6]),
      min: num_(r[7]),
      note: text_(r[8])
    };
  }).filter(function(x) { return x.id && x.name; });

  const transactions = readRows_(SHEET_TRANSAKSI).map(function(r) {
    const type = text_(r[3]);
    return {
      id: text_(r[0]),
      date: cleanDate_(r[1]),
      itemId: text_(r[2]),
      type: type === 'Keluar' ? 'Keluar' : 'Masuk',
      qty: num_(r[4]),
      price: num_(r[5]),
      before: num_(r[6]),
      after: num_(r[7]),
      note: text_(r[8])
    };
  }).filter(function(x) {
    return x.id && (x.type === 'Masuk' || x.type === 'Keluar');
  });

  const beneficiaries = readRows_(SHEET_PENERIMA).map(function(r) {
    return {
      id: text_(r[0]),
      name: text_(r[1]),
      identity: text_(r[2]),
      school: text_(r[3]),
      grade: text_(r[4]),
      portion: text_(r[5]),
      date: cleanDate_(r[6]),
      note: text_(r[7])
    };
  }).filter(function(x) { return x.id; });

  return {
    items: items,
    transactions: transactions,
    beneficiaries: beneficiaries,
    nextItem: nextNumber_(items.map(function(x) { return x.id; })),
    nextTx: nextNumber_(transactions.map(function(x) { return x.id; })),
    nextBeneficiary: nextNumber_(beneficiaries.map(function(x) { return x.id; }))
  };
}

/**
 * Bersihkan data yang dikirim aplikasi sebelum ditulis ke spreadsheet.
 * Penyesuaian dihapus agar tidak masuk lagi ke data transaksi.
 */
function sanitizeState_(state) {
  const out = state || {};

  out.items = Array.isArray(out.items) ? out.items : [];
  out.transactions = Array.isArray(out.transactions) ? out.transactions : [];
  out.beneficiaries = Array.isArray(out.beneficiaries) ? out.beneficiaries : [];

  out.transactions = out.transactions.filter(function(t) {
    return t && (t.type === 'Masuk' || t.type === 'Keluar');
  }).map(function(t) {
    return {
      id: text_(t.id),
      date: cleanDate_(t.date),
      itemId: text_(t.itemId),
      type: t.type === 'Keluar' ? 'Keluar' : 'Masuk',
      qty: num_(t.qty),
      price: num_(t.price),
      before: num_(t.before),
      after: num_(t.after),
      note: text_(t.note)
    };
  }).filter(function(t) { return t.id; });

  return out;
}

function writeState_(state) {
  const ss = getSS_();
  const app = getOrCreateSheet_(SHEET_APP_STATE);
  const bahan = getOrCreateSheet_(SHEET_BAHAN);
  const transaksi = getOrCreateSheet_(SHEET_TRANSAKSI);
  const penerima = getOrCreateSheet_(SHEET_PENERIMA);

  // APP_STATE = backup seluruh state aplikasi.
  app.clearContents();
  app.getRange(1, 1, 1, 2).setValues([['UPDATED_AT', 'STATE_JSON']]);
  app.getRange(2, 1, 1, 2).setValues([[new Date(), JSON.stringify(state)]]);

  writeTable_(bahan,
    ['ID','Nama Bahan','Kategori','Satuan','Harga Satuan','Stok Awal','Stok','Minimum','Keterangan'],
    (state.items || []).map(function(x) {
      return [
        text_(x.id), text_(x.name), text_(x.category) || 'Lainnya', text_(x.unit) || 'pcs',
        num_(x.price), num_(x.opening), num_(x.stock), num_(x.min), text_(x.note)
      ];
    })
  );

  writeTable_(transaksi,
    ['ID','Tanggal','Kode Bahan','Jenis','Jumlah','Harga Satuan','Stok Sebelum','Stok Akhir','Keterangan'],
    (state.transactions || [])
      .filter(function(x) { return x.type === 'Masuk' || x.type === 'Keluar'; })
      .map(function(x) {
        return [
          text_(x.id), cleanDate_(x.date), text_(x.itemId), x.type === 'Keluar' ? 'Keluar' : 'Masuk',
          num_(x.qty), num_(x.price), num_(x.before), num_(x.after), text_(x.note)
        ];
      })
  );

  writeTable_(penerima,
    ['ID','Nama','NIK/ID','Sekolah/Kelompok','Kelas/Umur','Porsi','Tanggal','Keterangan'],
    (state.beneficiaries || []).map(function(x) {
      return [
        text_(x.id), text_(x.name), text_(x.identity), text_(x.school), text_(x.grade),
        text_(x.portion), cleanDate_(x.date), text_(x.note)
      ];
    })
  );

  [app, bahan, transaksi, penerima].forEach(function(sh) {
    sh.setFrozenRows(1);
    if (sh.getLastColumn() > 0) {
      sh.autoResizeColumns(1, sh.getLastColumn());
    }
  });
}

function writeTable_(sh, headers, rows) {
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

/**
 * Jalankan sekali secara manual bila ingin membuat tab kosong dengan header.
 * Tidak wajib jika aplikasi sudah pernah melakukan Simpan ke Google.
 */
function setupSheets() {
  const state = readStateFromTables_();
  writeState_(state);
  Logger.log('Tab Google Sheets siap digunakan.');
}
