import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { capacitySchema } from './shared.js';

export const VEHICLE_TYPES = ['truck', 'van', 'trailer', 'container'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_STATUSES = [
  'available',
  'in_transit',
  'loading',
  'maintenance',
  'out_of_service',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

const vehicleSchema = new Schema(
  {
    vehicleNumber: { type: String, required: true },
    type: { type: String, enum: VEHICLE_TYPES, required: true },
    capacity: { type: capacitySchema, required: true },
    currentLoad: { type: capacitySchema, required: true },
    currentLocation: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    status: { type: String, enum: VEHICLE_STATUSES, required: true },
    currentRoute: {
      type: Schema.Types.ObjectId,
      ref: 'Route',
      required: false,
    },
  },
  { timestamps: true },
);

vehicleSchema.index({ vehicleNumber: 1 }, { unique: true });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ currentLocation: 1 });

export type IVehicle = InferSchemaType<typeof vehicleSchema>;
export type VehicleDocument = HydratedDocument<IVehicle>;

export const Vehicle = model('Vehicle', vehicleSchema);
