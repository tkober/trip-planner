import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/** The four desktop timeline views from the design (#44). */
export type TimelineViewModeId = 'list' | 'columns' | 'week' | 'map';

export interface TimelineViewModeOption {
  readonly mode: TimelineViewModeId;
  readonly label: string;
  readonly icon: string;
}

/** Every view mode the design calls for — only a subset is wired up yet, see
 * `available` below. Order matches the segmented control (List · Columns ·
 * Week · Map). */
const ALL_MODES: readonly TimelineViewModeOption[] = [
  { mode: 'list', label: 'List', icon: 'view_agenda' },
  { mode: 'columns', label: 'Columns', icon: 'view_column' },
  { mode: 'week', label: 'Week', icon: 'calendar_view_week' },
  { mode: 'map', label: 'Map', icon: 'map' },
];

const STORAGE_KEY = 'trip-planner.timeline-view';

/** The slice of `localStorage` this service needs (pattern from `EditModeService`). */
export interface TimelineViewModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage: TimelineViewModeStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/** Injection token so tests can supply an in-memory storage instead of `localStorage`. */
export const TIMELINE_VIEW_MODE_STORAGE =
  new InjectionToken<TimelineViewModeStorage>('TIMELINE_VIEW_MODE_STORAGE', {
    factory: () => defaultStorage,
  });

/**
 * Desktop timeline view switcher (issue #45, part of the #44 epic): which of
 * List / Columns / Week / Map renders the Timeline route, persisted per
 * device in `localStorage` (key `trip-planner.timeline-view`), following the
 * same injectable-storage pattern as `EditModeService`.
 *
 * Only `'list'` is wired up in this issue — `available` is the single gate
 * both the segmented control (`TripPage`) and `TimelineHost`'s `@switch` read,
 * so the remaining options simply don't exist yet (not shown disabled); D3,
 * D4 and D6 add them one at a time. A stored value that is unknown or not
 * (yet) available falls back to `'list'`.
 */
@Injectable({ providedIn: 'root' })
export class TimelineViewModeService {
  private readonly storage = inject(TIMELINE_VIEW_MODE_STORAGE);

  /** Options the segmented control actually renders — grows with D3/D4/D6. */
  readonly available: readonly TimelineViewModeOption[] = ALL_MODES.filter(
    (option) => option.mode === 'list',
  );

  readonly mode = signal<TimelineViewModeId>(this.readPersisted());

  setMode(mode: TimelineViewModeId): void {
    if (!this.isAvailable(mode)) return;
    this.mode.set(mode);
    this.persist(mode);
  }

  private isAvailable(mode: string): mode is TimelineViewModeId {
    return this.available.some((option) => option.mode === mode);
  }

  private readPersisted(): TimelineViewModeId {
    try {
      const stored = this.storage.getItem(STORAGE_KEY);
      return stored && this.isAvailable(stored)
        ? (stored as TimelineViewModeId)
        : 'list';
    } catch {
      return 'list';
    }
  }

  private persist(mode: TimelineViewModeId): void {
    try {
      this.storage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage unavailable (private mode, quota) — choice just won't survive a reload.
    }
  }
}
