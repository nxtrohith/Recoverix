import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { capacitySchema, recoveryScoresSchema } from './shared.js';

export const RECOVERY_OPTION_STATUSES = [
  'proposed',
  'selected',
  'rejected',
  'executing',
  'completed',
  'failed',
] as const;
export type RecoveryOptionStatus = (typeof RECOVERY_OPTION_STATUSES)[number];

const recoveryOptionSchema = new Schema(
  {
    recoveryCase: {
      type: Schema.Types.ObjectId,
      ref: 'RecoveryCase',
      required: true,
    },
    shipment: {
      type: Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
    },
    route: {
      type: Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
    },
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    pickupLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    dropoffLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    transferHubs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Location',
      },
    ],

    requiredCapacity: { type: capacitySchema, required: true },
    availableCapacity: { type: capacitySchema, required: true },

    estimatedCost: { type: Number, required: true },
    estimatedDeliveryTime: { type: Date, required: true },
    distanceKm: { type: Number, required: true },
    numberOfTransfers: { type: Number, required: true },
    deadlineBufferMinutes: { type: Number, required: true },
    resourceUtilizationPercent: { type: Number, required: true },

    scores: { type: recoveryScoresSchema, required: true },
    totalScore: { type: Number, required: true },
    rank: { type: Number, required: true },

    isFeasible: { type: Boolean, required: true },
    infeasibilityReasons: { type: [String], default: [] },
    status: { type: String, enum: RECOVERY_OPTION_STATUSES, required: true },
  },
  { timestamps: true },
);

recoveryOptionSchema.index({ recoveryCase: 1, rank: 1 });
recoveryOptionSchema.index({ shipment: 1 });
recoveryOptionSchema.index({ route: 1 });
recoveryOptionSchema.index({ totalScore: -1 });
recoveryOptionSchema.index({ isFeasible: 1, status: 1 });

export type IRecoveryOption = InferSchemaType<typeof recoveryOptionSchema>;
export type RecoveryOptionDocument = HydratedDocument<IRecoveryOption>;

export const RecoveryOption = model('RecoveryOption', recoveryOptionSchema);
