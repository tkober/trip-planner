import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { toBlob } from 'html-to-image';
import { ExportService, ExportTarget } from '../../services/export.service';
import { TripExportDocument } from './trip-export-document';
import { downloadBlob, slugify } from '../../shared/download';

/**
 * Mounted once in the trip-page shell. Watches `ExportService.target`: when set
 * it renders a `TripExportDocument` off-screen, waits for fonts + layout, then
 * either captures the timeline to a PNG download or drives the browser print
 * dialog (PDF). Reports completion back to the service so the action promise
 * resolves. Rendered off-screen on screen (see `.export-host` in styles.scss).
 */
@Component({
  selector: 'app-export-host',
  imports: [TripExportDocument],
  template: `
    @if (exportService.target(); as t) {
      <div class="export-host">
        <app-trip-export-document #doc [trip]="t.trip" [anonymized]="t.anonymized" />
      </div>
    }
  `,
})
export class ExportHost {
  readonly exportService = inject(ExportService);

  private readonly docEl = viewChild('doc', { read: ElementRef<HTMLElement> });
  private active?: ExportTarget;

  constructor() {
    effect(() => {
      const target = this.exportService.target();
      const el = this.docEl()?.nativeElement;
      if (!target) {
        this.active = undefined;
        return;
      }
      // Run once per target, after the document element has rendered.
      if (el && target !== this.active) {
        this.active = target;
        void this.process(target, el);
      }
    });
  }

  private async process(target: ExportTarget, docEl: HTMLElement): Promise<void> {
    try {
      await this.waitForLayout();
      if (target.mode === 'png') await this.capturePng(target, docEl);
      else await this.printDocument();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      this.exportService.done();
    }
  }

  /** Ensure web fonts are loaded and the off-screen layout has settled. */
  private waitForLayout(): Promise<void> {
    return document.fonts.ready.then(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }

  private async capturePng(target: ExportTarget, docEl: HTMLElement): Promise<void> {
    const node = docEl.querySelector<HTMLElement>('.timeline-capture');
    if (!node) return;
    const blob = await toBlob(node, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
    if (blob) {
      downloadBlob(blob, `${slugify(target.trip.title) || 'trip'}-timeline.png`);
    }
  }

  private printDocument(): Promise<void> {
    return new Promise<void>((resolve) => {
      const cleanup = () => {
        document.documentElement.classList.remove('printing-export');
        window.removeEventListener('afterprint', cleanup);
        resolve();
      };
      window.addEventListener('afterprint', cleanup);
      document.documentElement.classList.add('printing-export');
      requestAnimationFrame(() => window.print());
    });
  }
}
