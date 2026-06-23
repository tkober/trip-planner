import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AnonymizeOptions } from '../../shared/export/anonymize';

export type ExportFormat = 'png' | 'pdf' | 'md';

export interface ExportDialogResult {
  format: ExportFormat;
  /** Null when anonymization is off; otherwise the chosen categories. */
  anonymize: AnonymizeOptions | null;
}

/** Choose an export format and, optionally, which sensitive fields to black out. */
@Component({
  selector: 'app-export-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatIconModule,
  ],
  templateUrl: './export-dialog.html',
  styles: [
    `
      mat-dialog-content {
        min-width: 360px;
        max-width: 460px;
      }
      .format-group {
        display: flex;
        margin: 0.5rem 0;
      }
      .format-group mat-button-toggle {
        flex: 1;
      }
      .format-note {
        margin: 0 0 1rem;
        font-size: 0.85rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .anon-options {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin: 0.75rem 0 0.25rem 0.25rem;
      }
    `,
  ],
})
export class ExportDialog {
  private readonly dialogRef =
    inject<MatDialogRef<ExportDialog, ExportDialogResult>>(MatDialogRef);

  readonly format = signal<ExportFormat>('pdf');
  readonly anonymize = signal(false);
  // Defaults when anonymization is enabled (locations off — it's the aggressive one).
  readonly flightNumbers = signal(true);
  readonly addresses = signal(true);
  readonly notes = signal(true);
  readonly locations = signal(false);
  readonly costs = signal(true);

  confirm(): void {
    this.dialogRef.close({
      format: this.format(),
      anonymize: this.anonymize()
        ? {
            flightNumbers: this.flightNumbers(),
            addresses: this.addresses(),
            notes: this.notes(),
            locations: this.locations(),
            costs: this.costs(),
          }
        : null,
    });
  }
}
