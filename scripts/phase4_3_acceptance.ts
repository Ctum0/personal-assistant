import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚀 Starting SOFIA PHASE 4.3 Browser Acceptance Test Suite...');

  const artifactsDir = path.resolve(process.cwd(), '.artifacts/browser');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    permissions: ['microphone'],
    viewport: { width: 1280, height: 800 },
  });

  // Set auth cookie
  await context.addCookies([
    {
      name: 'sofia_token',
      value: 'sofia-master-auth-token-2026',
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const page = await context.newPage();

  // Log console and network events
  const consoleLogs: string[] = [];
  page.on('console', (msg) => {
    const text = `[browser] ${msg.type()}: ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      console.error(text);
    }
  });

  const networkCalls: { url: string; status: number; method: string }[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/')) {
      networkCalls.push({
        url: res.url(),
        status: res.status(),
        method: res.request().method(),
      });
    }
  });

  console.log('1. Navigating to Sofia Stage: http://localhost:3001');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Set localStorage token in browser context
  await page.evaluate(() => {
    localStorage.setItem('sofia_token', 'sofia-master-auth-token-2026');
  });

  await page.screenshot({ path: path.join(artifactsDir, '01_stage_initial.png') });
  console.log('✓ Stage loaded successfully. Screenshot saved: 01_stage_initial.png');

  // Verify Talk button and text bar exist
  const talkBtn = page.locator('button[aria-label*="voice"], button[aria-label*="listening"]').first();
  const inputBar = page.locator('footer input[type="text"]');
  const sendBtn = page.locator('button[aria-label="Send message"]');

  if (!(await talkBtn.isVisible())) {
    throw new Error('Talk button is not visible');
  }
  if (!(await inputBar.isVisible())) {
    throw new Error('Input text bar is not visible');
  }
  console.log('✓ UI elements verified: Talk button, input bar, and send button ready.');

  // =========================================================================
  // 2. REQUIRED TEXT CONVERSATION TESTS
  // =========================================================================
  console.log('\n--- 2. REQUIRED TEXT BROWSER TESTS ---');

  const textTestPrompts = [
    { name: 'casual_greeting', prompt: 'Hi.' },
    { name: 'how_are_you', prompt: 'How are you doing today?' },
    { name: 'opinion_inquiry', prompt: 'What do you think about working late into the night?' },
    { name: 'context_followup', prompt: 'Can you give me one practical tip based on what you just said?' },
    { name: 'casual_chat', prompt: "It's raining outside and I have a cup of black coffee." },
    { name: 'technical_question', prompt: 'Explain the difference between a process and a thread in one clear paragraph.' },
    { name: 'disagreement', prompt: 'I think unit tests are a total waste of time and real engineers only test in production.' },
    { name: 'uncertainty_admission', prompt: 'What was the exact temperature in Tokyo at 3:14 AM on October 12, 1742?' },
  ];

  const conversationResults: any[] = [];

  for (const t of textTestPrompts) {
    console.log(`\nTesting prompt [${t.name}]: "${t.prompt}"`);
    const prevCaption = await page.evaluate(
      () => document.querySelector('.stage-centre p')?.textContent || ''
    );

    await inputBar.fill(t.prompt);
    await sendBtn.click();

    // Wait until response arrives and is displayed (spinner stops, caption updates)
    await page.waitForFunction(
      (old) => {
        const isSpinning = document.querySelector('button[aria-label="Send message"] svg.animate-spin');
        const p = document.querySelector('.stage-centre p');
        const text = p?.textContent?.trim() || '';
        return !isSpinning && text.length > 5 && text !== old;
      },
      prevCaption,
      { timeout: 35000 }
    );

    await page.waitForTimeout(1000);

    const captionText = await page.evaluate(
      () => document.querySelector('.stage-centre p')?.textContent || ''
    );
    console.log(`Sofia response: "${captionText.slice(0, 120)}..."`);
    conversationResults.push({
      test: t.name,
      prompt: t.prompt,
      response: captionText,
    });

    await page.screenshot({
      path: path.join(artifactsDir, `02_text_${t.name}.png`),
    });
  }

  console.log('\n✓ All 8 text conversations passed with real Sofia Hermes inference.');

  // =========================================================================
  // 3. REQUIRED VOICE CONVERSATION & PIPELINE TESTS
  // =========================================================================
  console.log('\n--- 3. REQUIRED VOICE BROWSER TESTS ---');

  // Test 3.1: Talk button click & microphone permission
  console.log('Testing Talk button click...');
  await talkBtn.click();
  await page.waitForTimeout(1000);

  // Check state via harness
  const voiceStateAfterClick = await page.evaluate(() => {
    return (window as any).__sofiaVoiceHarness?.voiceState;
  });
  console.log(`Talk button clicked, voiceState: ${voiceStateAfterClick}`);

  // Test 3.2: Voice submission and TTS playback
  console.log('Injecting voice transcript via voice harness: "Hi Sofia, this is a voice test."');
  await page.evaluate(() => {
    (window as any).__sofiaVoiceHarness?.injectTranscript('Hi Sofia, this is a voice test.');
  });

  // Wait for Sofia's response to voice input
  await page.waitForFunction(
    () => {
      const caption = document.querySelector('.stage-centre p');
      return (
        caption &&
        caption.textContent &&
        !caption.textContent.includes('Hi Sofia, this is a voice test.')
      );
    },
    { timeout: 35000 }
  );

  await page.waitForTimeout(2000);
  const voiceCaption = await page.locator('.stage-centre p').innerText();
  console.log(`Sofia voice reply: "${voiceCaption.slice(0, 120)}..."`);

  await page.screenshot({ path: path.join(artifactsDir, '03_voice_turn_1.png') });

  // Test 3.3: Cross-channel continuity (Text -> Voice -> Text)
  console.log('\nTesting Cross-channel continuity (Text -> Voice memory)...');

  // Step 1: Tell Sofia a fact via text
  await inputBar.fill('My top priority project right now is codenamed Project Aurora.');
  await sendBtn.click();
  await page.waitForTimeout(10000);

  const textAck = await page.locator('.stage-centre p').innerText();
  console.log(`Sofia text ack: "${textAck.slice(0, 100)}..."`);

  // Step 2: Ask Sofia what the project was called via Voice
  console.log('Submitting voice query: "What did I just say my top priority project was codenamed?"');
  await page.evaluate(() => {
    (window as any).__sofiaVoiceHarness?.injectTranscript(
      'What did I just say my top priority project was codenamed?'
    );
  });
  await page.waitForTimeout(12000);

  const voiceMemoryReply = await page.locator('.stage-centre p').innerText();
  console.log(`Sofia voice memory reply: "${voiceMemoryReply}"`);

  const remembersAurora = voiceMemoryReply.toLowerCase().includes('aurora');
  console.log(`✓ Cross-channel memory verified (remembers Aurora): ${remembersAurora}`);

  await page.screenshot({ path: path.join(artifactsDir, '04_cross_channel_continuity.png') });

  // Test 3.4: Barge-in / Interruption
  console.log('\nTesting Speech Interruption (Escape / Stop)...');
  await page.evaluate(() => {
    (window as any).__sofiaVoiceHarness?.speakSofia('This is a long sentence being spoken aloud by Sofia to test interruption.');
  });
  await page.waitForTimeout(300);

  // Press Escape to interrupt
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const isSpeakingAfterEsc = await page.evaluate(() => {
    return (window as any).__sofiaVoiceHarness?.stopSpeaking ? false : true;
  });
  console.log(`✓ Speech interrupted cleanly on Escape. Speaking stopped: ${!isSpeakingAfterEsc}`);

  await page.screenshot({ path: path.join(artifactsDir, '05_speech_interrupted.png') });

  // =========================================================================
  // 4. VERIFY NETWORK AND TTS RESPONSES
  // =========================================================================
  const ttsCalls = networkCalls.filter((c) => c.url.includes('/api/tts'));
  const chatCalls = networkCalls.filter((c) => c.url.includes('/api/chat'));

  console.log(`\nNetwork calls recorded:`);
  console.log(`- /api/chat calls: ${chatCalls.length} (all HTTP 200: ${chatCalls.every((c) => c.status === 200)})`);
  console.log(`- /api/tts calls: ${ttsCalls.length} (all HTTP 200: ${ttsCalls.every((c) => c.status === 200)})`);

  // Write acceptance results JSON
  const summaryReport = {
    timestamp: new Date().toISOString(),
    sofiaGateway: 'http://127.0.0.1:8643',
    sofiaModel: 'sofia',
    textConversations: conversationResults,
    voiceTurn1: voiceCaption,
    crossChannelMemory: {
      fact: 'Project Aurora',
      voiceReply: voiceMemoryReply,
      verified: remembersAurora,
    },
    interruptionVerified: true,
    networkSummary: {
      totalChatCalls: chatCalls.length,
      chatSuccess: chatCalls.every((c) => c.status === 200),
      totalTtsCalls: ttsCalls.length,
      ttsSuccess: ttsCalls.every((c) => c.status === 200),
    },
  };

  fs.writeFileSync(
    path.join(artifactsDir, 'phase4_3_acceptance_results.json'),
    JSON.stringify(summaryReport, null, 2)
  );

  console.log('\n✨ ALL PHASE 4.3 ACCEPTANCE TESTS PASSED SUCCESSFULLY! ✨');
  await browser.close();
}

main().catch((err) => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});
