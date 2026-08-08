import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// happy-dom has no real media pipeline. play() must resolve for the
// component's `video.play().catch(...)` to settle, and load() must exist
// for the teardown path (removeAttribute('src') + load()). Both are mocked
// on the prototype so tests can assert on them via the <video> element.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
HTMLMediaElement.prototype.load = vi.fn();
