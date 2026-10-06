import { TestBed } from '@angular/core/testing';
import {
  EDIT_MODE_STORAGE,
  EditModeService,
  EditModeStorage,
  MEDIA_QUERY_FACTORY,
  MediaQueryFactory,
  MediaQueryMatcher,
} from './edit-mode.service';

/** A fake matcher whose `matches` + listeners can be driven from the test. */
class FakeMediaQueryMatcher implements MediaQueryMatcher {
  matches: boolean;
  private listeners: (() => void)[] = [];

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.push(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /** Simulate the viewport crossing the breakpoint. */
  set(matches: boolean): void {
    this.matches = matches;
    this.listeners.forEach((l) => l());
  }
}

class FakeStorage implements EditModeStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function configure(mobile: boolean, storage: EditModeStorage = new FakeStorage()) {
  const matcher = new FakeMediaQueryMatcher(mobile);
  const factory: MediaQueryFactory = (query) =>
    query === '(max-width: 720px)' ? matcher : undefined;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: MEDIA_QUERY_FACTORY, useValue: factory },
      { provide: EDIT_MODE_STORAGE, useValue: storage },
    ],
  });
  return { matcher, storage };
}

describe('EditModeService', () => {
  it('is always editing on desktop, regardless of persisted mobile state', () => {
    const { storage } = configure(false);
    storage.setItem('trip-planner.mobile-edit-mode', '1');
    const service = TestBed.inject(EditModeService);

    expect(service.isMobile()).toBe(false);
    expect(service.editing()).toBe(true);
    expect(service.readOnly()).toBe(false);
  });

  it('defaults to read mode on mobile', () => {
    configure(true);
    const service = TestBed.inject(EditModeService);

    expect(service.isMobile()).toBe(true);
    expect(service.editing()).toBe(false);
    expect(service.readOnly()).toBe(true);
  });

  it('startEditing persists and survives a new service instance', () => {
    const { storage } = configure(true);
    const service = TestBed.inject(EditModeService);

    service.startEditing();
    expect(service.editing()).toBe(true);
    expect(storage.getItem('trip-planner.mobile-edit-mode')).toBe('1');

    // A fresh service instance (e.g. after a reload) picks up the same storage.
    configure(true, storage);
    const reloaded = TestBed.inject(EditModeService);
    expect(reloaded.editing()).toBe(true);
  });

  it('stopEditing clears the persisted state', () => {
    const { storage } = configure(true);
    const service = TestBed.inject(EditModeService);

    service.startEditing();
    service.stopEditing();
    expect(service.editing()).toBe(false);
    expect(storage.getItem('trip-planner.mobile-edit-mode')).toBeNull();
  });

  it('reacts to the viewport crossing the breakpoint', () => {
    const { matcher } = configure(false);
    const service = TestBed.inject(EditModeService);
    expect(service.editing()).toBe(true); // desktop

    matcher.set(true); // viewport shrinks to mobile
    expect(service.isMobile()).toBe(true);
    expect(service.editing()).toBe(false); // mobile default: read mode
  });

  it('does not crash when storage throws on read or write', () => {
    const throwing: EditModeStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    configure(true, throwing);
    const service = TestBed.inject(EditModeService);

    expect(service.editing()).toBe(false);
    expect(() => service.startEditing()).not.toThrow();
    expect(service.editing()).toBe(true);
    expect(() => service.stopEditing()).not.toThrow();
    expect(service.editing()).toBe(false);
  });

  it('treats a missing matchMedia (e.g. jsdom) as desktop', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MEDIA_QUERY_FACTORY, useValue: (() => undefined) as MediaQueryFactory },
        { provide: EDIT_MODE_STORAGE, useValue: new FakeStorage() },
      ],
    });
    const service = TestBed.inject(EditModeService);
    expect(service.isMobile()).toBe(false);
    expect(service.editing()).toBe(true);
  });
});
