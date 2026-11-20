// Splits a transcript into speaker turns and checks the AI's quotes against it.
// Handles "[01:23] Coach: ...", "COACH [01:23] ..." and "Coach: ..." (no timestamps).

const TURN = /^\s*(?:\[([\d:]+)\]\s*)?(coach|client)\b\s*:?\s*(?:\[([\d:]+)\]|\(([\d:]+)\))?\s*:?\s*(.*)$/i;

function parseTranscript(text) {
  const turns = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(TURN);
    if (m) {
      const speaker = m[2].toLowerCase() === 'coach' ? 'Coach' : 'Client';
      turns.push({ timestamp: m[1] || m[3] || m[4] || null, speaker, text: m[5] });
    } else if (turns.length) {
      turns[turns.length - 1].text += ` ${line.trim()}`;
    } else {
      turns.push({ timestamp: null, speaker: null, text: line.trim() });
    }
  }
  return { turns, hasTimestamps: turns.some(t => t.timestamp) };
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A quote may skip words with "..." or "--"; every fragment must appear in order in one turn
function turnContains(turn, quote) {
  const hay = normalize(turn.text);
  let from = 0;
  for (const fragment of String(quote).split(/\.{3}|…|--/).map(normalize).filter(Boolean)) {
    const at = hay.indexOf(fragment, from);
    if (at < 0) return false;
    from = at + fragment.length;
  }
  return true;
}

// "[02:54]" and " 02:54 " are the same timestamp
function cleanTimestamp(t) {
  return String(t || '').replace(/[[\]()\s]/g, '');
}

// Returns { status: 'ok' | 'moved' | 'speaker' | 'missing', turn }
function verifyQuote(parsed, { timestamp, speaker, quote }) {
  timestamp = cleanTimestamp(timestamp);
  const matches = parsed.turns.filter(t => turnContains(t, quote));
  if (!matches.length) return { status: 'missing' };
  const sameTimestamp = t => cleanTimestamp(t.timestamp) === timestamp;
  const exact = matches.find(t => sameTimestamp(t) && (!speaker || t.speaker === speaker));
  if (exact) return { status: 'ok', turn: exact };
  const sameTime = matches.find(sameTimestamp);
  if (sameTime) return { status: 'speaker', turn: sameTime };
  return { status: 'moved', turn: matches[0] };
}

function asText(parsed) {
  return parsed.turns
    .map(t => `${t.timestamp ? `[${t.timestamp}] ` : ''}${t.speaker ? `${t.speaker}: ` : ''}${t.text}`)
    .join('\n');
}

module.exports = { parseTranscript, verifyQuote, normalize, asText, cleanTimestamp };
