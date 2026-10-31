/* =====================================================================
   MangaFlow Reader - pdfmaker.js   (a tiny PDF writer, no libraries needed)
   ---------------------------------------------------------------------
   WHY THIS FILE EXISTS
   The "Download all chapters" button must make ONE PDF with every page at full quality.
   Most PDF libraries decode each picture and compress it again, which costs quality, time and memory.
   This file does the opposite: it puts the ORIGINAL picture bytes into the PDF untouched.
     - JPEG pictures   -> copied as they are (the PDF format understands JPEG directly)
     - simple PNG      -> the compressed data is copied as it is (the PDF format understands it too)
     - anything else   -> app.js lets the browser decode it, and we store the raw pixels (lossless)
   TWO WAYS TO MAKE PAGES
     1. Normal pages: every picture becomes a page exactly as big as the picture (1 pixel = 1 PDF point).
        A very tall picture is cut into several pages WITHOUT re-encoding it.
     2. LONG-STRIP pages (new in round 6, used by the download button): ALL pictures of one chapter are
        stacked on ONE very tall page, exactly like the reading mode. The pictures are still the original
        bytes, so quality is untouched. Only the PAGE SIZE is written smaller when the chapter is taller than
        14400 units (the limit of Adobe Acrobat): the page then carries a /UserUnit number that tells viewers
        how much bigger to show it. Viewers that ignore /UserUnit simply show the same strip a little smaller;
        nothing is cropped or re-compressed either way.

   HOW IT IS USED (from app.js)
       const pdf = new MangaPDF({ title: 'My Manga' });
       pdf.bookmark('Chapter 1');            // the next page you add gets this bookmark
       await pdf.addJpeg(bytes);             // bytes = Uint8Array of a .jpg file
       await pdf.addPng(bytes);              // throws if the PNG is not a simple one
       await pdf.addRaw(w, h, rgbBytes);     // w*h*3 bytes of red, green, blue
       const blob = pdf.finish();            // a Blob you can download

       // Long-strip way (one page per chapter):
       const strip = pdf.strip({ bg: [255, 255, 255] });   // start a tall page
       await strip.addRaw(w, h, rgb, true);  // true = put it at the very top (used for the title block)
       await strip.addJpeg(bytes);           // pictures are stacked top to bottom in the order you add them
       strip.maxWidth;                       // widest picture so far (use it to size the title/end blocks)
       strip.end();                          // writes the page

   HOW A PDF FILE IS BUILT (for beginners)
   A PDF is a list of numbered "objects" (1 0 obj ... endobj), then a table (xref) that says at which
   byte each object starts, then a "trailer" that says where the table is. We write the objects one
   after another, remember their byte positions, and write the table last.

   WHERE IT IS USED: loaded by index.html before app.js; only app.js section 12 (downloadAll) calls it.

   IMPROVE LATER
     - Add an "image mode" that turns WebP into JPEG 98% to make the file 3x smaller.
     - Add page labels or a cover page.
     - Write straight to disk with the File System Access API so very large PDFs never sit in memory.
   ===================================================================== */
// WHY: Wraps the whole file in a function so its names do not clash with other scripts. HOW: The function runs at once
// and receives 'root' (window or globalThis) at the very bottom. IMPROVE: Use an ES module (import/export) in a modern
// project.
(function (root) {
  // WHY: Strict mode makes JavaScript report silly mistakes (like a misspelled variable) instead of hiding them. HOW: One
  // text line turns it on for this function. IMPROVE: Modules are strict already, so this line goes away if you switch.
  'use strict';

  const enc = new TextEncoder();            // turns text into bytes
  const MAX_PAGE = 14000;                   // most PDF viewers handle pages up to about 14400 units
  const STRIP_MAX = 14400;                  // Adobe Acrobat's largest page side; longer strips use /UserUnit
  const OVERLAP = 0.5;                      // each picture goes 0.5 px under the next one so no thin line can show between them
  const FLUSH_AT = 32 * 1024 * 1024;        // move big data into a Blob every 32 MB so memory stays low

  /* ---------- reading the top of a JPEG to learn its size and colour type ----------
     WHY: the PDF needs width, height and colour type, but we do not want to decode the picture.
     HOW: a JPEG is a list of "markers". The marker named SOF holds height, width and colour count. */
  // WHY: To put a JPEG in the PDF we must know its width, height and colour count. HOW: This function walks through the
  // JPEG bytes marker by marker and returns { w, h, comps, adobe }. IMPROVE: Also read the EXIF rotation so turned photos
  // show upright.
  function parseJpeg(b) {
    // WHY: Stops us from treating a wrong file as a JPEG. HOW: Every JPEG starts with the two bytes FF D8; if not, we throw
    // an error so the caller can use another way. IMPROVE: Put the file name in the error message.
    if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('not a JPEG');
    // WHY: 'i' is our reading position in the bytes and 'adobe' remembers if the file is an Adobe CMYK file. HOW: We start
    // at byte 2, right after FF D8. IMPROVE: Use clearer names like 'pos' and 'isAdobe'.
    let i = 2, adobe = false;
    // WHY: We must look through the markers until we find the one that holds the size. HOW: The loop runs while at least 4
    // bytes are left to read. IMPROVE: Add a limit on loops to avoid very slow bad files.
    while (i + 4 <= b.length) {
      if (b[i] !== 0xFF) { i++; continue; }          // skip stray bytes
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }             // padding
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }   // markers without data
      // WHY: Each marker says how long its data is, so we can jump over it. HOW: The length is two bytes; shifting the first
      // one left by 8 bits and adding the second makes one number. IMPROVE: Use a DataView, which reads such numbers for you.
      const len = (b[i + 2] << 8) | b[i + 3];
      // APP14 "Adobe" marker: CMYK JPEGs made by Photoshop are stored upside down (inverted).
      // WHY: Some CMYK JPEGs are stored inverted and look wrong unless the PDF flips them. HOW: If the marker is APP14 and the
      // next bytes spell 'Ado', we set adobe to true. IMPROVE: Check all 5 letters of 'Adobe'.
      if (m === 0xEE && len >= 14 && b[i + 4] === 0x41 && b[i + 5] === 0x64 && b[i + 6] === 0x6F) adobe = true;
      // SOF markers (C0..CF except C4, C8, CC) describe the picture.
      // WHY: Only the SOF marker holds the picture size and colour count. HOW: Marker codes C0 to CF are SOF types, except C4,
      // C8 and CC which are other things. IMPROVE: Give the codes names like SOF_FIRST to read it easily.
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        if (m > 0xC2) throw new Error('unsupported JPEG type');     // lossless / arithmetic coding: let the browser decode
        // WHY: These are the facts the PDF needs about the picture. HOW: Read the bits per colour, the height, the width and the
        // number of colour channels at fixed places after the marker. IMPROVE: Name the byte offsets in constants.
        const bits = b[i + 4], h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8], comps = b[i + 9];
        // WHY: Refuses JPEGs we cannot copy safely (not 8 bits, zero size, odd colour count). HOW: If any check fails we throw;
        // otherwise we return the facts as an object. 1 = grey, 3 = RGB, 4 = CMYK. IMPROVE: Give a separate message for each
        // problem.
        if (bits !== 8 || !w || !h || ![1, 3, 4].includes(comps)) throw new Error('unsupported JPEG');
        return { w, h, comps, adobe };
      }
      i += 2 + len;                                  // jump to the next marker
    }
    // WHY: If the loop ends without finding the size marker, the file is broken. HOW: Throw an error so the caller can use
    // the browser decoder instead. IMPROVE: Tell which byte position the search stopped at.
    throw new Error('JPEG header not found');
  }

  /* ---------- reading a PNG so its compressed data can be copied without decoding ----------
     WHY: PDF's FlateDecode with "Predictor 15" understands PNG's own compression, so for simple PNGs
          we can copy the data untouched (lossless AND the same size as the PNG file).
     LIMIT: only 8-bit (or low-bit grey/palette) pictures without transparency and without interlacing.
            Others throw, and app.js falls back to the browser decoder. */
  // WHY: Reads a PNG file so its already compressed pixels can be copied into the PDF without decoding. HOW: A PNG is a
  // list of chunks (length, type, data, checksum); we collect the ones we need. IMPROVE: Support 16-bit and transparent
  // PNGs.
  function parsePng(b) {
    // WHY: The 8 fixed bytes that every PNG file starts with. HOW: We compare them with the start of the file next line.
    // IMPROVE: Move it outside the function so it is built only once.
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    // WHY: Reject files that are too short or are not PNG. HOW: 'some' checks if any signature byte differs from the file.
    // IMPROVE: Say which check failed in the error.
    if (b.length < 33 || sig.some((v, k) => b[k] !== v)) throw new Error('not a PNG');
    // WHY: PNG numbers are 4 bytes long, and DataView reads them easily. HOW: It looks at the same memory as the file bytes
    // without copying. IMPROVE: Use it also in parseJpeg for the same reason.
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // WHY: Places to keep what we find: i = position (the signature is 8 bytes so we start at 8), hdr = image header,
    // palette = colour table, idat = list of pixel-data pieces. IMPROVE: Use clearer names.
    let i = 8, hdr = null, palette = null; const idat = [];
    // WHY: Go through the chunks one by one. HOW: A chunk needs at least 12 bytes (length + type + checksum), so we stop
    // when less is left. IMPROVE: Check that len does not run past the file end.
    while (i + 12 <= b.length) {
      // WHY: Every chunk starts with its data length. HOW: getUint32 reads 4 bytes as one number, and PNG stores the biggest
      // part first, which is what it expects. IMPROVE: Skip very large lengths that are impossible.
      const len = dv.getUint32(i);
      // WHY: The chunk name tells what is inside, like IHDR (header) or IDAT (pixels). HOW: Turn the 4 bytes after the length
      // into letters. IMPROVE: None needed, it is short and clear.
      const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      // WHY: The data part of this chunk. HOW: 'subarray' makes a view on the same bytes with no copy, so it is fast and uses
      // no extra memory. IMPROVE: Make sure it does not go past the file end.
      const data = b.subarray(i + 8, i + 8 + len);
      // WHY: IHDR is the header: it tells size, bit depth, colour type and interlacing. HOW: If this chunk is IHDR we read
      // those values at their fixed positions. IMPROVE: Name the positions in constants.
      if (type === 'IHDR') {
        hdr = { w: dv.getUint32(i + 8), h: dv.getUint32(i + 12), depth: b[i + 16], colorType: b[i + 17], interlace: b[i + 20] };
      // WHY: Chunk handling for the colour table, transparency, pixel data and the end marker. HOW: PLTE is stored, tRNS
      // (transparency) stops us with an error because we cannot copy it, IDAT pieces are collected, IEND ends the loop.
      // IMPROVE: Support transparency.
      } else if (type === 'PLTE') palette = data;
      else if (type === 'tRNS') throw new Error('PNG has transparency');
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      // WHY: Move to the next chunk. HOW: Add 12 (4 length bytes + 4 type bytes + 4 checksum bytes) plus the data length.
      // IMPROVE: Check the checksum (CRC) to find damaged files.
      i += 12 + len;                                  // 4 length + 4 type + data + 4 checksum
    }
    // WHY: A PNG without header or pixel data is broken. HOW: Throw so the caller can try another way. IMPROVE: Different
    // messages for missing header and missing data.
    if (!hdr || !idat.length) throw new Error('broken PNG');
    // WHY: We can only copy some PNG kinds. HOW: Colour type 0 = grey, 2 = RGB, 3 = palette. okDepth requires 8 bits for RGB
    // and 1, 2, 4 or 8 bits for the others. IMPROVE: Support 16-bit pictures.
    const okType = hdr.colorType === 0 || hdr.colorType === 2 || hdr.colorType === 3;
    const okDepth = hdr.colorType === 2 ? hdr.depth === 8 : [1, 2, 4, 8].includes(hdr.depth);
    // WHY: Stop for PNG kinds that the PDF cannot take directly. HOW: Throw an error when the type, depth or interlacing is
    // not supported; app.js then lets the browser decode it. IMPROVE: Handle interlaced PNGs by de-interlacing.
    if (!okType || !okDepth || hdr.interlace !== 0) throw new Error('PNG type needs the browser decoder');
    // WHY: A palette picture needs its colour table. HOW: Type 3 without PLTE is broken, so we throw. IMPROVE: None needed.
    if (hdr.colorType === 3 && !palette) throw new Error('PNG palette missing');
    // WHY: A PNG can split its pixel data over many IDAT chunks, but the PDF wants one piece. HOW: First add up all lengths,
    // then make one big byte array of that size. IMPROVE: Use new Blob for huge files.
    let total = 0; idat.forEach(p => { total += p.length; });
    // WHY: Join the pieces. HOW: 'all.set(p, o)' copies each piece at position o, then o moves forward. IMPROVE: Skip the
    // copy if there is only one piece.
    const all = new Uint8Array(total); let o = 0;
    idat.forEach(p => { all.set(p, o); o += p.length; });
    // WHY: Returns what addPng needs: size, depth, colour type, palette and the joined compressed pixels. HOW: A plain
    // object. IMPROVE: None needed.
    return { w: hdr.w, h: hdr.h, depth: hdr.depth, colorType: hdr.colorType, palette, idat: all };
  }

  /* ---------- zlib compression using the browser's built-in CompressionStream ----------
     Returns null when the browser cannot do it (very old browsers); then we store raw pixels. */
  // WHY: Shrinks raw pixel bytes with zlib so the PDF stays small, with no quality loss. HOW: Pipes the bytes through the
  // browser's CompressionStream and collects the result. It is async, so use await. IMPROVE: Run it in a Worker so the
  // page does not freeze.
  async function deflate(bytes) {
    // WHY: Very old browsers lack CompressionStream. HOW: We return null so the caller stores the pixels uncompressed.
    // IMPROVE: Add a small JavaScript zlib as a backup.
    if (typeof CompressionStream === 'undefined') return null;
    // WHY: This does the real compression. HOW: Wrap bytes in a Blob, get a stream, send it through 'deflate'. IMPROVE: Test
    // other levels if the library allows.
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    // WHY: Get the finished compressed bytes. HOW: Response reads the stream to the end and gives an ArrayBuffer, which we
    // wrap as a Uint8Array. IMPROVE: None needed.
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // PDF text strings: "FEFF" + each character as 4 hex digits works for every language (Chinese, Korean...).
  // WHY: PDF titles must be written in a special way to allow any language. HOW: Start with FEFF (it says: two bytes per
  // letter), then add each letter code as 4 hex digits, inside < >. IMPROVE: Characters above 65535 (emoji) need two
  // codes, which charCodeAt already gives.
  function pdfText(s) {
    // WHY: The FEFF start (called a byte order mark) tells the PDF viewer the text is UTF-16. HOW: 'h' is the hex text we
    // build. IMPROVE: Name it 'hex'.
    let h = 'FEFF';
    // WHY: Turn each letter into its number as 4 hex digits. HOW: charCodeAt gives the number, toString(16) makes hex,
    // padStart adds zeros in front. IMPROVE: None needed.
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0');
    // WHY: PDF hex strings are wrapped in angle brackets. HOW: Add < and > around the digits and return it. IMPROVE: None
    // needed.
    return '<' + h + '>';
  }

  // WHY: The main tool: one MangaPDF object builds one PDF file. HOW: It keeps its state (pieces, offsets, pages) in
  // properties, and has methods like addJpeg and finish. IMPROVE: Split strip logic into its own class.
  class MangaPDF {
    // WHY: Sets up a new empty PDF. HOW: 'opts' is an optional settings object with a default of {} so new MangaPDF() works.
    // The title is read from it. IMPROVE: Add more options such as author.
    constructor(opts = {}) {
      this.title = opts.title || 'Manga';
      // WHY: Starts the bookkeeping that the PDF needs. HOW: 'parts' holds file pieces in order, 'size' counts bytes (needed
      // for the xref table), 'pending' counts bytes not yet moved to a Blob. IMPROVE: Hide them with # private fields.
      this.parts = [];            // pieces of the file, in order
      this.size = 0;              // bytes written so far (needed for the xref table)
      this.pending = 0;           // bytes in `parts` that are not yet moved into a Blob
      // WHY: The xref table at the end needs each object's start position. HOW: An array where the index is the object number;
      // objects 1 and 2 are reserved for the catalog and the page list. IMPROVE: Use a Map for clarity.
      this.offsets = [0, 0, 0];   // object number -> byte position. 1 = catalog and 2 = page list (written last)
      // WHY: Every PDF object needs its own number. HOW: We start at 3 because 1 and 2 are reserved. _id() gives the next one.
      // IMPROVE: None needed.
      this.nextId = 3;            // next free object number
      // WHY: Keeps the page objects in order so the page list can be written at the end. HOW: A list of object numbers. Then
      // the bookmark helpers and the page counter follow. IMPROVE: None needed.
      this.kids = [];             // object numbers of all pages, in order
      this.marks = [];            // bookmarks: { title, page, top }
      this.pendingMark = null;    // bookmark waiting for the next page
      this.pageCount = 0;
      // File header. The 4 high bytes on line 2 tell programs "this file is binary".
      // WHY: Every PDF must start with a header. HOW: These bytes spell '%PDF-1.7', a new line, and a comment with 4 high
      // bytes so programs treat the file as binary. IMPROVE: Write the header as text to read it more easily.
      this._push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    }

    // WHY: One place that adds bytes to the file and counts them, so our byte positions stay right. HOW: Push the bytes, add
    // their length to size and pending. IMPROVE: Check the argument is a Uint8Array.
    _push(u8) {
      this.parts.push(u8); this.size += u8.length; this.pending += u8.length;
      // WHY: Huge PDFs would fill memory. HOW: When more than 32 MB is waiting, we pack all pieces into one Blob, which the
      // browser can keep outside JavaScript memory. IMPROVE: Make the limit adjustable.
      if (this.pending > FLUSH_AT) { this.parts = [new Blob(this.parts)]; this.pending = 0; }   // lets the browser keep it outside JS memory
    }
    // WHY: Gives a new unique object number. HOW: Return nextId and then add one (the ++ after the name does that). IMPROVE:
    // None needed.
    _id() { return this.nextId++; }

    // Write one object. With `data` it is a "stream" object (picture data, page content).
    // WHY: Writes one PDF object into the file. HOW: Remember where it starts (offsets), then write the header and the
    // dictionary. With 'data' it is a stream object, with the length added. IMPROVE: Check that the id is valid.
    _obj(id, dict, data) {
      this.offsets[id] = this.size;
      if (data) {
        // WHY: A stream object needs its dictionary, its length and the word 'stream'. HOW: Text is turned into bytes with
        // enc.encode, then the data and the end words follow. IMPROVE: None needed.
        this._push(enc.encode(id + ' 0 obj\n<<' + dict + ' /Length ' + data.length + '>>\nstream\n'));
        this._push(data);
        this._push(enc.encode('\nendstream\nendobj\n'));
      } else {
        // WHY: Plain objects without data (like a page) are simpler. HOW: Write the number, the dictionary text and 'endobj'.
        // IMPROVE: None needed.
        this._push(enc.encode(id + ' 0 obj\n' + dict + '\nendobj\n'));
      }
    }

    // WHY: Picture helper: asks 'should the next picture go at the very top?' and then resets the answer. HOW: Reads the
    // _front flag, sets it back to false, returns the old value. IMPROVE: Pass the flag as an argument and drop the shared
    // state.
    _takeFront() { const f = this._front; this._front = false; return f; }   // see strip(): "put this one at the top"

    // The next page you add gets a bookmark with this title (shown in the PDF viewer's side panel).
    // WHY: Lets app.js name the next page for the PDF viewer's side list. HOW: Just stores the title; the next page that is
    // made uses it and clears it. IMPROVE: Support nested bookmarks (chapter > section).
    bookmark(title) { this.pendingMark = title; }

    // Write the picture once, then one or more pages that show it.
    // While a long strip is open (see strip()), the picture goes onto the strip instead of getting its own pages.
    // WHY: Common step for every picture type (JPEG, PNG, raw). HOW: Write the picture as an XObject Image, then either
    // place it on the open strip or make its own pages. 'dict' has colour and filter info. IMPROVE: Return the image id too.
    _image(w, h, dict, data, atFront) {
      // WHY: The picture needs its own object number. HOW: Ask _id() for the next free number. IMPROVE: None needed.
      const imgId = this._id();
      // WHY: Writes the picture into the file. HOW: The dictionary says it is an image with width and height, and the extra
      // 'dict' adds colour and compression details. The data is the picture bytes. IMPROVE: None needed.
      this._obj(imgId, '/Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' ' + dict, data);
      // WHY: In strip mode the picture goes on the tall page and gets no pages of its own. HOW: If a strip is open, hand the
      // picture to it; if not, use the normal page maker. IMPROVE: Make the choice clear with an if/else.
      if (this._strip) return this._strip._place(imgId, w, h, atFront);
      return this._pages(imgId, w, h);
    }

    /* LONG STRIP: one tall page that holds many pictures (one chapter).
       WHY: the person asked for "one chapter = one page", like the reading mode.
       HOW: strip() returns a helper with the same add... methods. Pictures are written to the file at once
            (so memory stays low) and only a tiny note {id, width, height} is kept. strip.end() writes the page. */
    // WHY: Starts a long-strip page, used for one-chapter-per-page. HOW: Makes a helper object 'st' that remembers its
    // pictures and has add and end methods. 'opts.bg' is an optional background colour. IMPROVE: Add a margin option.
    strip(opts = {}) {
      // WHY: Only one strip can be open at a time. HOW: If one is open already, throw an error. IMPROVE: End the old strip
      // automatically.
      if (this._strip) throw new Error('finish the open strip first');
      // WHY: 'self' keeps the PDF object reachable inside the helper's functions. HOW: 'st' holds the picture list (items),
      // the widest picture (maxWidth) and the background colour. IMPROVE: Turn it into a small class.
      const self = this, st = {
        items: [], maxWidth: 0, bg: opts.bg || null,
        // WHY: Remember a picture on the strip without keeping its bytes (they are already in the file). HOW: Update the widest
        // width, then add a small note {id, w, h} at the front or the back. IMPROVE: Check w and h are positive.
        _place(id, w, h, front) {
          st.maxWidth = Math.max(st.maxWidth, w);
          const it = { id, w, h };
          if (front) st.items.unshift(it); else st.items.push(it);
          return { pages: 1, width: w, height: h };
        },
        // WHY: The strip offers the same add methods as the PDF. HOW: Each one sets the 'front' flag, then calls the PDF's own
        // method, which later reaches _place. The three methods work the same way. IMPROVE: Pass the flag as an argument
        // instead.
        addJpeg: (b, front) => { self._front = !!front; return self.addJpeg(b); },
        addPng: (b, front) => { self._front = !!front; return self.addPng(b); },
        addRaw: (w, h, rgb, front) => { self._front = !!front; return self.addRaw(w, h, rgb); },
        // WHY: Lets app.js finish the page with strip.end(). HOW: Calls the PDF's _endStrip with this strip. IMPROVE: None
        // needed.
        end() { return self._endStrip(st); }
      };
      // WHY: Marks the strip as open so new pictures go on it. HOW: Store it in this._strip, then return it to the caller.
      // IMPROVE: None needed.
      this._strip = st;
      return st;
    }

    // WHY: Builds the one tall page from all strip pictures. HOW: Close the strip, stop if it is empty, then work out sizes,
    // write the page commands and the page object. IMPROVE: Split into smaller helper functions.
    _endStrip(st) {
      this._strip = null;
      if (!st.items.length) return null;
      // WHY: The page width is the widest picture (at least 1, so we never divide by zero). HOW: Math.max picks the bigger
      // value. IMPROVE: None needed.
      const W = Math.max(1, st.maxWidth);
      // Every picture is shown as wide as the widest one. Narrower pictures are only stretched by the viewer
      // (their data is not touched), so nothing is ever shrunk.
      // WHY: Work out every picture's height when shown at width W and its top position. HOW: Scale each height by W / its own
      // width, and add them up in H. 'rows' is the list of results. IMPROVE: Round heights to avoid tiny gaps.
      let H = 0;
      const rows = st.items.map(it => { const hd = it.h * W / it.w; const r = { id: it.id, hd, top: H }; H += hd; return r; });
      // WHY: Acrobat cannot show pages bigger than 14400 units. HOW: u = how many times too tall the strip is (rounded up, at
      // least 1). If u is bigger than 1 we add /UserUnit later. IMPROVE: Test in many viewers.
      const u = Math.max(1, Math.ceil(H / STRIP_MAX));          // 1 = normal size; bigger = /UserUnit is needed
      // WHY: Short number text for the PDF file. HOW: Round to 4 decimals and turn into text. IMPROVE: None needed.
      const f = n => (Math.round(n * 10000) / 10000).toString();
      // WHY: Start of the page drawing commands. HOW: 'q' saves the state and 'cm' scales everything by 1/u so we can think in
      // picture pixels. IMPROVE: None needed.
      let c = 'q ' + f(1 / u) + ' 0 0 ' + f(1 / u) + ' 0 0 cm\n';      // from here on: 1 unit = 1 picture pixel
      // WHY: Optional background colour so gaps are not see-through. HOW: Convert 0-255 to 0-1, set the fill colour with 'rg'
      // and draw a full-page rectangle with 're f'. IMPROVE: Use a helper for the colour text.
      if (st.bg) c += (st.bg[0] / 255).toFixed(3) + ' ' + (st.bg[1] / 255).toFixed(3) + ' ' + (st.bg[2] / 255).toFixed(3) + ' rg 0 0 ' + f(W) + ' ' + f(H) + ' re f\n';
      // WHY: List of picture names for the page resources. HOW: Each entry will look like /I0 12 0 R (name and object).
      // IMPROVE: None needed.
      const xo = [];
      // WHY: Draw every picture once. HOW: Loop over rows with k as its number. IMPROVE: None needed.
      rows.forEach((r, k) => {
        const hh = r.hd + (k < rows.length - 1 ? OVERLAP : 0);              // overlap: see OVERLAP above
        // WHY: Place one picture. HOW: Save the state, set its width and height and move it (PDF counts from the bottom, so we
        // use H - top - height), draw it with Do, restore. IMPROVE: None needed.
        c += 'q ' + f(W) + ' 0 0 ' + f(hh) + ' 0 ' + f(H - r.top - hh) + ' cm /I' + k + ' Do Q\n';
        // WHY: The page needs to know which object /I0, /I1... mean. HOW: Add the name and object number text to the xo list.
        // IMPROVE: None needed.
        xo.push('/I' + k + ' ' + r.id + ' 0 R');
      });
      // WHY: Close the 'q' started above. HOW: Add a final Q to the commands. IMPROVE: None needed.
      c += 'Q';
      // WHY: Two new objects are needed: the page commands and the page itself. HOW: Ask for two new numbers. IMPROVE: None
      // needed.
      const cid = this._id(), pid = this._id();
      // WHY: Write the drawing commands. HOW: Turn the text into bytes and store them as a stream object. IMPROVE: Compress
      // them with deflate.
      this._obj(cid, '', enc.encode(c));
      // WHY: Write the page itself. HOW: It points to the page list (2 0 R), sets the size (MediaBox, divided by u), adds
      // /UserUnit if needed, lists the pictures, and links the commands. IMPROVE: None needed.
      this._obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(W / u) + ' ' + f(H / u) + ']' + (u > 1 ? ' /UserUnit ' + u : '') +
        ' /Resources << /XObject << ' + xo.join(' ') + ' >> >> /Contents ' + cid + ' 0 R >>');
      // WHY: Make the new page count. HOW: Add its number to the page list and raise the page counter. IMPROVE: None needed.
      this.kids.push(pid); this.pageCount++;
      // WHY: Give the page its bookmark if one was waiting. HOW: Save title, page and top position, then clear the waiting
      // mark. IMPROVE: None needed.
      if (this.pendingMark) { this.marks.push({ title: this.pendingMark, page: pid, top: f(H / u) }); this.pendingMark = null; }
      // WHY: Tell app.js what was made. HOW: Return an object with width, height, unit and number of pictures. IMPROVE: None
      // needed.
      return { width: W, height: H, unit: u, images: rows.length };
    }

    /* A page is as big as the picture. If the picture is taller than MAX_PAGE it gets several pages;
       each page shows the SAME picture object, moved up so a different part is visible. Nothing is re-encoded. */
    // WHY: Normal mode: one picture makes one or more pages. HOW: A tall picture is cut into n pages of at most 14000 units;
    // every page uses the same picture. IMPROVE: Cut at natural gaps instead of fixed lines.
    _pages(imgId, w, h) {
      // WHY: How many pages are needed. HOW: Divide the height by the page limit and round up. IMPROVE: None needed.
      const n = Math.ceil(h / MAX_PAGE);
      // WHY: Make each page. HOW: Loop k from 0 to n-1; 'top' is the picture row where this page starts and 'sh' is this
      // page's height (the last may be shorter). IMPROVE: None needed.
      for (let k = 0; k < n; k++) {
        const top = k * MAX_PAGE, sh = Math.min(MAX_PAGE, h - top);
        // "cm" places and scales the picture: width w, height h, bottom edge so that row `top` is at the page's top edge.
        // WHY: Drawing command that moves the picture so the right part shows. HOW: Place the full picture and shift it up by
        // 'top'. The page window only shows part of it. IMPROVE: None needed.
        const content = enc.encode('q ' + w + ' 0 0 ' + h + ' 0 ' + (sh + top - h) + ' cm /Im0 Do Q');
        // WHY: A page needs two new objects. HOW: One for the commands, one for the page. IMPROVE: None needed.
        const cid = this._id(), pid = this._id();
        // WHY: Save the drawing commands. HOW: Write them as a stream object. IMPROVE: None needed.
        this._obj(cid, '', content);
        // WHY: Write the page. HOW: Set the size w x sh, name the picture /Im0 and link the commands. IMPROVE: None needed.
        this._obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + sh + '] /Resources << /XObject << /Im0 ' + imgId + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
        // WHY: Register the page. HOW: Add to the list and count it. IMPROVE: None needed.
        this.kids.push(pid); this.pageCount++;
        // WHY: Bookmark only the first page made after bookmark(). HOW: If a title is waiting, save it, then clear it. IMPROVE:
        // None needed.
        if (this.pendingMark) { this.marks.push({ title: this.pendingMark, page: pid, top: sh }); this.pendingMark = null; }
      }
      // WHY: Tell the caller what happened. HOW: Return page count and picture size. IMPROVE: None needed.
      return { pages: n, width: w, height: h };
    }

    // JPEG: copy the file bytes into the PDF as they are (no quality loss, no re-compression).
    // WHY: Add a JPEG with no quality loss. HOW: Read its facts with parseJpeg, choose the colour space, then store the
    // original bytes and let the PDF decode them (DCTDecode). async lets it match the other add methods. IMPROVE: Skip async
    // here.
    async addJpeg(bytes) {
      // WHY: We need size and colour count. HOW: parseJpeg returns them. It throws on odd files. IMPROVE: None needed.
      const j = parseJpeg(bytes);
      // WHY: PDF needs a colour space name. HOW: 1 channel = grey, 3 = RGB, otherwise CMYK, chosen with chained ? : tests.
      // IMPROVE: Use a small lookup table.
      const cs = j.comps === 1 ? '/DeviceGray' : j.comps === 3 ? '/DeviceRGB' : '/DeviceCMYK';
      // WHY: Photoshop CMYK JPEGs are inverted. HOW: Add a /Decode array that flips them back, only for those files. IMPROVE:
      // None needed.
      const decode = (j.comps === 4 && j.adobe) ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
      // WHY: Store the picture. HOW: Send the size, the colour info, the DCTDecode filter and the unchanged bytes to _image.
      // IMPROVE: None needed.
      return this._image(j.w, j.h, '/ColorSpace ' + cs + ' /BitsPerComponent 8 /Filter /DCTDecode' + decode, bytes, this._takeFront());
    }

    // PNG: copy the compressed pixel data as it is (lossless).
    // WHY: Add a simple PNG without decoding it. HOW: parsePng collects the compressed data; the PDF decodes it with
    // FlateDecode and Predictor 15. IMPROVE: Support PNGs with transparency.
    async addPng(bytes) {
      // WHY: Get the PNG facts. HOW: parsePng throws for unsupported kinds, and app.js then uses the browser decoder. IMPROVE:
      // None needed.
      const p = parsePng(bytes);
      // WHY: Choose the colour space. HOW: 'cs' is a text that is set in the next lines: grey, RGB, or an Indexed palette.
      // IMPROVE: None needed.
      let cs;
      if (p.colorType === 0) cs = '/DeviceGray';
      else if (p.colorType === 2) cs = '/DeviceRGB';
      // WHY: A palette picture needs its colour table inside the PDF. HOW: Turn every palette byte into 2 hex digits and use
      // [/Indexed /DeviceRGB highest-index <hex>]. IMPROVE: None needed.
      else {                                           // palette picture: the colour table goes into the PDF as hex text
        let hex = ''; for (let i = 0; i < p.palette.length; i++) hex += p.palette[i].toString(16).padStart(2, '0');
        cs = '[/Indexed /DeviceRGB ' + (Math.floor(p.palette.length / 3) - 1) + ' <' + hex + '>]';
      }
      // WHY: PDF needs to know how many colour values each pixel has. HOW: RGB = 3, others = 1. IMPROVE: None needed.
      const colors = p.colorType === 2 ? 3 : 1;
      // WHY: Store the PNG data as it is. HOW: The FlateDecode filter plus Predictor 15 lets the PDF read PNG compression.
      // Columns is the image width. IMPROVE: None needed.
      return this._image(p.w, p.h,
        '/ColorSpace ' + cs + ' /BitsPerComponent ' + p.depth + ' /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ' + colors + ' /BitsPerComponent ' + p.depth + ' /Columns ' + p.w + ' >>',
        p.idat, this._takeFront());
    }

    // Raw pixels (3 bytes per pixel: R, G, B). Compressed with zlib, still lossless.
    // WHY: For pictures the browser decoded (WebP, odd PNG): store raw red, green, blue bytes. HOW: Compress with deflate if
    // possible, otherwise store as it is. Still lossless. IMPROVE: Offer JPEG output to make files smaller.
    async addRaw(w, h, rgb) {
      // WHY: Make the raw pixels smaller. HOW: deflate returns compressed bytes or null. await waits for it. IMPROVE: None
      // needed.
      const z = await deflate(rgb);
      // WHY: Store the picture. HOW: Add FlateDecode only if compression worked, and use the compressed bytes or else the
      // original. IMPROVE: None needed.
      return this._image(w, h, '/ColorSpace /DeviceRGB /BitsPerComponent 8' + (z ? ' /Filter /FlateDecode' : ''), z || rgb, this._takeFront());
    }

    // Write the page list, bookmarks, catalog, info and the xref table. Returns the finished PDF as a Blob.
    // WHY: Last step: closes the file properly. HOW: Write the page list, bookmarks, catalog, info and the xref table, then
    // return everything as a Blob. IMPROVE: Block calling finish twice.
    finish() {
      // WHY: Object 2 is the page list, written at the end because only now we know all pages. HOW: Count and list every page
      // number. IMPROVE: None needed.
      this._obj(2, '<< /Type /Pages /Count ' + this.kids.length + ' /Kids [' + this.kids.map(k => k + ' 0 R').join(' ') + '] >>');
      // WHY: Bookmarks make the viewer's side list. HOW: 'outline' holds extra text for the catalog; it stays empty when there
      // are no bookmarks. IMPROVE: None needed.
      let outline = '';
      if (this.marks.length) {
        // WHY: Bookmarks are linked objects. HOW: Make one root number and one number for each bookmark, with map. IMPROVE: None
        // needed.
        const root = this._id(), ids = this.marks.map(() => this._id());
        // WHY: Write each bookmark. HOW: forEach goes over the marks with index i. IMPROVE: None needed.
        this.marks.forEach((m, i) => {
          // WHY: Each bookmark gets title, parent, links to the previous and next bookmark, and where to jump. HOW: /Dest points
          // to the page and its top position. IMPROVE: None needed.
          this._obj(ids[i], '<< /Title ' + pdfText(m.title) + ' /Parent ' + root + ' 0 R' +
            (i > 0 ? ' /Prev ' + ids[i - 1] + ' 0 R' : '') + (i < ids.length - 1 ? ' /Next ' + ids[i + 1] + ' 0 R' : '') +
            ' /Dest [' + m.page + ' 0 R /XYZ 0 ' + m.top + ' null] >>');
        });
        // WHY: The root object points to the first and last bookmark. HOW: Uses the first and last ids and the count. IMPROVE:
        // None needed.
        this._obj(root, '<< /Type /Outlines /First ' + ids[0] + ' 0 R /Last ' + ids[ids.length - 1] + ' 0 R /Count ' + ids.length + ' >>');
        // WHY: Tells the catalog about the bookmarks. HOW: Add /Outlines and /PageMode /UseOutlines so the side list opens.
        // IMPROVE: None needed.
        outline = ' /Outlines ' + root + ' 0 R /PageMode /UseOutlines';
      }
      // /PageLayout /OneColumn = pages one under the other with continuous scrolling, like the reading mode.
      // WHY: Object 1, the catalog, is the start of the PDF. HOW: It links to the page list, asks for one column layout and
      // adds the bookmarks text. IMPROVE: None needed.
      this._obj(1, '<< /Type /Catalog /Pages 2 0 R /PageLayout /OneColumn' + outline + ' >>');
      // WHY: A PDF can carry a creation date. HOW: 'd' is now; p2 adds a leading zero to get 2 digits. IMPROVE: Let the caller
      // give a date.
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      // WHY: PDF date format. HOW: Build D:YYYYMMDDHHMMSSZ from the UTC parts. IMPROVE: None needed.
      const date = 'D:' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + 'Z';
      // WHY: The info object holds title and producer. HOW: Take a new object number. IMPROVE: None needed.
      const info = this._id();
      // WHY: Write the info. HOW: Title, producer name and date are written; pdfText makes titles safe for any language.
      // IMPROVE: Add author.
      this._obj(info, '<< /Title ' + pdfText(this.title) + ' /Producer ' + pdfText('MangaFlow Reader') + ' /CreationDate (' + date + ') >>');

      // WHY: The trailer must say where the xref table starts. HOW: It starts at the current size, so we remember it now.
      // IMPROVE: None needed.
      const xrefAt = this.size;
      // WHY: The xref table is the map of the file. HOW: Start with its header and a first line for object 0. IMPROVE: None
      // needed.
      let x = 'xref\n0 ' + this.nextId + '\n0000000000 65535 f \n';
      // WHY: One line for each object. HOW: Write its start position with 10 digits. Each line must be exactly 20 bytes or
      // viewers complain. IMPROVE: None needed.
      for (let i = 1; i < this.nextId; i++) x += String(this.offsets[i]).padStart(10, '0') + ' 00000 n \n';   // each line is exactly 20 bytes
      // WHY: The trailer tells viewers how many objects, which is the root and info, and where the xref is. HOW: Add the text
      // and %%EOF at the end. IMPROVE: None needed.
      x += 'trailer\n<< /Size ' + this.nextId + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n';
      // WHY: Put the table into the file. HOW: Turn the text into bytes and push. IMPROVE: None needed.
      this._push(enc.encode(x));
      // WHY: Give the finished PDF to the caller. HOW: Join all pieces into a Blob with type application/pdf so it can be
      // downloaded. IMPROVE: None needed.
      return new Blob(this.parts, { type: 'application/pdf' });
    }
  }

  // WHY: The things other files may use. HOW: A small object listing the class and the two parse functions. IMPROVE:
  // Export only what is needed.
  const api = { MangaPDF, parseJpeg, parsePng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // lets Node.js tests load it
  else root.MangaPDFLib = api;                                                   // in the browser: window.MangaPDFLib
})(typeof window !== 'undefined' ? window : globalThis);
