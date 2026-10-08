import { TestBed } from '@angular/core/testing';
import {
  TIMELINE_VIEW_MODE_STORAGE,
  TimelineViewModeService,
  TimelineViewModeStorage,
} from './timeline-view-mode.service';

class FakeStorage implements TimelineViewModeStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function configure(storage: TimelineViewModeStorage = new FakeStorage()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: TIMELINE_VIEW_MODE_STORAGE, useValue: storage }],
  });
  return storage;
}

describe('TimelineViewModeService', () => {
  it('defaults to list with nothing persisted', () => {
    configure();
    const service = TestBed.inject(TimelineViewModeService);

    expect(service.mode()).toBe('list');
  });

  it('only list is available in this issue', () => {
    configure();
    const service = TestBed.inject(TimelineViewModeService);

    expect(service.available.map((o) => o.mode)).toEqual(['list']);
  });

  it('persists a mode change and survives a new service instance', () => {
    const storage = configure();
    const service = TestBed.inject(TimelineViewModeService);

    service.setMode('list');
    expect(storage.getItem('trip-planner.timeline-view')).toBe('list');

    configure(storage);
    const reloaded = TestBed.inject(TimelineViewModeService);
    expect(reloaded.mode()).toBe('list');
  });

  it('ignores a mode that is not (yet) available', () => {
    const storage = configure();
    const service = TestBed.inject(TimelineViewModeService);

    service.setMode('columns' as never);
    expect(service.mode()).toBe('list');
    expect(storage.getItem('trip-planner.timeline-view')).toBeNull();
  });

  it('falls back to list for an unavailable value found in storage', () => {
    const storage = configure();
    storage.setItem('trip-planner.timeline-view', 'map');
    const service = TestBed.inject(TimelineViewModeService);

    expect(service.mode()).toBe('list');
  });

  it('falls back to list for an unknown value found in storage', () => {
    const storage = configure();
    storage.setItem('trip-planner.timeline-view', 'garbage');
    const service = TestBed.inject(TimelineViewModeService);

    expect(service.mode()).toBe('list');
  });

  it('does not crash when storage throws on read or write', () => {
    const throwing: TimelineViewModeStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    configure(throwing);
    const service = TestBed.inject(TimelineViewModeService);

    expect(service.mode()).toBe('list');
    expect(() => service.setMode('list')).not.toThrow();
  });
});
