import fs from "node:fs/promises";

const DEFAULT_SAMPLE_SIZE = 512;

// Text control bytes VS Code-like heuristics typically allow in small amounts
const ALLOWED_CONTROLS = new Set([0x09, 0x0A, 0x0D, 0x0C, 0x08]); // \t \n \r \f \b

function isLikelyUTF8(buffer:Buffer) {
    let i = 0;
    while (i < buffer.length) {
        const b0 = buffer[i];

        if (b0 <= 0x7F) {
            i += 1;
            continue;
        }

        let needed = 0;
        let minCodePoint = 0;
        let codePoint = 0;

        if ((b0 & 0xE0) === 0xC0) {
            needed = 1;
            minCodePoint = 0x80;
            codePoint = b0 & 0x1F;
        } else if ((b0 & 0xF0) === 0xE0) {
            needed = 2;
            minCodePoint = 0x800;
            codePoint = b0 & 0x0F;
        } else if ((b0 & 0xF8) === 0xF0) {
            needed = 3;
            minCodePoint = 0x10000;
            codePoint = b0 & 0x07;
        } else {
            return false;
        }

        if (i + needed >= buffer.length) return false;

        for (let j = 1; j <= needed; j++) {
            const bx = buffer[i + j];
            if ((bx & 0xC0) !== 0x80) return false;
            codePoint = (codePoint << 6) | (bx & 0x3F);
        }

        if (codePoint < minCodePoint) return false; // overlong
        if (codePoint > 0x10FFFF) return false;
        if (codePoint >= 0xD800 && codePoint <= 0xDFFF) return false; // surrogate range

        i += needed + 1;
    }

    return true;
}

function looksLikeText(buffer:Buffer) {
    if (buffer.length === 0) return true;

    // Fast binary signal
    if (buffer.includes(0x00)) return false;

    let suspicious = 0;
    let printable = 0;

    for (const byte of buffer) {
        if (byte >= 0x20 && byte <= 0x7E) {
            printable++;
            continue;
        }

        if (ALLOWED_CONTROLS.has(byte)) {
            printable++;
            continue;
        }

        // High bytes may be text in UTF-8 or other encodings
        if (byte >= 0x80) continue;

        suspicious++;
    }

    // If it decodes as valid UTF-8, treat as text even if it contains non-ASCII
    if (isLikelyUTF8(buffer)) return true;

    const ratio = suspicious / buffer.length;

    // Similar spirit to VS Code: small sample, conservative binary decision
    return ratio <= 0.3 && printable > 0;
}

export async function isBinaryFile(filePath:string, sampleSize = DEFAULT_SAMPLE_SIZE) {
    const handle = await fs.open(filePath, "r");
    try {
        const stat = await handle.stat();
        if (stat.size === 0) return false;

        const size = Math.min(sampleSize, stat.size);
        const buffer = Buffer.allocUnsafe(size);
        const { bytesRead } = await handle.read(buffer, 0, size, 0);
        const sample = buffer.subarray(0, bytesRead);

        return !looksLikeText(sample);
    } finally {
        await handle.close();
    }
}
