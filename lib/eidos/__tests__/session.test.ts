/**
 * Session state machine unit tests.
 *
 * These cover the rules a future second consumer will rely on: a
 * fresh session starts at week 1 / module 1.1, advance moves through
 * Phase 1's four modules in order, advance from the last module
 * marks the session complete, and pause/resume round-trip correctly.
 */

import { describe, it, expect } from "vitest";
import {
  initSession,
  advanceModule,
  pauseSession,
  resumeSession,
} from "../session/state-machine";

describe("session state machine", () => {
  it("initializes at week 1, module 1.1, in_progress", () => {
    const s = initSession("user-1");
    expect(s.userId).toBe("user-1");
    expect(s.currentWeek).toBe(1);
    expect(s.currentModuleId).toBe("1.1");
    expect(s.status).toBe("in_progress");
    expect(s.startedAt).not.toBeNull();
  });

  it("advances through Phase 1 modules in order", () => {
    let s = initSession("user-1");
    expect(s.currentModuleId).toBe("1.1");
    s = advanceModule(s);
    expect(s.currentModuleId).toBe("1.2");
    s = advanceModule(s);
    expect(s.currentModuleId).toBe("1.3");
    s = advanceModule(s);
    expect(s.currentModuleId).toBe("1.4");
  });

  it("marks the session complete when advancing past the last module", () => {
    let s = initSession("user-1");
    for (let i = 0; i < 4; i++) s = advanceModule(s);
    expect(s.status).toBe("complete");
    expect(s.currentModuleId).toBeNull();
  });

  it("is idempotent once complete", () => {
    let s = initSession("user-1");
    for (let i = 0; i < 5; i++) s = advanceModule(s);
    expect(s.status).toBe("complete");
    const again = advanceModule(s);
    expect(again).toBe(s);
  });

  it("pause sets paused; resume restores in_progress", () => {
    let s = initSession("user-1");
    s = pauseSession(s);
    expect(s.status).toBe("paused");
    s = resumeSession(s);
    expect(s.status).toBe("in_progress");
  });

  it("pause is a no-op on a complete session", () => {
    let s = initSession("user-1");
    for (let i = 0; i < 5; i++) s = advanceModule(s);
    const paused = pauseSession(s);
    expect(paused.status).toBe("complete");
  });

  it("resume is a no-op when not paused", () => {
    const s = initSession("user-1");
    const resumed = resumeSession(s);
    expect(resumed).toBe(s);
  });
});
