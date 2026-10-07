import { Component, inject } from '@angular/core';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetModule,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { DetailsContent } from './details-content';
import { DetailsAction, DetailsDialogData } from './details-types';

/**
 * Mobile host for the shared details content (R8): a `MatBottomSheet`
 * wrapping the same `DetailsContent` the desktop `DetailsDialog` uses, with a
 * decorative drag-handle bar (Material's bottom sheet doesn't draw one on its
 * own). `TripActionsService` picks this over `DetailsDialog` below the
 * `$mobile` breakpoint — see "Dialogs" in CLAUDE.md. Resolves the same
 * `DetailsAction | undefined` via `afterDismissed()`.
 */
@Component({
  selector: 'app-details-sheet',
  imports: [MatBottomSheetModule, DetailsContent],
  templateUrl: './details-sheet.html',
  styleUrl: './details-sheet.scss',
})
export class DetailsSheet {
  readonly data = inject<DetailsDialogData>(MAT_BOTTOM_SHEET_DATA);
  private readonly sheetRef = inject(MatBottomSheetRef<DetailsSheet, DetailsAction>);

  onAction(action: DetailsAction): void {
    this.sheetRef.dismiss(action);
  }

  onClose(): void {
    this.sheetRef.dismiss();
  }
}
