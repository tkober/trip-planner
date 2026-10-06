import {
  computed,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';

/** 720px = `$mobile` in `src/app/shared/_breakpoints.scss`. */
export const MOBILE_EDIT_QUERY = '(max-width: 720px)';

const STORAGE_KEY = 'trip-planner.mobile-edit-mode';

/** The slice of `window.matchMedia`'s result this service needs. */
export interface MediaQueryMatcher {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Builds the `MediaQueryMatcher` for a query string, or `undefined` in an
 * environment without `matchMedia` (e.g. jsdom in tests) — treated as desktop.
 */
export type MediaQueryFactory = (
  query: string,
) => MediaQueryMatcher | undefined;

const defaultMediaQueryFactory: MediaQueryFactory = (query) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : undefined;

/** Injection token so tests can supply a fake matcher instead of `window.matchMedia`. */
export const MEDIA_QUERY_FACTORY = new InjectionToken<MediaQueryFactory>(
  'MEDIA_QUERY_FACTORY',
  { factory: () => defaultMediaQueryFactory },
);

/** The slice of `localStorage` this service needs. */
export interface EditModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStorage: EditModeStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

/** Injection token so tests can supply an in-memory storage instead of `localStorage`. */
export const EDIT_MODE_STORAGE = new InjectionToken<EditModeStorage>(
  'EDIT_MODE_STORAGE',
  { factory: () => defaultStorage },
);

/**
 * Drives the mobile read/edit mode (issue #21): on phones, drag & drop and the
 * other editing affordances (add button, kebab menus, day-marker menu) are
 * hidden by default to stop accidental drags while scrolling — the user opts
 * into "Editing" explicitly and it persists (via `localStorage`, key
 * `trip-planner.mobile-edit-mode`) across reloads until they tap "Done".
 * Desktop is **always** editing; this service only ever restricts mobile.
 *
 * There is no auto-lock / inactivity timeout by design.
 */
@Injectable({ providedIn: 'root' })
export class EditModeService {
  private readonly mediaQueryFactory = inject(MEDIA_QUERY_FACTORY);
  private readonly storage = inject(EDIT_MODE_STORAGE);

  /** Whether the viewport matches the mobile breakpoint. */
  readonly isMobile = signal(
    this.mediaQueryFactory(MOBILE_EDIT_QUERY)?.matches ?? false,
  );

  /** Mobile-only: whether the user has opted into editing. Irrelevant on desktop. */
  private readonly mobileEditing = signal(this.readPersistedEditing());

  /** Desktop is always editing; mobile defaults to read-only until opted in. */
  readonly editing = computed(() => !this.isMobile() || this.mobileEditing());
  readonly readOnly = computed(() => !this.editing());

  constructor() {
    const mq = this.mediaQueryFactory(MOBILE_EDIT_QUERY);
    mq?.addEventListener('change', () => this.isMobile.set(mq.matches));
  }

  startEditing(): void {
    this.mobileEditing.set(true);
    this.persist(true);
  }

  stopEditing(): void {
    this.mobileEditing.set(false);
    this.persist(false);
  }

  private readPersistedEditing(): boolean {
    try {
      return this.storage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private persist(editing: boolean): void {
    try {
      if (editing) this.storage.setItem(STORAGE_KEY, '1');
      else this.storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode, quota) — mode just won't survive a reload.
    }
  }
}
