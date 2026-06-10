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
    });
    return addSpeakerLabels(client, result.text);
  });
}

async function addSpeakerLabels(client, rawTranscript) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `Below is a raw transcript of a coaching session between a coach and their client.\n\nReformat it with speaker labels on each turn. Use exactly "Coach:" and "Client:" as labels.\n- The coach typically asks questions, reflects back, and facilitates exploration.\n- The client shares their experience, challenges, and goals.\n\nReturn only the formatted transcript — no commentary, no preamble.\n\nRaw transcript:\n${rawTranscript}`,
    }],
  });
  return response.choices[0].message.content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
}

async function generateAiReview(assessment, transcript) {
  const client = getClient();
  const prompt = `You are an experienced coaching mentor reviewing a coaching session transcript.

Your audience is NOT the coach.

Your audience is the coach's mentor, who will use your observations to guide a mentoring conversation.

Provide an honest, nuanced assessment of the coaching.

Do not soften feedback unnecessarily. Do not inflate praise. Do not focus on encouragement. Focus on accurate diagnosis.

Assume the mentor wants to understand:
- What the coach does well.
- What the coach tends to do repeatedly.
- What coaching habits are helping.
- What coaching habits are limiting depth.
- What developmental edge would most improve the coach's effectiveness.

Refer to the coach as "the coach" and the other person as "the client."

Support observations with specific examples and quotes.

---

## SESSION TRANSCRIPT

${transcript}

---

## OUTPUT STRUCTURE

Use this exact structure. Use bold headings only — no large markdown headings (do not use # or ##). Format as a clean professional document.

**Summary**

In 1-3 paragraphs:
- What was the session really about?
- What was the coach's overall effectiveness?
- What stands out most about the coach's style?
- What appears to be the coach's primary developmental edge?

**Meta-Skills**

Assess the coach specifically on two meta-skills:

*Serve Not Fix (Coaching the Person, Not the Problem)*
- Was the coach working with the whole person or focused on solving the presenting problem?
- Were there moments of advice-giving, rescuing, or fixing disguised as coaching?
- Did the client do their own work, or did the coach do it for them?
- Specific examples from the transcript.

*Experiment and Learn*
- Did the coach try anything new, unexpected, or risky for the sake of the client?
- Was there evidence of following intuition or taking an exploratory risk?
- Or did the coach stay in comfortable, predictable patterns?
- Specific examples from the transcript.

**Coaching Strengths**

Identify between 3 and 7 strengths — no fewer than 3, no more than 7. For each:

*[Strength title]*
- What the coach did.
- Why it worked.
- How it affected the client.
- Evidence from the transcript.

Focus on recurring strengths, not isolated moments.

**Developmental Edges**

Identify between 3 and 5 developmental edges. For each:

*[Developmental edge title]*
- What the coach did.
- Why it may limit coaching effectiveness.
- What a more advanced coach might have done.
- Example questions or approaches that could have deepened the work.

**Deepest Doorways**

Identify 1-5 moments with the greatest transformational potential. For each:
- Quote the client's statement.
- Explain why it mattered.
- Explain what the coach did.
- Explain where the coaching might have gone if the coach had stayed there longer.

Focus on moments where identity, values, fear, assumptions, tension, purpose, or meaning emerged.

**Developmental Opportunities and Practices**

Identify 1-3 specific coaching behaviors that would most improve this coach's effectiveness based on what occurred in this session.

Do NOT recommend books, workshops, courses, certifications, supervision, reflective practice, or other generic professional development activities unless there is a clear and significant knowledge gap.

Each developmental opportunity must:
- Be directly tied to a specific observation from this session
- Focus on a coaching behavior, not coaching knowledge
- Be actionable in the coach's very next session
- Be phrased as a developmental practice, not an educational recommendation
- Prioritize high-leverage coaching fundamentals over advanced techniques
- Use concepts from the Upbuild methodology when relevant

For each developmental opportunity use this format:

*[Development Opportunity Title]*

Observation:
[What specifically happened in the session.]

Why It Matters:
[Why this limits coaching effectiveness.]

Developmental Practice:
[A concrete, specific practice the coach can implement in their next session — phrased as an action, not a recommendation to study or learn.]

---

Base your evaluation entirely on what you observe in the transcript. Do not reference any self-ratings or written reflections submitted separately.`;

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  });
}

module.exports = { extractAudio, transcribe, generateAiReview };
