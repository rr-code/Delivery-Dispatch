export const ACTIVE_STATUSES = ["assigned", "picked_up", "in_transit"];
export const DRIVER_STATUSES = ["available", "busy", "offline", "on_break"];
export const UNAVAILABLE_STATUSES = ["offline", "on_break"];
export const VEHICLES = ["bike", "scooter", "car", "van"];
export const PRIORITIES = ["normal", "urgent"];

// Allowed delivery status transitions (anything else is rejected with 409)
export const TRANSITIONS = {
  assigned: ["picked_up", "failed", "cancelled"],
  picked_up: ["in_transit", "delivered", "failed"],
  in_transit: ["delivered", "failed"],
};

// Used only by the GPS simulation
export const VEHICLE_SPEED_KMH = { bike: 18, scooter: 28, car: 35, van: 30 };
