import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectHevcSupport, isHevcSupported, resetHevcSupportCache } from './codecSupport';

/** Replaces window.MediaSource for one test; restored in afterEach. */
const stubMediaSource = (isTypeSupported) => {
  vi.stubGlobal('MediaSource', isTypeSupported ? { isTypeSupported } : undefined);
};

/** Makes every <video> created during a test answer canPlayType this way. */
const stubCanPlayType = (impl) => {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(impl);
};

describe('src/utils/codecSupport', () => {
  beforeEach(() => {
    resetHevcSupportCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('detectHevcSupport', () => {
    it('reports supported when MediaSource accepts an HEVC type', () => {
      stubMediaSource((type) => type.includes('hev1'));
      expect(detectHevcSupport()).toBe(true);
    });

    it('accepts the hvc1 flavor alone (Apple platforms reject hev1)', () => {
      stubMediaSource((type) => type.includes('hvc1'));
      expect(detectHevcSupport()).toBe(true);
    });

    it('reports unsupported when both probes reject HEVC', () => {
      stubMediaSource(() => false);
      stubCanPlayType(() => '');
      expect(detectHevcSupport()).toBe(false);
    });

    it('falls back to canPlayType when MSE rejects but native decode works', () => {
      stubMediaSource(() => false);
      stubCanPlayType(() => 'probably');
      expect(detectHevcSupport()).toBe(true);
    });

    it("treats a canPlayType 'maybe' as unsupported — it is a container-only guess", () => {
      stubMediaSource(() => false);
      stubCanPlayType(() => 'maybe');
      expect(detectHevcSupport()).toBe(false);
    });

    it('only probes HEVC types, never H.264', () => {
      const seen = [];
      stubMediaSource((type) => {
        seen.push(type);
        return false;
      });
      stubCanPlayType(() => '');
      detectHevcSupport();
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((type) => /hev1|hvc1/.test(type))).toBe(true);
      expect(seen.some((type) => type.includes('avc1'))).toBe(false);
    });

    // An unknown answer must not warn the viewer: a false alarm on a browser
    // that plays fine is worse than staying silent.
    it('assumes supported when MediaSource is absent and canPlayType is unusable', () => {
      stubMediaSource(undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => {
        throw new Error('unavailable');
      });
      expect(detectHevcSupport()).toBe(true);
    });

    it('assumes supported when a throwing MSE probe is the only signal', () => {
      stubMediaSource(() => {
        throw new Error('InvalidStateError');
      });
      vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => {
        throw new Error('unavailable');
      });
      expect(detectHevcSupport()).toBe(true);
    });

    it('still trusts canPlayType when the MSE probe throws', () => {
      stubMediaSource(() => {
        throw new Error('InvalidStateError');
      });
      stubCanPlayType(() => '');
      expect(detectHevcSupport()).toBe(false);
    });
  });

  describe('isHevcSupported', () => {
    it('probes once and reuses the answer', () => {
      const isTypeSupported = vi.fn(() => true);
      stubMediaSource(isTypeSupported);

      expect(isHevcSupported()).toBe(true);
      const callsAfterFirst = isTypeSupported.mock.calls.length;
      expect(isHevcSupported()).toBe(true);

      expect(isTypeSupported.mock.calls.length).toBe(callsAfterFirst);
    });

    it('caches a negative result too', () => {
      stubMediaSource(() => false);
      stubCanPlayType(() => '');
      expect(isHevcSupported()).toBe(false);
      expect(isHevcSupported()).toBe(false);
    });
  });
});
