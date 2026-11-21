// csv-reader-speed-01: a fast drop-in for csv-reader 1.0.0.
//
// Written from the RULES.txt description of csv-reader's reading policy (and
// checked case by case against the reference), in my own structure: one pass
// over the text, fields cut out with indexOf/slice instead of one character
// at a time, quoted fields found with indexOf on their closing quote.
//
// Semantics (csv-reader 1.0.0): a U+FEFF at the very start is dropped; a
// record ends at LF or CRLF; a line left with no characters is no record;
// outside quotes a CR not followed by LF is dropped (stray_cr); a field that
// opens with a quote runs to the next quote that is not doubled ("" is one
// quote, CRLF/lone CR inside is read as LF); what follows its closing quote
// up to the next comma or line break is appended as it stands (quote_junk,
// when the field ends); a quote that never closes is a literal character and
// the text after it is read again as unquoted (unterminated_quote); a quote
// inside an unquoted field is literal; fields stay strings; columns is the
// first record when header is true, else null; rows are the records after it,
// each padded with "" (short_row, fields: its count) or cut (long_row, extra:
// the cut fields) to the first record's width; each error is {code, line,
// row}, in the order met, line the 1-based line its record starts on, row its
// record's index in rows (null for the header).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Field-result out-params: fEnded carries how the field ended, fValue the
// value of a quoted field (unquoted fields return their value directly).
let fValue;
let fEnded;

/** csv-reader 1.0.0's answer for one case's input: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted field starting at `start`, onto `init` (the value built
  // so far: '' for a plain field, '"' for an unterminated quote's re-read, the
  // quoted value for the characters after a closing quote). Returns the field
  // value and sets fEnded to how it ended. The field ends at the first comma
  // or line break at or after `start`; a CR not followed by LF inside it is
  // dropped (stray_cr) and the field goes on. The characters this read kept
  // are the returned value's length minus init's length.
  function readUnquoted(init, start) {
    const cIdx = text.indexOf(',', start);
    const nIdx = text.indexOf('\n', start);
    let m; // where the field ends
    let ended;
    if (cIdx === -1) {
      if (nIdx === -1) {
        m = len;
        ended = END;
      } else {
        m = nIdx;
        ended = LINE_BREAK;
      }
    } else if (nIdx === -1 || cIdx < nIdx) {
      m = cIdx;
      ended = COMMA;
    } else {
      m = nIdx;
      ended = LINE_BREAK;
    }
    let seg = text.slice(start, m);
    if (ended === LINE_BREAK) {
      line += 1;
      pos = m + 1;
      // A CR right before the LF is the CRLF line break, not field content.
      if (seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1);
    } else if (ended === COMMA) {
      pos = m + 1;
    } else {
      pos = len;
    }
    const r = seg.indexOf('\r');
    if (r === -1) {
      fEnded = ended;
      return seg.length === 0 ? init : init + seg;
    }
    // Stray CR(s) inside the field: one error each, dropped from the value.
    let count = 0;
    for (let i = r; i !== -1; i = seg.indexOf('\r', i + 1)) count++;
    for (let i = 0; i < count; i++) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    const clean = seg.replace(/\r/g, '');
    fEnded = ended;
    return clean.length === 0 ? init : init + clean;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let q = pos + 1;
    let doubled = false;
    let close = -1;
    for (;;) {
      const idx = text.indexOf('"', q);
      if (idx === -1) break;
      if (text.charCodeAt(idx + 1) === 34) {
        doubled = true;
        q = idx + 2;
        continue;
      }
      close = idx;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      fValue = readUnquoted('"', open + 1);
      return;
    }
    const raw = text.slice(open + 1, close);
    let value;
    if (!doubled) {
      const nl = raw.indexOf('\n');
      const cr = raw.indexOf('\r');
      if (nl === -1 && cr === -1) {
        value = raw;
      } else {
        // Each CRLF or lone CR inside quotes is one LF, and counts one line.
        value = raw.replace(/\r\n|\r|\n/g, () => {
          line += 1;
          return '\n';
        });
      }
    } else if (raw.indexOf('\r') === -1 && raw.indexOf('\n') === -1) {
      value = raw.replace(/""/g, '"');
    } else {
      value = raw.replace(/""|\r\n|\r|\n/g, (m) => {
        if (m === '""') return '"';
        line += 1;
        return '\n';
      });
    }
    pos = close + 1;
    fValue = value;
    if (pos >= len) {
      fEnded = END;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnded = LINE_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = LINE_BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = readUnquoted(value, pos);
    if (junk.length > value.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    fValue = junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        readQuoted();
        fields.push(fValue);
      } else {
        fields.push(readUnquoted('', pos));
      }
      ended = fEnded;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
