import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { capacitySchema } from './shared.js';

export const ROUTE_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'delayed',
] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

const routeStopSchema = new Schema(
  {
    location: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    sequence: { type: Number, required: true },
    estimatedArrival: { type: Date, required: true },
    estimatedDeparture: { type: Date, required: true },
  },
  { _id: false },
);

const routeSchema = new Schema(
  {
    routeCode: { type: String, required: true },
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
    stops: { type: [routeStopSchema], default: [] },
    vehicle: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    distanceKm: { type: Number, required: true },
    estimatedDurationMinutes: { type: Number, required: true },
    scheduledDeparture: { type: Date, required: true },
    scheduledArrival: { type: Date, required: true },
    capacity: { type: capacitySchema, required: true },
    currentLoad: { type: capacitySchema, required: true },
    status: { type: String, enum: ROUTE_STATUSES, required: true },
  },
  { timestamps: true },
);

routeSchema.index({ routeCode: 1 }, { unique: true });
routeSchema.index({ origin: 1, destination: 1 });
routeSchema.index({ vehicle: 1 });
routeSchema.index({ status: 1, scheduledDeparture: 1 });

export type IRouteStop = InferSchemaType<typeof routeStopSchema>;
export type IRoute = InferSchemaType<typeof routeSchema>;
export type RouteDocument = HydratedDocument<IRoute>;

export const Route = model('Route', routeSchema);
