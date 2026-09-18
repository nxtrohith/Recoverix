import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const SHIPMENT_EVENT_TYPES = [
  'created',
  'picked_up',
  'in_transit',
  'arrived_hub',
  'departed_hub',
  'delivered',
  'misplaced',
  'recovery_started',
  'recovery_pickup_confirmed',
  'recovered',
  'status_update',
] as const;
export type ShipmentEventType = (typeof SHIPMENT_EVENT_TYPES)[number];

const shipmentEventSchema = new Schema(
  {
    shipment: {
      type: Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
    },
    type: { type: String, enum: SHIPMENT_EVENT_TYPES, required: true },
    location: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    route: {
      type: Schema.Types.ObjectId,
      ref: 'Route',
      required: false,
    },
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: false,
    },
    timestamp: { type: Date, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true },
);

shipmentEventSchema.index({ shipment: 1, timestamp: -1 });
shipmentEventSchema.index({ type: 1 });

export type IShipmentEvent = InferSchemaType<typeof shipmentEventSchema>;
export type ShipmentEventDocument = HydratedDocument<IShipmentEvent>;

export const ShipmentEvent = model('ShipmentEvent', shipmentEventSchema);
