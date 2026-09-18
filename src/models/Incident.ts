import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const INCIDENT_TYPES = [
  'MISPLACED_SHIPMENT',
  'VEHICLE_DELAY',
  'ROUTE_DEVIATION',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_STATUSES = [
  'OPEN',
  'RECOVERY_REQUIRED',
  'ASSIGNED',
  'PICKUP_CONFIRMED',
  'RESOLVED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

const incidentSchema = new Schema(
  {
    incidentId: { type: String, required: true },
    shipment: {
      type: Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
    },
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: false,
    },
    incidentType: { type: String, enum: INCIDENT_TYPES, required: true },
    hub: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    status: { type: String, enum: INCIDENT_STATUSES, required: true },
    // Assignment snapshot (from recovery engine candidate — not a second scorer)
    selectedCandidateId: { type: String, required: false },
    recoveryVehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: false,
    },
    // Hackathon: vehicle number is the driver handle (no separate Driver entity)
    recoveryDriverId: { type: String, required: false },
    recoveryPath: { type: [String], default: [] },
    pickupCase: { type: String, required: false },
    pickupNode: { type: String, required: false },
    destinationNode: { type: String, required: false },
    recoveryScore: { type: Number, required: false },
    assignedAt: { type: Date, required: false },
    pickupConfirmedAt: { type: Date, required: false },
    recoveryCase: {
      type: Schema.Types.ObjectId,
      ref: 'RecoveryCase',
      required: false,
    },
    // Persisted selected RecoveryOption (set on analyze when a plan exists)
    selectedRecoveryOption: {
      type: Schema.Types.ObjectId,
      ref: 'RecoveryOption',
      required: false,
    },
    driverMessage: { type: String, required: false },
    analysisStatus: { type: String, required: false },
    resolvedAt: { type: Date, required: false },
  },
  { timestamps: true },
);

incidentSchema.index({ incidentId: 1 }, { unique: true });
incidentSchema.index({ shipment: 1, status: 1 });
incidentSchema.index({ status: 1, createdAt: -1 });

export type IIncident = InferSchemaType<typeof incidentSchema>;
export type IncidentDocument = HydratedDocument<IIncident>;

export const Incident = model('Incident', incidentSchema);
