import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DetailsContent } from './details-content';
import { DetailsAction, DetailsDialogData } from './details-types';

export type { DetailsAction, DetailsDialogData, DetailsKind } from './details-types';

/**
 * Desktop host for the shared details content (R8): a plain `MatDialog`
 * wrapping `DetailsContent`. On phones `TripActionsService` opens
 * `DetailsSheet` (a `MatBottomSheet`) instead — see "Dialogs" in CLAUDE.md.
 * Both forward the same `DetailsDialogData` and resolve to the same
 * `DetailsAction | undefined`.
 */
@Component({
  selector: 'app-details-dialog',
  imports: [MatDialogModule, DetailsContent],
  templateUrl: './details-dialog.html',
})
export class DetailsDialog {
  readonly data = inject<DetailsDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DetailsDialog, DetailsAction>);

  onAction(action: DetailsAction): void {
    this.dialogRef.close(action);
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
