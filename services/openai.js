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
      content: `Below is a raw transcript of a coaching session between a coach and their client.\n\nReformat it with speaker labels on each turn. Use exactly "Coach:" and "Client:" as labels — plain text, with no markdown formatting (no asterisks, no bold, no headings).\n- The coach typically asks questions, reflects back, and facilitates exploration.\n- The client shares their experience, challenges, and goals.\n\nReturn only the formatted transcript — no commentary, no preamble.\n\nRaw transcript:\n${rawTranscript}`,
    }],
  });
  return response.choices[0].message.content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').replace(/\*\*/g, '');
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

Use this exact structure. Use ## markdown headings for each main section (as shown below), and bold/italic for sub-labels within a section. Format as a clean professional document.

## Summary

In 1-2 paragraphs, focused on the COACH (not a recap of the client's situation):
- What was the coach's overall effectiveness?
- What stands out most about the coach's style?
- What appears to be the coach's single highest-leverage developmental edge (preview only — detailed below)?

## Dominant Coaching Strategy

Diagnose the coach's dominant, default strategy in this session — e.g., validation, encouragement, problem-solving, reflection, reassurance, information-giving, etc. A coach can have more than one, but identify the most dominant one or two.

For the dominant strategy:
- Describe what it looks like in this coach's practice, with specific examples/quotes.
- Benefits: what this strategy does well for the client and the relationship.
- Costs: what this strategy tends to crowd out, avoid, or limit when overused.

## Client Agendas

Based on the transcript, identify:

*Presenting Agenda*
[What the client wants to work on and the expected outcome.]

*Deeper Agenda*
[What is underneath the presenting agenda, and why it matters to the client.]

*Potential Transformational Agenda*
[Who the client is becoming — the deepest level of coaching available in this session.]

Then assess: at which of these levels was the coach actually working? Was that the appropriate level given where the client was, or did the coach stay shallower (or go deeper) than the client was ready for?

## Meta-Skills

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

## Coaching Strengths

Identify between 3 and 7 strengths — no fewer than 3, no more than 7. For each:

*[Strength title]*
- What the coach did.
- Why it worked.
- How it affected the client.
- Evidence from the transcript.

Focus on recurring strengths — patterns that showed up more than once — not isolated moments.

## Deepest Doorways

Identify 1-5 moments with the greatest transformational potential. For each:
- Quote the client's statement.
- Explain why it mattered.
- Explain what the coach did.
- Explain where the coaching might have gone if the coach had stayed there longer.
- Connect this moment to the coach's broader pattern: is this part of the dominant strategy/habit identified above, or a departure from it?

Focus on moments where identity, values, fear, assumptions, tension, purpose, or meaning emerged.

## The Highest-Leverage Developmental Edge

Do not list multiple developmental opportunities. Identify ONE single developmental edge — the one that, if shifted, would most improve this coach's effectiveness across sessions, not just this one.

Structure:

*Recurring Pattern*
[Describe the pattern as it showed up repeatedly throughout this session — cite at least 2-3 distinct moments/quotes as evidence, not just one isolated instance.]

*Why It Matters*
[Why this pattern, if it persists across sessions, caps the coach's growth or the client's depth of work. Connect to the dominant strategy and its costs identified earlier.]

*The Edge*
[Name the shift in one or two sentences — what would the coach do differently.]

## One Practice to Carry Forward

Replace generic suggestions with ONE concrete behavioral practice the coach can apply across the next several sessions (not just the next one). It should be specific enough that the coach knows exactly what to do differently in the moment.

Do NOT recommend books, workshops, courses, certifications, supervision, or other generic professional development activities.

Structure:

*The Practice*
[A specific, repeatable in-session behavior — phrased as an action, e.g., "When the client X, do Y instead of Z."]

*Success Metric*
[What a mentor could observe across future session recordings/transcripts that would indicate the coach is making this shift — be concrete enough to actually check for.]

---

Base your evaluation entirely on what you observe in the transcript. Do not reference any self-ratings or written reflections submitted separately.

Formatting: Write in clear, well-spaced prose and bullet points. Use a blank line between every paragraph, heading, and bullet list so the document is easy to scan — never run sections together.`;

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0].message.content;
  });
}

module.exports = { extractAudio, transcribe, generateAiReview };
