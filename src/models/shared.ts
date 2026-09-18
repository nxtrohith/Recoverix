import { Schema } from 'mongoose';

/** Weight (kg) and volume (m³) capacity pair used across vehicles, routes, and recovery options. */
export interface ICapacity {
  weight: number;
  volume: number;
}

export const capacitySchema = new Schema<ICapacity>(
  {
    weight: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  { _id: false },
);

/** Geographic coordinates for a location. */
export interface ICoordinates {
  latitude: number;
  longitude: number;
}

export const coordinatesSchema = new Schema<ICoordinates>(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  { _id: false },
);

/** Multi-criteria scores used to rank recovery options. */
export interface IRecoveryScores {
  cost: number;
  deliveryTime: number;
  capacity: number;
  deadline: number;
  priority: number;
  resourceUtilization: number;
}

export const recoveryScoresSchema = new Schema<IRecoveryScores>(
  {
    cost: { type: Number, required: true },
    deliveryTime: { type: Number, required: true },
    capacity: { type: Number, required: true },
    deadline: { type: Number, required: true },
    priority: { type: Number, required: true },
    resourceUtilization: { type: Number, required: true },
  },
  { _id: false },
);
