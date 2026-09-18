import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const SHIPMENT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type ShipmentPriority = (typeof SHIPMENT_PRIORITIES)[number];

export const SHIPMENT_STATUSES = [
  'pending',
  'in_transit',
  'delivered',
  'misplaced',
  'delayed',
  'cancelled',
  'recovered',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const shipmentSchema = new Schema(
  {
    trackingNumber: { type: String, required: true },
    origin: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    destination: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    currentLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    weight: { type: Number, required: true },
    volume: { type: Number, required: true },
    packageCount: { type: Number, required: true },
    priority: { type: String, enum: SHIPMENT_PRIORITIES, required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    assignedRoute: {
      type: Schema.Types.ObjectId,
      ref: 'Route',
      required: false,
    },
    assignedVehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: false,
    },
    fragile: { type: Boolean, required: true, default: false },
    specialHandling: { type: String, required: false },
  },
  { timestamps: true },
);

shipmentSchema.index({ trackingNumber: 1 }, { unique: true });
shipmentSchema.index({ status: 1, deadline: 1 });
shipmentSchema.index({ assignedRoute: 1 });
shipmentSchema.index({ currentLocation: 1 });

export type IShipment = InferSchemaType<typeof shipmentSchema>;
export type ShipmentDocument = HydratedDocument<IShipment>;

export const Shipment = model('Shipment', shipmentSchema);
