const OpenAI = require('openai');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegStatic);

async function withRetry(fn, maxAttempts = 3) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw lastErr;
}

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractAudio(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioChannels(1)
      .outputOptions(['-q:a 5'])
      .output(audioPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function transcribe(audioPath) {
  return withRetry(async () => {
    const client = getClient();
    const result = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(audioPath),
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
    const timed = (result.segments || [])
      .map(s => `[${formatTimestamp(s.start)}] ${s.text.trim()}`)
      .join('\n');
    return addSpeakerLabels(client, timed || result.text);
  });
}

// 83.4 -> "01:23"; sessions over an hour get "1:02:03"
function formatTimestamp(seconds) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

async function addSpeakerLabels(client, rawTranscript) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Below is a raw transcript of a coaching session between a coach and their client. Each line starts with a [MM:SS] timestamp marking when that segment begins.\n\nReformat it with speaker labels on each turn. Use exactly "Coach:" and "Client:" as labels — plain text, with no markdown formatting (no asterisks, no bold, no headings).\n- Start every turn on its own line with the timestamp of the first segment in that turn, then the label, e.g. "[01:23] Coach: ...". Copy timestamps exactly; never invent or change them.\n- Merge consecutive segments from the same speaker into one turn, and drop the timestamps of the merged segments after the first.\n- The coach typically asks questions, reflects back, and facilitates exploration.\n- The client shares their experience, challenges, and goals.\n\nReturn only the formatted transcript — no commentary, no preamble.\n\nRaw transcript:\n${rawTranscript}`,
    }],
  });
  return response.choices[0].message.content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').replace(/\*\*/g, '');
}

async function generateAiReview(assessment, transcript) {
  const client = getClient();
  const prompt = `You are an experienced coaching mentor reviewing a coaching session transcript.

Your audience is NOT the coach. Your audience is the coach's mentor, who will use your observations to prepare a mentoring conversation and fill in a short form with the coach's strengths, development areas, and development practices.

Be honest and specific. Do not soften feedback or inflate praise. Refer to the coach as "the coach" and the other person as "the client." Support strengths with short, verbatim quotes from the transcript (with the timestamp when the transcript has one). Keep it brief and easy to scan.

---

## SESSION TRANSCRIPT

${transcript}

---

## OUTPUT STRUCTURE

Use exactly these five sections, in this order, each with a ## markdown heading. Use a blank line between every element.

## Strengths

3 to 4 strengths. For each, use exactly this shape:

### [Short title]

One or two sentences on what the coach did and its effect on the client.

> "Brief verbatim quote" (timestamp if available)

## Development Areas

3 to 4 development areas, focusing on patterns that showed up more than once. For each, use exactly this shape, with no quote:

### [Short title]

One or two sentences on what the coach did or missed, and what it limited.

## Client Agendas

Exactly these three lines, one or two sentences each:

- **Presenting:** what the client wants to work on and the outcome they want.
- **Deeper:** what is underneath it and why it matters to the client.
- **Transformational:** who the client is becoming.

Then one sentence on which level the coach mostly worked at.

## Possible Practices

2 to 3 concrete practices the coach can try in the next session. For each:

### [Short title]

The practice phrased as an in-session action (for example, "When the client..., ask..."). No books, courses, or general advice.

## Key Moments

2 to 3 moments with the most potential for the client (identity, values, fear, assumptions, meaning). For each, only a title and the client's words, with no commentary:

### [Short title]

> "The client's words" (timestamp if available)

---

Base everything on the transcript only. Do not reference any self-ratings or written reflections.`;

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  });
}

module.exports = { extractAudio, transcribe, generateAiReview };
