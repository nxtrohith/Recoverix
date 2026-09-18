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

const componentScoresSchema = new Schema(
  {
    time: { type: Number, required: false },
    cost: { type: Number, required: false },
    capacity: { type: Number, required: false },
    deadline: { type: Number, required: false },
    priority: { type: Number, required: false },
    detour: { type: Number, required: false },
    connectivity: { type: Number, required: false },
  },
  { _id: false },
);

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
    // Optional: piggyback may use an existing route, or only a recovery path
    route: {
      type: Schema.Types.ObjectId,
      ref: 'Route',
      required: false,
    },
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    // Demo incident that produced this analysis (when present)
    incident: {
      type: Schema.Types.ObjectId,
      ref: 'Incident',
      required: false,
    },
    // Scorer identity / classification (not fabricated)
    candidateId: { type: String, required: false },
    pickupCase: { type: String, required: false }, // at_node | pass_through | detour
    recoveryPath: { type: [String], default: [] },
    existingRouteNodes: { type: [String], default: [] },
    vehicleToPickupPath: { type: [String], default: [] },
    vehicleToDestinationPath: { type: [String], default: [] },
    pickupNode: { type: String, required: false },
    destinationNode: { type: String, required: false },
    // Hackathon: vehicle number is the driver handle
    driverId: { type: String, required: false },

    pickupLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: false,
    },
    dropoffLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: false,
    },
    transferHubs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Location',
      },
    ],

    requiredCapacity: { type: capacitySchema, required: false },
    availableCapacity: { type: capacitySchema, required: false },

    estimatedCost: { type: Number, required: false },
    // Prefer estimatedTravelTimeMin from the scorer; do not invent a wall-clock ETA
    estimatedDeliveryTime: { type: Date, required: false },
    estimatedTravelTimeMin: { type: Number, required: false },
    distanceKm: { type: Number, required: false },
    numberOfTransfers: { type: Number, required: false },
    deadlineBufferMinutes: { type: Number, required: false },
    resourceUtilizationPercent: { type: Number, required: false },

    scores: { type: recoveryScoresSchema, required: false },
    // Scorer component breakdown (time/cost/…/detour/connectivity)
    componentScores: { type: componentScoresSchema, required: false },
    explanation: { type: String, required: false },
    totalScore: { type: Number, required: false },
    rank: { type: Number, required: false },

    isFeasible: { type: Boolean, required: true },
    infeasibilityReasons: { type: [String], default: [] },
    status: { type: String, enum: RECOVERY_OPTION_STATUSES, required: true },
  },
  { timestamps: true },
);

recoveryOptionSchema.index({ recoveryCase: 1, rank: 1 });
recoveryOptionSchema.index({ recoveryCase: 1, status: 1 });
recoveryOptionSchema.index({ shipment: 1 });
recoveryOptionSchema.index({ incident: 1 });
recoveryOptionSchema.index({ candidateId: 1 });
recoveryOptionSchema.index({ route: 1 });
recoveryOptionSchema.index({ totalScore: -1 });
recoveryOptionSchema.index({ isFeasible: 1, status: 1 });

export type IRecoveryOption = InferSchemaType<typeof recoveryOptionSchema>;
export type RecoveryOptionDocument = HydratedDocument<IRecoveryOption>;

export const RecoveryOption = model('RecoveryOption', recoveryOptionSchema);
