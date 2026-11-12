export const drivers = [
  { id: 'D1', name: 'Arun Kumar', status: 'busy', x: 20, y: 30, load: 1, orderId: 'O1', phone: '98400 11111' },
  { id: 'D2', name: 'Priya S', status: 'busy', x: 70, y: 25, load: 1, orderId: 'O2', phone: '98400 22222' },
  { id: 'D3', name: 'Karthik R', status: 'available', x: 45, y: 55, load: 0, orderId: null, phone: '98400 33333' },
  { id: 'D4', name: 'Divya M', status: 'available', x: 80, y: 75, load: 0, orderId: null, phone: '98400 44444' },
  { id: 'D5', name: 'Suresh B', status: 'offline', x: 15, y: 80, load: 0, orderId: null, phone: '98400 55555' },
];
export const orders = [
  { id: 'O1', customer: 'Meena Stores', pickup: { x: 15, y: 25, label: 'Hub A' }, drop: { x: 60, y: 60, label: 'T Nagar' }, status: 'in_transit', driverId: 'D1', priority: 'high' },
  { id: 'O2', customer: 'Raj Bakery', pickup: { x: 75, y: 20, label: 'Hub B' }, drop: { x: 30, y: 85, label: 'Adyar' }, status: 'in_transit', driverId: 'D2', priority: 'normal' },
  { id: 'O3', customer: 'Fresh Mart', pickup: { x: 40, y: 50, label: 'Hub C' }, drop: { x: 85, y: 40, label: 'Anna Nagar' }, status: 'pending', driverId: null, priority: 'high' },
  { id: 'O4', customer: 'Green Pharmacy', pickup: { x: 50, y: 70, label: 'Hub C' }, drop: { x: 10, y: 55, label: 'Velachery' }, status: 'pending', driverId: null, priority: 'normal' },
];
export const alerts = [
  { id: 'A1', type: 'delay', orderId: 'O2', msg: 'Order O2 is running 12 min late (traffic).', suggestion: 'Notify customer and keep driver D2.' },
  { id: 'A2', type: 'driver_unavailable', orderId: 'O4', msg: 'Driver D5 went offline before pickup of O4.', suggestion: 'Reassign O4 to Karthik R (D3), 6 km away.' },
];
