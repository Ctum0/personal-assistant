import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '@/lib/db';
import { hashSessionKey, registerRun, getRunRecord, listRunRecords } from '@/lib/hermes/registry';

describe('Unified Conversation Context & Session Mapping', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    initDatabase(db);
  });

  it('maps conversation IDs deterministically to isolated Hermes session references', () => {
    const masterSessionKey = 'production-hermes-master-key';
    const ref1 = hashSessionKey(`${masterSessionKey}:conv_research_project`);
    const ref2 = hashSessionKey(`${masterSessionKey}:conv_daily_routine`);
    const ref1Again = hashSessionKey(`${masterSessionKey}:conv_research_project`);

    expect(ref1).toHaveLength(16);
    expect(ref2).toHaveLength(16);
    expect(ref1).toBe(ref1Again);
    expect(ref1).not.toBe(ref2);
  });

  it('preserves shared Hermes session context across voice and text in the same conversation', () => {
    const conversationId = 'conv_unified_001';
    const sessionKeyRef = hashSessionKey(`master-key:${conversationId}`);

    // Voice turn dispatches task
    registerRun(db, {
      id: 'srun_voice_turn_1',
      hermesRunId: 'hrun_voice_1',
      conversationId,
      sessionKeyRef,
      userId: 'owner',
      status: 'completed',
      prompt: 'Remember our meeting at 3pm',
    });

    // Text turn in the same conversation
    registerRun(db, {
      id: 'srun_text_turn_2',
      hermesRunId: 'hrun_text_2',
      conversationId,
      sessionKeyRef,
      userId: 'owner',
      status: 'completed',
      prompt: 'When was our meeting again?',
    });

    // Verify both runs map to the same conversation and session key reference
    const runs = listRunRecords(db, { conversationId, userId: 'owner' });
    expect(runs).toHaveLength(2);
    expect(runs[0].session_key_ref).toBe(sessionKeyRef);
    expect(runs[1].session_key_ref).toBe(sessionKeyRef);
  });

  it('strictly isolates runs across different conversation IDs and enforces owner authorization', () => {
    const sessionKeyRefA = hashSessionKey('master-key:conv_A');
    const sessionKeyRefB = hashSessionKey('master-key:conv_B');

    registerRun(db, {
      id: 'srun_conv_a',
      hermesRunId: 'hrun_a',
      conversationId: 'conv_A',
      sessionKeyRef: sessionKeyRefA,
      userId: 'owner',
      status: 'completed',
      prompt: 'Task A',
    });

    registerRun(db, {
      id: 'srun_conv_b',
      hermesRunId: 'hrun_b',
      conversationId: 'conv_B',
      sessionKeyRef: sessionKeyRefB,
      userId: 'owner',
      status: 'completed',
      prompt: 'Task B',
    });

    // Scope check: conv_A only gets conv_A runs
    const runsA = listRunRecords(db, { conversationId: 'conv_A', userId: 'owner' });
    expect(runsA).toHaveLength(1);
    expect(runsA[0].id).toBe('srun_conv_a');

    const runsB = listRunRecords(db, { conversationId: 'conv_B', userId: 'owner' });
    expect(runsB).toHaveLength(1);
    expect(runsB[0].id).toBe('srun_conv_b');

    // IDOR check: unauthorized user cannot query runs
    const unauthorized = getRunRecord(db, 'srun_conv_a', 'attacker');
    expect(unauthorized).toBeNull();
  });
});
