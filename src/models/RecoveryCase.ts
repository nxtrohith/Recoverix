import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const RECOVERY_REASONS = [
  'wrong_hub',
  'missed_connection',
  'scan_error',
  'route_deviation',
  'other',
] as const;
export type RecoveryReason = (typeof RECOVERY_REASONS)[number];

export const RECOVERY_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type RecoverySeverity = (typeof RECOVERY_SEVERITIES)[number];

export const RECOVERY_CASE_STATUSES = [
  'open',
  'options_generated',
  'option_selected',
  'in_progress',
  'resolved',
  'closed',
] as const;
export type RecoveryCaseStatus = (typeof RECOVERY_CASE_STATUSES)[number];

const recoveryCaseSchema = new Schema(
  {
    shipment: {
      type: Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
    },
    detectedAt: { type: Date, required: true },
    detectedLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    reason: { type: String, enum: RECOVERY_REASONS, required: true },
    severity: { type: String, enum: RECOVERY_SEVERITIES, required: true },
    status: { type: String, enum: RECOVERY_CASE_STATUSES, required: true },
    selectedOption: {
      type: Schema.Types.ObjectId,
      ref: 'RecoveryOption',
      required: false,
    },
    resolvedAt: { type: Date, required: false },
  },
  { timestamps: true },
);

recoveryCaseSchema.index({ shipment: 1 });
recoveryCaseSchema.index({ status: 1, severity: 1 });
recoveryCaseSchema.index({ detectedAt: -1 });

export type IRecoveryCase = InferSchemaType<typeof recoveryCaseSchema>;
export type RecoveryCaseDocument = HydratedDocument<IRecoveryCase>;

export const RecoveryCase = model('RecoveryCase', recoveryCaseSchema);
