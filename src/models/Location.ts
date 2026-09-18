import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { coordinatesSchema } from './shared.js';

export const LOCATION_TYPES = [
  'warehouse',
  'hub',
  'distribution_center',
  'origin',
  'destination',
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

const locationSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    type: { type: String, enum: LOCATION_TYPES, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    coordinates: { type: coordinatesSchema, required: true },
  },
  { timestamps: true },
);

locationSchema.index({ code: 1 }, { unique: true });
locationSchema.index({ city: 1, type: 1 });

export type ILocation = InferSchemaType<typeof locationSchema>;
export type LocationDocument = HydratedDocument<ILocation>;

export const Location = model('Location', locationSchema);
