import { CAR_DEPTH } from './valley-runner.js';
import { SPEED } from './valley-terrain.js';

// Behind the camera, including the nose of the mesh. Transitions follow camera
// travel, so pausing or leaving the hero also pauses the entrance/departure.
export const CAR_OFFSCREEN = -4;
export function makeCarMotion() {
  return { phase: 'hidden', visible: false, depth: CAR_OFFSCREEN, x: 0, lean: 0,
    startedAt: 0, entryTravel: 0, stoppedAt: 0, stoppedLean: 0 };
}

export function enterCar(car, distance, seconds) {
  car.phase = 'entering'; car.visible = true;
  car.depth = CAR_OFFSCREEN; car.x = car.lean = 0;
  car.startedAt = distance; car.entryTravel = Math.max(.1, seconds) * SPEED;
}

export function hideCar(car) {
  car.phase = 'hidden'; car.visible = false; car.depth = CAR_OFFSCREEN;
}

export function advanceCar(car, distance, runner) {
  if (car.phase === 'entering') {
    const t = Math.min(1, Math.max(0, (distance - car.startedAt) / car.entryTravel));
    car.depth = CAR_OFFSCREEN + (CAR_DEPTH - CAR_OFFSCREEN) * (1 - (1 - t) ** 3);
    if (t >= 1) car.phase = 'driving';
  }
  if (car.phase === 'driving') {
    car.depth = CAR_DEPTH; car.x = runner.x; car.lean = runner.lean;
  } else if (car.phase === 'exiting') {
    // Fixed world position: camera distance + car depth stays constant.
    car.depth = car.stoppedAt - distance;
    car.lean = car.stoppedLean * Math.exp(-(distance - car.startedAt) / (SPEED * .16));
    if (car.depth <= CAR_OFFSCREEN) hideCar(car);
  }
}

export function parkCar(car, distance, runner) {
  advanceCar(car, distance, runner);
  if (!car.visible) return;
  car.phase = 'exiting'; car.startedAt = distance;
  car.stoppedAt = distance + car.depth; car.stoppedLean = car.lean;
}
